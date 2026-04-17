const Product = require('../models/product');
const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');

// Helper function to delete old product images
const deleteOldImages = (imagePaths) => {
  if (!imagePaths || !Array.isArray(imagePaths)) return;
  
  imagePaths.forEach(imagePath => {
    if (imagePath && imagePath !== 'default-product.jpg') {
      const fullPath = path.join(__dirname, '..', imagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`Deleted old image: ${fullPath}`);
      }
    }
  });
};

// Helper function to delete a single image
const deleteSingleImage = (imagePath) => {
  if (imagePath && imagePath !== 'default-product.jpg') {
    const fullPath = path.join(__dirname, '..', imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted image: ${fullPath}`);
    }
  }
};

// @desc    Get all products with filtering, sorting, pagination
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      order = 'desc',
      search,
      gender,
      stockStatus,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      featured,
      category
    } = req.query;

    // Build filter object
    const filter = {};

    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { fragrance: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Gender filter
    if (gender && gender !== 'all') {
      filter.gender = gender;
    }

    // Stock status filter
    if (stockStatus && stockStatus !== 'all') {
      if (stockStatus === 'low') {
        filter.stock = { $lt: 20, $gt: 0 };
      } else if (stockStatus === 'out') {
        filter.stock = 0;
      } else if (stockStatus === 'in') {
        filter.stock = { $gt: 0 };
      }
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Featured filter
    if (featured === 'true') {
      filter.featured = true;
    }

    // Category filter
    if (category && category !== 'all') {
      filter.category = category;
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOrder = order === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    // Execute query
    const products = await Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(filter);

    // Get statistics
    const stats = await Product.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalValue: { $sum: { $ifNull: ['$discountedPrice', '$price'] } },
          averagePrice: { $avg: '$price' },
          totalStock: { $sum: '$stock' },
          lowStockCount: { $sum: { $cond: [{ $lt: ['$stock', 20] }, 1, 0] } }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum
      },
      stats: stats[0] || {
        totalProducts: 0,
        totalValue: 0,
        averagePrice: 0,
        totalStock: 0,
        lowStockCount: 0
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching product',
      error: error.message
    });
  }
};

// @desc    Create new product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    console.log('=== CREATE PRODUCT DEBUG ===');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Delete uploaded files if validation fails
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`Deleted file due to validation error: ${file.path}`);
          }
        });
      }
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const productData = { ...req.body };
    
    // Parse JSON fields if they come as strings
    if (typeof productData.quantity === 'string') {
      try {
        productData.quantity = JSON.parse(productData.quantity);
      } catch (e) {
        productData.quantity = productData.quantity.split(',').map(q => q.trim());
      }
    }
    
    if (typeof productData.tags === 'string') {
      try {
        productData.tags = JSON.parse(productData.tags);
      } catch (e) {
        productData.tags = productData.tags.split(',').map(tag => tag.trim());
      }
    }

    // Handle image uploads - req.files is an array directly
    if (req.files && req.files.length > 0) {
      const uploadedImages = [];
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        // Convert Windows backslashes to forward slashes for URL
        const relativePath = file.path.replace(/\\/g, '/');
        uploadedImages.push({
          url: relativePath, // This will be 'uploads/products/product-xxx.jpg'
          isPrimary: i === 0 // First image is primary
        });
        console.log(`Image ${i + 1} saved at: ${relativePath}`);
      }
      
      productData.images = uploadedImages;
      console.log('Images to save:', JSON.stringify(uploadedImages, null, 2));
    } else {
      console.log('No images uploaded');
      productData.images = [];
    }

    const product = await Product.create(productData);
    console.log('Product created successfully with ID:', product._id);
    console.log('Saved images in DB:', JSON.stringify(product.images, null, 2));
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('Error in createProduct:', error);
    // Delete uploaded files if there's an error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log(`Deleted file due to error: ${file.path}`);
        }
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    console.log('=== UPDATE PRODUCT DEBUG ===');
    console.log('Product ID:', req.params.id);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    let product = await Product.findById(req.params.id);
    
    if (!product) {
      // Delete uploaded files if product not found
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`Deleted file because product not found: ${file.path}`);
          }
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const updateData = { ...req.body };
    
    // Parse JSON fields
    if (updateData.quantity && typeof updateData.quantity === 'string') {
      try {
        updateData.quantity = JSON.parse(updateData.quantity);
      } catch (e) {
        updateData.quantity = updateData.quantity.split(',').map(q => q.trim());
      }
    }
    
    if (updateData.tags && typeof updateData.tags === 'string') {
      try {
        updateData.tags = JSON.parse(updateData.tags);
      } catch (e) {
        updateData.tags = updateData.tags.split(',').map(tag => tag.trim());
      }
    }

    // Convert string numbers to actual numbers
    if (updateData.price) {
      updateData.price = parseFloat(updateData.price);
    }
    if (updateData.discountedPrice) {
      updateData.discountedPrice = parseFloat(updateData.discountedPrice);
    }
    if (updateData.stock) {
      updateData.stock = parseInt(updateData.stock);
    }
    if (updateData.rating) {
      updateData.rating = parseFloat(updateData.rating);
    }

    // Convert string booleans to actual booleans
    if (updateData.featured === 'true') updateData.featured = true;
    if (updateData.featured === 'false') updateData.featured = false;
    if (updateData.inStock === 'true') updateData.inStock = true;
    if (updateData.inStock === 'false') updateData.inStock = false;

    // IMPORTANT: Validate discounted price before updating
    const originalPrice = updateData.price || product.price;
    const discountedPrice = updateData.discountedPrice;
    
    if (discountedPrice && discountedPrice >= originalPrice) {
      // Delete uploaded files if validation fails
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Discounted price must be less than original price'
      });
    }

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      // Delete old images
      const oldImagePaths = product.images.map(img => img.url);
      deleteOldImages(oldImagePaths);
      
      const uploadedImages = [];
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const relativePath = file.path.replace(/\\/g, '/');
        uploadedImages.push({
          url: relativePath,
          isPrimary: i === 0
        });
        console.log(`New image ${i + 1} saved at: ${relativePath}`);
      }
      
      updateData.images = uploadedImages;
      console.log('New images to save:', JSON.stringify(uploadedImages, null, 2));
    } else {
      // Keep existing images if no new ones uploaded
      updateData.images = product.images;
    }

    // Use findByIdAndUpdate with proper options
    product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true, 
        runValidators: true,
        context: 'query' // This helps with validation
      }
    );
    
    console.log('Product updated successfully');
    
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    console.error('Error in updateProduct:', error);
    // Delete uploaded files if there's an error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log(`Deleted file due to error: ${file.path}`);
        }
      });
    }
    
    // Handle validation errors more gracefully
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete all product images
    const imagePaths = product.images.map(img => img.url);
    deleteOldImages(imagePaths);

    await product.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
      error: error.message
    });
  }
};

// @desc    Delete specific product image
// @route   DELETE /api/products/:id/images/:imageIndex
// @access  Private/Admin
const deleteProductImage = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const imageIndex = parseInt(req.params.imageIndex);
    
    if (imageIndex >= product.images.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image index'
      });
    }

    // Delete the image file
    const imageToDelete = product.images[imageIndex];
    deleteSingleImage(imageToDelete.url);

    // Remove image from array
    product.images.splice(imageIndex, 1);
    
    // If we deleted the primary image and there are other images, make the first one primary
    if (imageToDelete.isPrimary && product.images.length > 0) {
      product.images[0].isPrimary = true;
    }
    
    await product.save();
    
    res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      data: product
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting image',
      error: error.message
    });
  }
};

// @desc    Bulk delete products
// @route   DELETE /api/products/bulk/delete
// @access  Private/Admin
const bulkDeleteProducts = async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs array is required'
      });
    }

    // Get all products to delete their images
    const products = await Product.find({ _id: { $in: productIds } });
    
    // Delete all images
    for (const product of products) {
      const imagePaths = product.images.map(img => img.url);
      deleteOldImages(imagePaths);
    }

    const result = await Product.deleteMany({ _id: { $in: productIds } });
    
    res.status(200).json({
      success: true,
      message: `${result.deletedCount} products deleted successfully`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error deleting products',
      error: error.message
    });
  }
};

// @desc    Update stock quantity
// @route   PATCH /api/products/:id/stock
// @access  Private/Admin
const updateStock = async (req, res) => {
  try {
    const { quantity } = req.body;
    
    if (quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Quantity is required'
      });
    }

    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.stock = quantity;
    product.inStock = quantity > 0;
    await product.save();
    
    res.status(200).json({
      success: true,
      message: 'Stock updated successfully',
      data: { stock: product.stock, inStock: product.inStock }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating stock',
      error: error.message
    });
  }
};

// @desc    Get product statistics
// @route   GET /api/products/stats/summary
// @access  Public
const getProductStats = async (req, res) => {
  try {
    const stats = await Product.aggregate([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalValue: { $sum: { $ifNull: ['$discountedPrice', '$price'] } },
          averagePrice: { $avg: '$price' },
          totalStock: { $sum: '$stock' },
          featuredCount: { $sum: { $cond: ['$featured', 1, 0] } },
          lowStockCount: { $sum: { $cond: [{ $lt: ['$stock', 20] }, 1, 0] } },
          outOfStockCount: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } }
        }
      },
      {
        $project: {
          _id: 0,
          totalProducts: 1,
          totalValue: 1,
          averagePrice: { $round: ['$averagePrice', 2] },
          totalStock: 1,
          featuredCount: 1,
          lowStockCount: 1,
          outOfStockCount: 1
        }
      }
    ]);

    // Get gender distribution
    const genderStats = await Product.aggregate([
      {
        $group: {
          _id: '$gender',
          count: { $sum: 1 },
          totalValue: { $sum: { $ifNull: ['$discountedPrice', '$price'] } }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {
          totalProducts: 0,
          totalValue: 0,
          averagePrice: 0,
          totalStock: 0,
          featuredCount: 0,
          lowStockCount: 0,
          outOfStockCount: 0
        },
        byGender: genderStats
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

// @desc    Upload product images only
// @route   POST /api/products/:id/upload-images
// @access  Private/Admin
const uploadProductImages = async (req, res) => {
  try {
    console.log('=== UPLOAD IMAGES DEBUG ===');
    console.log('Product ID:', req.params.id);
    console.log('Files:', req.files);
    
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (req.files && req.files.length > 0) {
      const uploadedImages = [];
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const relativePath = file.path.replace(/\\/g, '/');
        uploadedImages.push({
          url: relativePath,
          isPrimary: product.images.length === 0 && i === 0 // Make primary if no images exist
        });
        console.log(`Image uploaded: ${relativePath}`);
      }
      
      product.images.push(...uploadedImages);
      await product.save();
      
      res.status(200).json({
        success: true,
        message: 'Images uploaded successfully',
        data: product
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'No images uploaded'
      });
    }
  } catch (error) {
    console.error('Error in uploadProductImages:', error);
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error uploading images',
      error: error.message
    });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage,
  bulkDeleteProducts,
  updateStock,
  getProductStats,
  uploadProductImages
};