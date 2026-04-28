const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const mongoose = require('mongoose');
const { cloudinary } = require('./middleware/uploadProduct'); // Add Cloudinary import

// Route imports
const userRoutes = require('./routes/userRoutes');
const productRoutes = require('./routes/productRoutes');
const contactRoutes = require('./routes/contactRoutes');
const orderRoutes = require('./routes/orderRoutes');

dotenv.config();

connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ CORS CONFIGURATION
const allowedOrigins = [
  'http://localhost:8080',      
  'http://localhost:3000',
  'http://localhost:5000',
  'https://wqar-3k5u.vercel.app', 
  'https://www.wiqar-perfume.com',
  'https://wiqar-perfume.com',
  'http://www.wiqar-perfume.com',
  'http://wiqar-perfume.com',
  /\.vercel\.app$/  
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });
    
    if (!isAllowed) {
      console.warn(`CORS blocked request from: ${origin}`);
      const msg = 'CORS policy does not allow access from this origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Static folder for uploads (for backward compatibility with old images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================
// CLOUDINARY CONFIGURATION CHECK
// =============================================
console.log('\n========================================');
console.log('📸 CLOUDINARY CONFIGURATION CHECK');
console.log('========================================');
if (process.env.CLOUDINARY_CLOUD_NAME) {
  console.log(`✅ Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`✅ API Key: ${process.env.CLOUDINARY_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`✅ API Secret: ${process.env.CLOUDINARY_API_SECRET ? '✓ Set' : '✗ Missing'}`);
  console.log('✅ Cloudinary is configured correctly');
} else {
  console.warn('⚠️ WARNING: Cloudinary environment variables are missing!');
  console.warn('   Image uploads will fail. Add to .env:');
  console.warn('   CLOUDINARY_CLOUD_NAME=your_cloud_name');
  console.warn('   CLOUDINARY_API_KEY=your_api_key');
  console.warn('   CLOUDINARY_API_SECRET=your_api_secret');
}
console.log('========================================\n');

// =============================================
// SENDGRID CONFIGURATION CHECK
// =============================================
console.log('📧 SENDGRID CONFIGURATION CHECK');
console.log('========================================');
if (process.env.SENDGRID_API_KEY) {
  console.log(`✅ SendGrid API Key: ${process.env.SENDGRID_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`✅ From Email: ${process.env.FROM_EMAIL || 'noreply@wiqar-perfume.com'}`);
  console.log(`✅ Admin Email: ${process.env.ADMIN_EMAIL || 'admin@wiqar-perfume.com'}`);
  console.log('✅ SendGrid is configured correctly');
} else {
  console.warn('⚠️ WARNING: SendGrid environment variables are missing!');
  console.warn('   Email notifications will fail. Add to .env:');
  console.warn('   SENDGRID_API_KEY=your_sendgrid_api_key');
  console.warn('   FROM_EMAIL=noreply@yourdomain.com');
  console.warn('   ADMIN_EMAIL=admin@yourdomain.com');
}
console.log('========================================\n');

// =============================================
// HEALTH CHECK ENDPOINT
// =============================================
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const dbStatusMap = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };
  
  res.status(200).json({ 
    status: 'OK', 
    message: 'WIQAR Perfumes API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatusMap[dbStatus] || 'Unknown',
    environment: process.env.NODE_ENV || 'development',
    cloudinary: {
      configured: !!process.env.CLOUDINARY_CLOUD_NAME,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'Not configured'
    },
    sendgrid: {
      configured: !!process.env.SENDGRID_API_KEY,
      fromEmail: process.env.FROM_EMAIL || 'Not configured'
    },
    memory: {
      usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  });
});

// =============================================
// CLOUDINARY TEST ENDPOINT (Optional)
// =============================================
app.get('/api/cloudinary-test', async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cloudinary is not configured' 
      });
    }
    
    // Test Cloudinary connection by getting account usage
    const accountInfo = await cloudinary.api.ping();
    
    res.json({ 
      success: true, 
      message: 'Cloudinary is working!',
      response: accountInfo
    });
  } catch (error) {
    console.error('Cloudinary test error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Cloudinary connection failed',
      error: error.message 
    });
  }
});

// =============================================
// ROUTES
// =============================================
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/orders', orderRoutes);

app.get('/', (req, res) => {
  res.json({
    name: 'WIQAR Perfumes API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      products: '/api/products',
      orders: '/api/orders',
      users: '/api/users',
      contact: '/api/contact',
      health: '/api/health',
      cloudinaryTest: '/api/cloudinary-test'
    }
  });
});

// =============================================
// 404 Handler for undefined routes
// =============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// =============================================
// Global Error Handling Middleware
// =============================================
app.use((err, req, res, next) => {
  console.error('Global error handler caught:', err);
  
  // Handle specific error types
  if (err.name === 'MulterError') {
    if (err.code === 'FILE_TOO_LARGE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB per file.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 5 files per upload.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }
  
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Authentication token expired'
    });
  }
  
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
  console.log(`📸 Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`📧 SendGrid: ${process.env.SENDGRID_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🌐 CORS enabled for origins: ${allowedOrigins.join(', ')}\n`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});