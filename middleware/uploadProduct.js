const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const fs = require('fs');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create Cloudinary storage
const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Get product name for folder organization
    const productName = req.body.name || 'product';
    const sanitizedName = productName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    return {
      folder: `products/${sanitizedName}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'], // ✅ Added 'avif'
      transformation: [
        { width: 800, height: 800, crop: 'limit', quality: 'auto' }
      ],
      public_id: `${Date.now()}-${Math.round(Math.random() * 1E9)}`
    };
  }
});

// File filter for images only - ✅ Added avif support
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|avif/; // ✅ Added avif
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp, avif)'));
  }
};

// Create multer instance
const uploadProduct = multer({
  storage: productStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Increased to 10MB for AVIF files
    files: 5 // Max 5 files
  },
  fileFilter: fileFilter
});

// Helper function to delete image from Cloudinary
const deleteCloudinaryImage = async (imageUrl) => {
  try {
    if (!imageUrl) return;
    
    // Extract public_id from Cloudinary URL
    const urlParts = imageUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    const publicId = `products/${urlParts[urlParts.length - 2]}/${filename.split('.')[0]}`;
    
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('Cloudinary delete result:', result);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

// Helper function to delete multiple images
const deleteMultipleCloudinaryImages = async (imageUrls) => {
  const deletePromises = imageUrls.map(url => deleteCloudinaryImage(url));
  await Promise.all(deletePromises);
};

module.exports = { 
  uploadProduct,
  deleteCloudinaryImage,
  deleteMultipleCloudinaryImages,
  cloudinary
};