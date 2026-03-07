const router = require('express').Router();

// PUT /api/patient/profile
router.put('/profile', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 3' });
});

// GET /api/patient/profile
router.get('/profile', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 3' });
});

module.exports = router;
