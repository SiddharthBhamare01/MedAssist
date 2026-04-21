require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

// CORS — allow React dev server
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate limiting for agent routes (agents make multiple API calls per request)
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests to AI agent. Please wait a moment.' }
});

// Auth rate limiting — prevent brute force and email spam
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // 20 auth attempts per 15 min per IP
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});
const emailLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 3,                     // max 3 verification/reset emails per minute
  message: { error: 'Too many email requests. Please wait a minute.' },
});

// Routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/auth/resend-verification', emailLimiter);
app.use('/api/auth/forgot-password', emailLimiter);
app.use('/api/patient', require('./routes/patient'));
app.use('/api/disease', agentLimiter, require('./routes/disease'));
app.use('/api/blood-report', agentLimiter, require('./routes/bloodReport'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/doctor-assist', require('./routes/doctorAssist'));
app.use('/api/agent', require('./routes/agentStatus'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/shared', require('./routes/shared'));
app.use('/api/voice',  require('./routes/voice'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MedAssist server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
