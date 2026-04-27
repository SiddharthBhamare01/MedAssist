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

  // Match frontend's max of 50 mi (~80 km); hard cap at 100 km to stay within Overpass limits
  const radiusMeters = Math.min(parseInt(radius, 10) || 10000, 100000);

  // Propagate client disconnect to stop Overpass fetches early
  const clientCtrl = new AbortController();
  req.on('close', () => clientCtrl.abort());

  const clientGone = () => clientCtrl.signal.aborted || res.writableEnded;

  try {
    let doctors = [];

    if (source === 'db') {
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
      doctors = await getNearbyDoctors(userLat, userLng, radiusMeters, clientCtrl.signal);
    }

    if (clientGone()) return; // client already moved on — nothing to send

    if (specialty && specialty.trim() && specialty !== 'All Specializations') {
      const filter = specialty.trim().toLowerCase();
      doctors = doctors.filter(d =>
        d.specialization && d.specialization.toLowerCase().includes(filter)
      );
    }

    res.json({ doctors, total: doctors.length, source });
  } catch (err) {
    // Client disconnected — nothing to send, not an error
    if (clientGone()) return;

    const isCircuitOpen   = err.message.startsWith('Overpass circuit open');
    const isClientAbort   = err.message.includes('Client disconnected');
    const isOverpassError = source === 'osm' && !isClientAbort;

    // Only log genuine unexpected failures; circuit-open skips are expected/silent
    if (!isCircuitOpen && !isClientAbort) {
      console.error('[doctors] OSM fetch failed:', err.message);
    }

    if (isOverpassError) {
      // Silent fallback to DB — no warn log during circuit-open period
      try {
        const result = await pool.query(`
          SELECT dp.id, u.full_name AS name, dp.specialization, dp.hospital_name,
                 dp.city, dp.state, dp.latitude, dp.longitude, dp.phone, dp.available
          FROM doctor_profiles dp
          JOIN users u ON u.id = dp.user_id
          WHERE dp.latitude IS NOT NULL AND dp.longitude IS NOT NULL AND dp.available = TRUE
        `);
        const doctors = sortByDistance(result.rows, userLat, userLng);
        if (!clientGone()) res.json({ doctors, total: doctors.length, source: 'db_fallback' });
        return;
      } catch (dbErr) {
        console.error('[doctors] DB fallback also failed:', dbErr.message);
      }
    }

    if (!clientGone()) res.status(500).json({ error: 'Failed to fetch nearby doctors' });
  }
});

module.exports = router;
