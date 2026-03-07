const router = require('express').Router();

// POST /api/blood-report/upload  — upload image + run Blood Report Agent
router.post('/upload', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 7 — Blood Report Agent' });
});

// GET /api/blood-report/:id
router.get('/:id', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 8' });
});

module.exports = router;
