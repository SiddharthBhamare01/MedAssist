const fetch = require('node-fetch');
const { sortByDistance } = require('./locationService');

// Public Overpass API mirrors — tried in order
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Simple in-memory cache: key → { data, expiresAt }
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(lat, lng, radiusMeters) {
  // Round to ~1 km grid so nearby requests reuse cached results
  return `${lat.toFixed(2)},${lng.toFixed(2)},${radiusMeters}`;
}

function buildQuery(lat, lng, radiusMeters) {
  return `
[out:json][timeout:30];
(
  node["amenity"~"^(doctors|clinic|hospital)$"](around:${radiusMeters},${lat},${lng});
  node["healthcare"~"^(doctor|clinic|hospital)$"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"^(clinic|hospital)$"](around:${radiusMeters},${lat},${lng});
);
out center body;
`;
}

/**
 * Try each Overpass mirror with a 20-second timeout.
 * Returns parsed JSON or throws if all mirrors fail.
 */
async function fetchFromOverpass(query) {
  const body = `data=${encodeURIComponent(query)}`;
  let lastErr;

  for (const url of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.status === 429) {
        // Rate-limited on this mirror — try next
        lastErr = new Error(`429 from ${url}`);
        continue;
      }
      if (!response.ok) {
        lastErr = new Error(`${response.status} from ${url}`);
        continue;
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      console.warn(`Overpass mirror failed (${url}):`, err.message);
    }
  }

  throw lastErr || new Error('All Overpass mirrors failed');
}

/**
 * Return nearby healthcare providers from OpenStreetMap via Overpass API.
 * Results are cached for 5 minutes per lat/lng/radius bucket.
 */
async function getNearbyDoctors(lat, lng, radiusMeters = 10000) {
  const key = cacheKey(lat, lng, radiusMeters);

  // Return cached result if still fresh
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[osmService] cache hit for ${key}`);
    return cached.data;
  }

  const query = buildQuery(lat, lng, radiusMeters);
  const json   = await fetchFromOverpass(query);
  const elements = json.elements || [];

  const doctors = elements
    .map(el => {
      const tags = el.tags || {};
      const name = tags.name || tags['name:en'] || null;
      if (!name) return null;

      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon  ?? el.center?.lon;
      if (!elLat || !elLng) return null;

      const specialty =
        tags['healthcare:speciality'] ||
        tags['speciality']            ||
        tags['specialty']             ||
        mapAmenityToSpecialty(tags.amenity, tags.healthcare);

      const addressParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);

      return {
        id:             `osm-${el.type}-${el.id}`,
        name,
        specialization: specialty,
        hospital_name:  name,
        address:        addressParts.length ? addressParts.join(' ') : null,
        city:           tags['addr:city']  || tags['addr:town'] || null,
        state:          tags['addr:state'] || null,
        latitude:       elLat,
        longitude:      elLng,
        phone:          tags.phone || tags['contact:phone'] || null,
        website:        tags.website || tags['contact:website'] || null,
        available:      true,
        source:         'openstreetmap',
      };
    })
    .filter(Boolean);

  // Deduplicate by name + rounded position
  const seen   = new Set();
  const unique = doctors.filter(d => {
    const k = `${d.name}|${d.latitude.toFixed(3)}|${d.longitude.toFixed(3)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const sorted = sortByDistance(unique, lat, lng);

  // Store in cache
  cache.set(key, { data: sorted, expiresAt: Date.now() + CACHE_TTL_MS });
  // Evict old entries if cache grows large
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0][0];
    cache.delete(oldest);
  }

  return sorted;
}

function mapAmenityToSpecialty(amenity, healthcare) {
  if (amenity === 'hospital')   return 'Hospital';
  if (amenity === 'clinic')     return 'Clinic';
  if (amenity === 'doctors')    return 'General Physician';
  if (healthcare === 'doctor')  return 'General Physician';
  if (healthcare === 'clinic')  return 'Clinic';
  if (healthcare === 'hospital')return 'Hospital';
  return 'Healthcare Provider';
}

module.exports = { getNearbyDoctors };
