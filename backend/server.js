require('dotenv').config();
// Error tracking: auto-initializes from FAULTLINE_API_KEY / FAULTLINE_ENDPOINT in .env
require('faultline-tracker');

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/authRoutes');
const notesRoutes = require('./routes/notesRoutes');
const billingRoutes = require('./routes/billingRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

app.disable('x-powered-by');
app.use(express.json({ limit : '1mb' }));
app.use(cookieParser());

// API
app.use('/api/auth', authRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api', notFound);

// Frontend (plain HTML/CSS/JS, served from the same origin as the API)
app.use(express.static(FRONTEND_DIR));
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
