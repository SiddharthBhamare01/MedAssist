const router = require('express').Router();

// GET /api/agent/status/:sessionId  — SSE stream of live agent steps
router.get('/status/:sessionId', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 5 — SSE Agent Status' });
});

// GET /api/agent/logs/:sessionId  — agent tool call audit log
router.get('/logs/:sessionId', (req, res) => {
  res.status(501).json({ message: 'Coming in Day 11' });
});

module.exports = router;
