const fetch = require('node-fetch');

/**
 * Nominatim fallback for nearby healthcare providers.
 *
 * Why this exists: the Overpass API is the primary source and is the better one
 * — one query returns every facility in a radius. But Overpass is reachable far
 * less reliably than the rest of OpenStreetMap's infrastructure. On networks
 * that filter it (observed 2026-10-19: `GET https://overpass.kumi.systems/`
 * answers 200 while every `/api/*` path hangs, and overpass-api.de fails TLS
 * outright) the clinics page could only ever show an error panel. Nominatim
 * answered normally on the same network, so it is the difference between a
 * working feature and a dead one.
 *
 * It is a fallback and not a peer, for two reasons that matter:
 *   - It is a *search* API, not a spatial query. There is no "everything within
 *     N metres"; we ask for a category inside a bounding box, once per category,
 *     and take what comes back. Recall is lower than Overpass by design.
 *   - Its usage policy caps clients at one request per second and requires an
 *     identifying User-Agent. That is why the categories below are a short list
 *     queried in sequence rather than a fan-out, and why results are cached.
 *
 * Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// OSM policy requires identifying the app.
const USER_AGENT = 'MedAssist/1.0 (CS595 academic project; contact: sbhamare1@hawk.illinoistech.edu)';

const REQUEST_TIMEOUT_MS = 12000;

// Nominatim allows at most 1 req/s. 1100ms leaves headroom for clock skew.
const MIN_REQUEST_SPACING_MS = 1100;

// Per-category result cap. Nominatim's own maximum is 50.
const LIMIT_PER_CATEGORY = 25;

/**
 * The categories we ask for, and the display category each maps onto.
 * Deliberately short: every entry costs a second of wall-clock time, so these
 * are the ones a patient looking at an anemia result would actually want —
 * somewhere to get a blood draw, somewhere to be seen, somewhere to collect a
 * prescription. Dental, physiotherapy and optometry are left to Overpass.
 */
const SEARCH_CATEGORIES = [
  { term: 'hospital',           specialization: 'Hospital' },
  { term: 'clinic',             specialization: 'Clinic' },
  { term: 'medical laboratory', specialization: 'Lab & Diagnostics' },
  { term: 'doctors',            specialization: 'General Physician' },
  { term: 'pharmacy',           specialization: 'Pharmacy' },
];

let lastRequestAt = 0;

/** Space requests out to honour the 1 req/s policy. */
async function throttle() {
  const waitMs = lastRequestAt + MIN_REQUEST_SPACING_MS - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
}

/**
 * Bounding box enclosing a circle of `radiusMeters` around a point.
 *
 * Nominatim has no radius parameter, so the circle becomes the smallest box
 * that contains it. The box is larger than the circle at the corners, so
 * callers must still filter by true distance afterwards — getNearbyDoctors
 * does, via sortByDistance and an explicit radius cut.
 *
 * viewbox order is Nominatim's own: left,top,right,bottom (lon,lat,lon,lat).
 */
function boundingBox(lat, lng, radiusMeters) {
  const latDelta = radiusMeters / 111_320;
  // Longitude degrees shrink with latitude; guard the poles so cos() never hits 0.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const lngDelta = radiusMeters / (111_320 * cosLat);
  return {
    left:   lng - lngDelta,
    top:    lat + latDelta,
    right:  lng + lngDelta,
    bottom: lat - latDelta,
  };
}

async function searchCategory(term, box, clientSignal) {
  if (clientSignal?.aborted) throw new Error('Client disconnected');
  await throttle();

  const params = new URLSearchParams({
    q: term,
    format: 'jsonv2',
    limit: String(LIMIT_PER_CATEGORY),
    bounded: '1',
    addressdetails: '1',
    extratags: '1',
    viewbox: `${box.left},${box.top},${box.right},${box.bottom}`,
  });

  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), REQUEST_TIMEOUT_MS);
  const onClientAbort = () => timeoutCtrl.abort();
  clientSignal?.addEventListener('abort', onClientAbort, { once: true });

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: timeoutCtrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } finally {
    clearTimeout(timer);
    clientSignal?.removeEventListener('abort', onClientAbort);
  }
}

/**
 * Map one Nominatim result onto the shape the clinics route already returns,
 * so the client needs no knowledge of which provider answered.
 *
 * `fallbackSpecialization` is the category we searched for. The result's own
 * category/type tags win when they are recognisable, because a search for
 * "clinic" legitimately returns hospitals.
 */
function mapResult(result, fallbackSpecialization) {
  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // `name` is absent on results matched only by address; display_name's first
  // comma-separated part is the place itself, so it is the right stand-in.
  const name = result.name || String(result.display_name || '').split(',')[0].trim();
  if (!name) return null;

  const addr = result.address || {};
  const extra = result.extratags || {};
  const addressParts = [addr.house_number, addr.road].filter(Boolean);

  return {
    id:             `nominatim-${result.osm_type || 'place'}-${result.osm_id || result.place_id}`,
    name,
    specialization: categoryFor(result, fallbackSpecialization),
    speciality:     extra['healthcare:speciality'] || null,
    hospital_name:  name,
    address:        addressParts.length ? addressParts.join(' ') : null,
    city:           addr.city || addr.town || addr.village || addr.suburb || null,
    state:          addr.state || null,
    latitude:       lat,
    longitude:      lng,
    phone:          extra.phone || extra['contact:phone'] || null,
    website:        extra.website || extra['contact:website'] || null,
    available:      true,
    source:         'nominatim',
  };
}

/** Prefer the place's own tags; fall back to the category we searched for. */
function categoryFor(result, fallbackSpecialization) {
  const type = String(result.type || '').toLowerCase();
  const healthcare = String((result.extratags || {}).healthcare || '').toLowerCase();

  const byTag = {
    hospital:        'Hospital',
    clinic:          'Clinic',
    doctors:         'General Physician',
    doctor:          'General Physician',
    pharmacy:        'Pharmacy',
    laboratory:      'Lab & Diagnostics',
    blood_bank:      'Blood Bank',
    dentist:         'Dental',
    physiotherapist: 'Physiotherapy',
    optometrist:     'Ophthalmology',
    centre:          'Health Centre',
  };

  return byTag[type] || byTag[healthcare] || fallbackSpecialization || 'Healthcare Provider';
}

/**
 * Search Nominatim for healthcare providers near a point.
 *
 * Categories are queried in sequence because of the rate limit. A category that
 * fails is skipped rather than failing the whole search — a partial list is
 * worth far more to a patient than an error panel. The call only rejects when
 * every category failed, which means Nominatim itself is unreachable.
 *
 * @returns {Promise<Array>} provider records in the clinics-route shape
 */
async function searchHealthcare(lat, lng, radiusMeters, clientSignal = null) {
  const box = boundingBox(lat, lng, radiusMeters);
  const places = [];
  const failures = [];

  for (const { term, specialization } of SEARCH_CATEGORIES) {
    try {
      const results = await searchCategory(term, box, clientSignal);
      for (const r of results) {
        const mapped = mapResult(r, specialization);
        if (mapped) places.push(mapped);
      }
      console.log(`[nominatim] "${term}" → ${results.length} result(s)`);
    } catch (err) {
      if (clientSignal?.aborted) throw new Error('Client disconnected');
      failures.push(`${term}: ${err.name === 'AbortError' ? 'timed out' : err.message}`);
      console.warn(`[nominatim] "${term}" failed: ${err.message}`);
    }
  }

  if (!places.length && failures.length === SEARCH_CATEGORIES.length) {
    throw new Error(`Nominatim unreachable (${failures.join('; ')})`);
  }

  return places;
}

module.exports = { searchHealthcare };
