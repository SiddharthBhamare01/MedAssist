const router = require('express').Router();

// POST /api/disease/predict  — runs Diagnostic Agent
router.post('/predict', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 4 — Diagnostic Agent' });
});

// POST /api/disease/tests  — get recommended blood tests for selected disease
router.post('/tests', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 5' });
});

module.exports = router;
