const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const mongoose = require('mongoose');

// Route imports
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const contactRoutes = require('./routes/contactRoutes');
const orderRoutes = require('./routes/orderRoutes');

dotenv.config();
connectDB();

const app = express();

// ============ SIMPLE CORS - NO WILDCARD ISSUES ============
// Use a function that returns true for all origins instead of '*'
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusMap = { 0: 'Disconnected', 1: 'Connected', 2: 'Connecting', 3: 'Disconnecting' };
  
  res.status(200).json({ 
    status: 'OK', 
    message: 'WQAR Perfumes API is running',
    timestamp: new Date().toISOString(),
    database: dbStatusMap[dbStatus] || 'Unknown',
    environment: process.env.NODE_ENV || 'development'
  });
});

// ============ YOUR ROUTES ============
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/orders', orderRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'WQAR Perfumes API is running...',
    endpoints: {
      users: '/api/users',
      products: '/api/products',
      contact: '/api/contact',
      orders: '/api/orders',
      health: '/api/health'
    }
  });
});

// Error handler (NO wildcard here!)
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error'
  });
});

// 404 handler - use a function, NOT '*'
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.originalUrl} not found` 
  });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📍 API URL: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ CORS enabled for all origins\n`);
});