const router = require('express').Router();

// GET /api/doctors/nearby?lat=&lng=&specialty=
router.get('/nearby', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 9' });
});

module.exports = router;
