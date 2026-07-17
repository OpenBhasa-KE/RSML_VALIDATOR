const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./database/connection');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.originalUrl}`);
    next();
});

// Import Routes
const loginRoutes = require('./modules/login');
const registerRoutes = require('./modules/register');
const adminRoutes = require('./modules/admin');
const viewerRoutes = require('./modules/viewer');

// Use Routes
app.use('/auth/login', loginRoutes);
app.use('/auth/register', registerRoutes);
app.use('/admin', adminRoutes);
app.use('/viewer', viewerRoutes);

// Health Check
app.get('/', (req, res) => {
    res.send('API is running...');
});

// Global error handler — catches anything not handled by a route/middleware
app.use((err, req, res, next) => {
    console.error(`[Global Error] ${req.method} ${req.originalUrl}:`, err);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
