const router = require('express').Router();

// POST /api/doctor-assist/suggest-tests  — runs Doctor Assist Agent
router.post('/suggest-tests', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 10 — Doctor Assist Agent' });
});

// GET /api/doctor-assist/sessions  — recent sessions for a doctor
router.get('/sessions', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 10' });
});

module.exports = router;
