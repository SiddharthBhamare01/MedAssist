const fetch = require('node-fetch');
const { sortByDistance, haversineDistance } = require('./locationService');
const { searchHealthcare } = require('./nominatimService');

const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

// OSM API policy requires identifying the app; some mirrors reject requests without it
const USER_AGENT = 'MedAssist/1.0 (CS595 academic project; contact: sbhamare1@hawk.illinoistech.edu)';

/**
 * Per-mirror timeout. All mirrors race in parallel, so the worst case is one
 * timeout rather than three.
 *
 * It has to sit just above the `[timeout:]` we ask Overpass for — below it we
 * abort the mirror before it can tell us it gave up, and far above it we make
 * the user wait out a hang for no extra information. A filtered network gives
 * no fast signal at all: the connection simply never answers, so this ceiling
 * is what the first page load costs before the Nominatim fallback starts. The
 * circuit breaker is what keeps it from being paid again on the next request.
 */
function mirrorTimeoutFor(radiusMeters) {
  return overpassTimeoutFor(radiusMeters) * 1000 + 4000;
}

/**
 * Circuit breaker: after every mirror fails, skip Overpass for this long.
 *
 * Deliberately short. It was ten minutes, which outlived the outages it was
 * meant to absorb — one bad window silently poisoned every request for the next
 * ten, long after the network recovered, and the page looked broken rather than
 * slow. Two minutes is long enough to stop hammering dead mirrors and short
 * enough that a user who waits and retries sees the recovery.
 */
const CIRCUIT_RESET_MS = 2 * 60 * 1000;
let circuitOpenUntil = 0;

// Why the mirrors last failed, kept so the route can tell the user something
// more useful than "all mirrors failed".
let lastMirrorFailures = [];

// In-memory cache: long TTL so a single successful call serves many subsequent requests
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(lat, lng, radiusMeters) {
  return `${lat.toFixed(2)},${lng.toFixed(2)},${radiusMeters}`;
}

/**
 * Overpass's own server-side time budget, scaled to the search area.
 *
 * A fixed 12s was fine at 2 miles and not at 50, where the query covers an area
 * 625 times larger: Overpass would hit its own limit and return an error, which
 * read to the user as "no clinics near you".
 */
function overpassTimeoutFor(radiusMeters) {
  if (radiusMeters > 48000) return 25; // ~30 mi and up
  if (radiusMeters > 24000) return 18; // ~15 mi and up
  return 12;
}

function buildQuery(lat, lng, radiusMeters) {
  const around = `around:${radiusMeters},${lat},${lng}`;
  // Relations matter: a hospital campus is frequently mapped as a multipolygon
  // relation rather than a node or a single way, and querying only nodes and
  // ways dropped exactly the large hospitals a patient is most likely to want.
  return `
[out:json][timeout:${overpassTimeoutFor(radiusMeters)}];
(
  node["amenity"~"^(doctors|clinic|hospital|pharmacy|dentist|physiotherapist|optometrist|laboratory|blood_bank)$"](${around});
  node["healthcare"~"^(doctor|clinic|hospital|pharmacy|dentist|physiotherapist|optometrist|laboratory|blood_bank|centre|yes)$"](${around});
  way["amenity"~"^(doctors|clinic|hospital|pharmacy|laboratory|blood_bank)$"](${around});
  way["healthcare"~"^(doctor|clinic|hospital|laboratory|blood_bank|centre)$"](${around});
  relation["amenity"~"^(clinic|hospital|laboratory)$"](${around});
  relation["healthcare"~"^(clinic|hospital|laboratory|centre)$"](${around});
);
out center body;
`;
}

/**
 * Fetch one Overpass mirror. Resolves with parsed JSON or rejects on any failure.
 * Aborted immediately if clientSignal fires.
 */
async function fetchMirror(url, body, clientSignal, timeoutMs) {
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

  const onClientAbort = () => timeoutCtrl.abort();
  clientSignal?.addEventListener('abort', onClientAbort, { once: true });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body,
      signal: timeoutCtrl.signal,
    });

    if (!res.ok) {
      console.warn(`[osmService] mirror failed (${url}): ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    console.log(`[osmService] mirror succeeded: ${url}`);
    return json;
  } catch (err) {
    if (clientSignal?.aborted) throw new Error('Client disconnected');

    // Distinguish the failure modes, because they have different fixes and the
    // generic message sent users hunting for the wrong one. A filtered network
    // shows up as a hang or a TLS error rather than an HTTP status.
    let reason;
    if (err.name === 'AbortError') {
      reason = `no response in ${timeoutMs / 1000}s (host unreachable, or the API path is filtered)`;
      console.warn(`[osmService] mirror failed (${url}): timed out`);
    } else if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      reason = 'DNS lookup failed';
    } else if (String(err.message).includes('certificate') || err.code?.startsWith?.('ERR_TLS')) {
      reason = `TLS handshake failed (${err.message})`;
    } else {
      reason = err.message;
    }

    const labelled = new Error(reason);
    labelled.mirror = new URL(url).host;
    throw labelled;
  } finally {
    clearTimeout(timer);
    clientSignal?.removeEventListener('abort', onClientAbort);
  }
}

/**
 * Race all mirrors in parallel — whichever answers first wins.
 * Promise.any rejects only when every mirror fails (AggregateError).
 */
async function fetchFromOverpass(query, clientSignal, radiusMeters) {
  if (clientSignal?.aborted) throw new Error('Client disconnected');

  if (Date.now() < circuitOpenUntil) {
    const secsLeft = Math.ceil((circuitOpenUntil - Date.now()) / 1000);
    const err = new Error(`Overpass circuit open — retrying in ${secsLeft}s`);
    err.circuitOpen = true;
    err.mirrorFailures = lastMirrorFailures;
    throw err;
  }

  const body = `data=${encodeURIComponent(query)}`;
  const timeoutMs = mirrorTimeoutFor(radiusMeters);
  const attempts = OVERPASS_MIRRORS.map((url) => fetchMirror(url, body, clientSignal, timeoutMs));

  try {
    const json = await Promise.any(attempts);
    circuitOpenUntil = 0;
    lastMirrorFailures = [];
    return json;
  } catch (aggErr) {
    if (clientSignal?.aborted) throw new Error('Client disconnected');

    lastMirrorFailures = (aggErr.errors || []).map((e, i) => ({
      mirror: e.mirror || new URL(OVERPASS_MIRRORS[i]).host,
      reason: e.message,
    }));

    circuitOpenUntil = Date.now() + CIRCUIT_RESET_MS;
    console.warn(
      `[osmService] all mirrors failed — circuit open for ${CIRCUIT_RESET_MS / 1000}s: ` +
      lastMirrorFailures.map((f) => `${f.mirror} (${f.reason})`).join('; ')
    );

    const err = new Error('All Overpass mirrors failed');
    err.mirrorFailures = lastMirrorFailures;
    throw err;
  }
}

/** Map one Overpass element onto a provider record, or null to drop it. */
function mapElement(el) {
  const tags = el.tags || {};
  const name = tags.name || tags['name:en'] || null;
  if (!name) return null;

  const elLat = el.lat ?? el.center?.lat;
  const elLng = el.lon ?? el.center?.lon;
  if (!Number.isFinite(elLat) || !Number.isFinite(elLng)) return null;

  const addressParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);

  return {
    id:             `osm-${el.type}-${el.id}`,
    name,
    // The facility category, always one of the known values the interface
    // filters and badges by. This used to prefer the raw OSM speciality tag,
    // which holds values like "general" or "cardiology" — so a hospital tagged
    // `amenity=hospital healthcare:speciality=general` came back as "general",
    // matched none of the filter tabs, and could not be found under Hospital.
    // The category is derived from the tags that define what the place *is*;
    // the speciality is what it is *good at*, and it is reported separately.
    specialization: mapTagsToSpecialty(tags),
    speciality:
      tags['healthcare:speciality'] ||
      tags['speciality'] ||
      tags['specialty'] ||
      null,
    hospital_name:  name,
    address:        addressParts.length ? addressParts.join(' ') : null,
    city:           tags['addr:city'] || tags['addr:town'] || null,
    state:          tags['addr:state'] || null,
    latitude:       elLat,
    longitude:      elLng,
    phone:          tags.phone || tags['contact:phone'] || null,
    website:        tags.website || tags['contact:website'] || null,
    available:      true,
    source:         'openstreetmap',
  };
}

/** Deduplicate by name + position, then order by true distance from the user. */
function dedupeAndSort(places, lat, lng, radiusMeters) {
  const seen = new Set();
  const unique = places.filter((d) => {
    const k = `${d.name.toLowerCase()}|${d.latitude.toFixed(3)}|${d.longitude.toFixed(3)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Overpass honours the radius itself, but Nominatim has no radius parameter —
  // its bounding box overshoots the circle at the corners by up to ~41%. Cut to
  // the true radius here so the page never lists a place outside the circle it
  // has just drawn on the map.
  const withinRadius = unique.filter(
    (d) => haversineDistance(lat, lng, d.latitude, d.longitude) * 1000 <= radiusMeters
  );

  return sortByDistance(withinRadius, lat, lng);
}

/**
 * Return nearby healthcare providers from OpenStreetMap.
 *
 * Overpass is the primary source. When every mirror fails — which on a filtered
 * network is every time, not occasionally — Nominatim is asked instead rather
 * than the page showing an error. The returned object names which provider
 * answered so the interface can say so, because the two do not have the same
 * recall and a patient should not be told a short list is the whole list.
 *
 * @returns {Promise<{places: Array, source: string, degraded: boolean, notes: Array}>}
 */
async function getNearbyDoctors(lat, lng, radiusMeters = 10000, clientSignal = null) {
  const key = cacheKey(lat, lng, radiusMeters);

  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[osmService] cache hit for ${key}`);
    return cached.data;
  }

  let result;

  try {
    const json = await fetchFromOverpass(buildQuery(lat, lng, radiusMeters), clientSignal, radiusMeters);
    const places = (json.elements || []).map(mapElement).filter(Boolean);
    result = {
      places: dedupeAndSort(places, lat, lng, radiusMeters),
      source: 'overpass',
      degraded: false,
      notes: [],
    };
  } catch (overpassErr) {
    if (String(overpassErr.message) === 'Client disconnected') throw overpassErr;

    console.warn(`[osmService] falling back to Nominatim: ${overpassErr.message}`);

    let fallbackPlaces;
    try {
      fallbackPlaces = await searchHealthcare(lat, lng, radiusMeters, clientSignal);
    } catch (nominatimErr) {
      if (String(nominatimErr.message) === 'Client disconnected') throw nominatimErr;
      // Both providers are gone. Surface the Overpass diagnostics, since that
      // is the primary source and the one worth fixing.
      const err = new Error(overpassErr.message);
      err.circuitOpen = overpassErr.circuitOpen;
      err.mirrorFailures = overpassErr.mirrorFailures || lastMirrorFailures;
      err.fallbackError = nominatimErr.message;
      throw err;
    }

    result = {
      places: dedupeAndSort(fallbackPlaces, lat, lng, radiusMeters),
      source: 'nominatim',
      degraded: true,
      notes: [
        'The full map search was unavailable, so this is a narrower search that ' +
        'covers hospitals, clinics, labs, doctors and pharmacies only. Some ' +
        'nearby places may be missing.',
      ],
    };
  }

  // A full result is worth caching for the hour. A degraded one is not: it is
  // the narrower fallback list, and caching it as long would keep showing a
  // partial list for an hour after Overpass came back. Short TTL so recovery
  // is visible, long enough to stop a reload hammering the fallback.
  const ttl = result.degraded ? 3 * 60 * 1000 : CACHE_TTL_MS;
  cache.set(key, { data: result, expiresAt: Date.now() + ttl });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0][0];
    cache.delete(oldest);
  }

  return result;
}

function mapTagsToSpecialty(tags) {
  const amenity    = tags.amenity    || '';
  const healthcare = tags.healthcare || '';

  if (amenity === 'hospital'        || healthcare === 'hospital')        return 'Hospital';
  if (amenity === 'clinic'          || healthcare === 'clinic')          return 'Clinic';
  if (amenity === 'pharmacy'        || healthcare === 'pharmacy')        return 'Pharmacy';
  if (amenity === 'dentist'         || healthcare === 'dentist')         return 'Dental';
  if (amenity === 'doctors'         || healthcare === 'doctor')          return 'General Physician';
  if (amenity === 'physiotherapist' || healthcare === 'physiotherapist') return 'Physiotherapy';
  if (amenity === 'optometrist'     || healthcare === 'optometrist')     return 'Ophthalmology';
  if (amenity === 'laboratory'      || healthcare === 'laboratory')      return 'Lab & Diagnostics';
  if (healthcare === 'blood_bank')                                       return 'Blood Bank';
  if (healthcare === 'centre')                                           return 'Health Centre';
  return 'Healthcare Provider';
}

module.exports = { getNearbyDoctors };
