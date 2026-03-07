const router = require('express').Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 2' });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 2' });
});

module.exports = router;
