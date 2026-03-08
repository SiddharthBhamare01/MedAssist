const router = require('express').Router();
const pool = require('../db/pool');
const { sortByDistance } = require('../services/locationService');
const { getNearbyDoctors } = require('../services/osmService');

/**
 * GET /api/doctors/nearby?lat=&lng=&specialty=&source=osm|db&radius=
 *
 * source=osm (default) — real-time data from OpenStreetMap via Overpass API
 * source=db            — seeded demo doctors from local DB
 * radius               — search radius in metres (default 10000 = 10 km)
 */
router.get('/nearby', async (req, res) => {
  const { lat, lng, specialty, source = 'osm', radius = '10000' } = req.query;

  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);

  if (isNaN(userLat) || isNaN(userLng)) {
    return res.status(400).json({ error: 'lat and lng query params are required and must be numbers' });
  }

  const radiusMeters = Math.min(parseInt(radius, 10) || 10000, 50000); // cap at 50 km

  try {
    let doctors = [];

    if (source === 'db') {
      // ── Seeded demo doctors from Supabase ──────────────────────────────────
      const result = await pool.query(`
        SELECT
          dp.id,
          u.full_name AS name,
          dp.specialization,
          dp.hospital_name,
          dp.city,
          dp.state,
          dp.latitude,
          dp.longitude,
          dp.phone,
          dp.available
        FROM doctor_profiles dp
        JOIN users u ON u.id = dp.user_id
        WHERE dp.latitude IS NOT NULL AND dp.longitude IS NOT NULL
          AND dp.available = TRUE
      `);
      doctors = sortByDistance(result.rows, userLat, userLng);
    } else {
      // ── Real-time OpenStreetMap data via Overpass API ──────────────────────
      doctors = await getNearbyDoctors(userLat, userLng, radiusMeters);
    }

    // Optional specialty filter (case-insensitive substring)
    if (specialty && specialty.trim() && specialty !== 'All Specializations') {
      const filter = specialty.trim().toLowerCase();
      doctors = doctors.filter(d =>
        d.specialization && d.specialization.toLowerCase().includes(filter)
      );
    }

    res.json({ doctors, total: doctors.length, source });
  } catch (err) {
    console.error('GET /api/doctors/nearby error:', err.message);

    // If Overpass fails, fall back to DB seeded data automatically
    if (source === 'osm') {
      console.warn('Overpass API failed — falling back to DB demo data');
      try {
        const result = await pool.query(`
          SELECT dp.id, u.full_name AS name, dp.specialization, dp.hospital_name,
                 dp.city, dp.state, dp.latitude, dp.longitude, dp.phone, dp.available
          FROM doctor_profiles dp
          JOIN users u ON u.id = dp.user_id
          WHERE dp.latitude IS NOT NULL AND dp.longitude IS NOT NULL AND dp.available = TRUE
        `);
        const doctors = sortByDistance(result.rows, userLat, userLng);
        return res.json({ doctors, total: doctors.length, source: 'db_fallback' });
      } catch (dbErr) {
        console.error('DB fallback also failed:', dbErr.message);
      }
    }

    res.status(500).json({ error: 'Failed to fetch nearby doctors' });
  }
});

module.exports = router;
