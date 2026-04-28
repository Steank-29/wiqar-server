const mongoose = require('mongoose');
const Product = require('../models/product');
const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const { deleteCloudinaryImage, deleteMultipleCloudinaryImages } = require('../middleware/uploadProduct');

// Helper function to delete old product images (local files - for backward compatibility)
const deleteOldImages = (imagePaths) => {
  if (!imagePaths || !Array.isArray(imagePaths)) return;
  
  imagePaths.forEach(imagePath => {
    if (imagePath && imagePath !== 'default-product.jpg') {
      // Handle different path formats
      let fullPath = imagePath;
      
      // If it's a relative path from uploads folder
      if (imagePath.startsWith('uploads/')) {
        fullPath = path.join(__dirname, '..', imagePath);
      } 
      // If it's just a filename or already a full path
      else if (!imagePath.startsWith('http') && !path.isAbsolute(imagePath)) {
        fullPath = path.join(__dirname, '..', 'uploads/products', path.basename(imagePath));
      }
      
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`Deleted old image: ${fullPath}`);
        } catch (err) {
          console.error(`Error deleting image ${fullPath}:`, err);
        }
      } else {
        console.log(`Image not found: ${fullPath}`);
      }
    }
  });
};

// Helper function to delete a single image (local files - for backward compatibility)
const deleteSingleImage = (imagePath) => {
  if (imagePath && imagePath !== 'default-product.jpg') {
    let fullPath = imagePath;
    
    if (imagePath.startsWith('uploads/')) {
      fullPath = path.join(__dirname, '..', imagePath);
    } else if (!imagePath.startsWith('http') && !path.isAbsolute(imagePath)) {
      fullPath = path.join(__dirname, '..', 'uploads/products', path.basename(imagePath));
    }
    
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`Deleted image: ${fullPath}`);
      } catch (err) {
        console.error(`Error deleting image ${fullPath}:`, err);
      }
    }
  }
};

// Helper function to delete images based on type (Cloudinary or local)
const deleteProductImages = async (images) => {
  if (!images || images.length === 0) return;
  
  // Separate Cloudinary URLs from local paths
  const cloudinaryUrls = images.filter(img => img.url && img.url.startsWith('http') && img.url.includes('cloudinary'));
  const localPaths = images.filter(img => img.url && !img.url.startsWith('http'));
  
  // Delete from Cloudinary if publicId exists
  if (cloudinaryUrls.length > 0) {
    const urls = cloudinaryUrls.map(img => img.url);
    await deleteMultipleCloudinaryImages(urls);
    console.log(`Deleted ${cloudinaryUrls.length} images from Cloudinary`);
  }
  
  // Delete local files (backward compatibility)
  if (localPaths.length > 0) {
    const paths = localPaths.map(img => img.url);
    deleteOldImages(paths);
    console.log(`Deleted ${localPaths.length} local images`);
  }
};

// Helper function to delete a single image
const deleteSingleProductImage = async (image) => {
  if (!image || !image.url) return;
  
  if (image.url.startsWith('http') && image.url.includes('cloudinary')) {
    await deleteCloudinaryImage(image.url);
  } else {
    deleteSingleImage(image.url);
  }
};

// Helper function to validate and set prices - NO DEFAULTS
const setProductPrices = (productData, existingProduct = null) => {
  let prices = {
    '30ml': null,
    '50ml': null,
    '100ml': null
  };
  
  // If prices object is provided in request
  if (productData.prices) {
    if (typeof productData.prices === 'string') {
      try {
        productData.prices = JSON.parse(productData.prices);
      } catch (e) {
        console.log('Failed to parse prices string');
      }
    }
    
    // Validate and set provided prices
    if (productData.prices && typeof productData.prices === 'object') {
      // Check if at least one price is provided
      const hasAnyPrice = productData.prices['30ml'] !== undefined || 
                         productData.prices['50ml'] !== undefined || 
                         productData.prices['100ml'] !== undefined;
      
      if (!hasAnyPrice && !existingProduct) {
        throw new Error('At least one price must be provided');
      }
      
      // Set provided prices
      if (productData.prices['30ml'] !== undefined) {
        const price = parseFloat(productData.prices['30ml']);
        if (isNaN(price)) throw new Error('Invalid price for 30ml');
        if (price < 0) throw new Error('Price cannot be negative');
        prices['30ml'] = price;
      } else if (existingProduct && existingProduct.prices) {
        prices['30ml'] = existingProduct.prices['30ml'];
      }
      
      if (productData.prices['50ml'] !== undefined) {
        const price = parseFloat(productData.prices['50ml']);
        if (isNaN(price)) throw new Error('Invalid price for 50ml');
        if (price < 0) throw new Error('Price cannot be negative');
        prices['50ml'] = price;
      } else if (existingProduct && existingProduct.prices) {
        prices['50ml'] = existingProduct.prices['50ml'];
      }
      
      if (productData.prices['100ml'] !== undefined) {
        const price = parseFloat(productData.prices['100ml']);
        if (isNaN(price)) throw new Error('Invalid price for 100ml');
        if (price < 0) throw new Error('Price cannot be negative');
        prices['100ml'] = price;
      } else if (existingProduct && existingProduct.prices) {
        prices['100ml'] = existingProduct.prices['100ml'];
      }
    }
  } else if (existingProduct && existingProduct.prices) {
    // Keep existing prices if no new prices provided
    prices = { ...existingProduct.prices };
  }
  
  // Validate that all three prices are provided for new products
  if (!existingProduct) {
    if (prices['30ml'] === null || prices['50ml'] === null || prices['100ml'] === null) {
      throw new Error('All three prices (30ml, 50ml, 100ml) are required for new products');
    }
  } else {
    // For updates, at least ensure we have some prices
    if (prices['30ml'] === null && prices['50ml'] === null && prices['100ml'] === null) {
      throw new Error('At least one price must be provided for update');
    }
  }
  
  // Validate price logic: 50ml should be greater than 30ml, 100ml greater than 50ml
  if (prices['30ml'] !== null && prices['50ml'] !== null && prices['50ml'] <= prices['30ml']) {
    throw new Error('50ml price must be greater than 30ml price');
  }
  
  if (prices['50ml'] !== null && prices['100ml'] !== null && prices['100ml'] <= prices['50ml']) {
    throw new Error('100ml price must be greater than 50ml price');
  }
  
  // Validate that discounted price is not higher than any available size price
  if (productData.discountedPrice) {
    const discountedPrice = parseFloat(productData.discountedPrice);
    if (isNaN(discountedPrice)) throw new Error('Invalid discounted price');
    
    const availablePrices = [];
    if (prices['30ml'] !== null) availablePrices.push(prices['30ml']);
    if (prices['50ml'] !== null) availablePrices.push(prices['50ml']);
    if (prices['100ml'] !== null) availablePrices.push(prices['100ml']);
    
    for (const price of availablePrices) {
      if (discountedPrice > price) {
        throw new Error(`Discounted price cannot be greater than product price (${price})`);
      }
    }
  }
  
  return prices;
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
      category,
      size = '30ml'
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

    // Price range filter - only include products that have the price set
    if (minPrice || maxPrice) {
      const priceField = `prices.${size}`;
      filter[priceField] = {};
      filter[priceField].$ne = null; // Exclude products where price is null
      if (minPrice) filter[priceField].$gte = parseFloat(minPrice);
      if (maxPrice) filter[priceField].$lte = parseFloat(maxPrice);
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
    let sort = { [sortBy]: sortOrder };
    
    // Handle sorting by price for specific size
    if (sortBy === 'price') {
      sort = { [`prices.${size}`]: sortOrder };
    }

    // Execute query
    const products = await Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await Product.countDocuments(filter);

    // Get statistics with new pricing structure - only count products with prices
    const stats = await Product.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalValue30ml: { $sum: { $cond: [{ $ne: ['$prices.30ml', null] }, '$prices.30ml', 0] } },
          totalValue50ml: { $sum: { $cond: [{ $ne: ['$prices.50ml', null] }, '$prices.50ml', 0] } },
          totalValue100ml: { $sum: { $cond: [{ $ne: ['$prices.100ml', null] }, '$prices.100ml', 0] } },
          averagePrice30ml: { $avg: { $cond: [{ $ne: ['$prices.30ml', null] }, '$prices.30ml', null] } },
          averagePrice50ml: { $avg: { $cond: [{ $ne: ['$prices.50ml', null] }, '$prices.50ml', null] } },
          averagePrice100ml: { $avg: { $cond: [{ $ne: ['$prices.100ml', null] }, '$prices.100ml', null] } },
          totalStock: { $sum: '$stock' },
          lowStockCount: { $sum: { $cond: [{ $lt: ['$stock', 20] }, 1, 0] } }
        }
      }
    ]);

    // Format products with pricing info
    const formattedProducts = products.map(product => ({
      ...product.toObject(),
      currentPrices: product.getAllPrices(),
      availableSizes: product.quantity.filter(size => product.getPriceForQuantity(size) !== null)
    }));

    res.status(200).json({
      success: true,
      data: formattedProducts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum
      },
      stats: stats[0] ? {
        totalProducts: stats[0].totalProducts,
        totalValue: stats[0][`totalValue${size}`],
        averagePrice: stats[0][`averagePrice${size}`] || 0,
        totalStock: stats[0].totalStock,
        lowStockCount: stats[0].lowStockCount
      } : {
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
    
    // Filter out sizes without prices
    const availableSizes = product.quantity.filter(size => product.getPriceForQuantity(size) !== null);
    
    // Format response with pricing for all sizes
    const formattedProduct = {
      ...product.toObject(),
      currentPrices: product.getAllPrices(),
      availableSizes: availableSizes,
      hasCompletePricing: product.hasAllPrices(),
      getPriceForSize: (size) => product.getPriceForQuantity(size)
    };
    
    res.status(200).json({
      success: true,
      data: formattedProduct
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
    console.log('\n========================================');
    console.log('=== CREATE PRODUCT DEBUG START ===');
    console.log('========================================');
    
    // Log request basics
    console.log('Request Method:', req.method);
    console.log('Request URL:', req.url);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Content-Length:', req.headers['content-length']);
    
    // Log user authentication
    console.log('\n--- USER INFO ---');
    console.log('User object exists:', !!req.user);
    if (req.user) {
      console.log('User ID:', req.user._id || req.user.id);
      console.log('User Role:', req.user.role);
      console.log('User Email:', req.user.email);
    } else {
      console.error('ERROR: No user object in request! Auth middleware may be failing.');
    }
    
    // Log request body
    console.log('\n--- REQUEST BODY (raw) ---');
    console.log('req.body:', JSON.stringify(req.body, null, 2));
    
    // Log files
    console.log('\n--- REQUEST FILES ---');
    console.log('Files count:', req.files ? req.files.length : 0);
    if (req.files && req.files.length > 0) {
      req.files.forEach((file, index) => {
        console.log(`File ${index + 1}:`, {
          originalname: file.originalname,
          filename: file.filename,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype
        });
      });
    } else {
      console.log('No files uploaded');
    }
    
    // Check validation errors
    console.log('\n--- VALIDATION CHECK ---');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors found:', JSON.stringify(errors.array(), null, 2));
      
      // Clean up uploaded files (Cloudinary files don't need local cleanup)
      if (req.files && req.files.length > 0 && req.files[0].path && !req.files[0].path.startsWith('http')) {
        console.log('Cleaning up local uploaded files due to validation error...');
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`Deleted: ${file.path}`);
          }
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    console.log('Validation passed');

    // Clone request body
    const productData = { ...req.body };
    
    // Step 1: Parse JSON fields
    console.log('\n--- STEP 1: PARSING JSON FIELDS ---');
    
    // Parse quantity
    if (productData.quantity !== undefined) {
      console.log('Original quantity type:', typeof productData.quantity);
      console.log('Original quantity value:', productData.quantity);
      
      if (typeof productData.quantity === 'string') {
        try {
          productData.quantity = JSON.parse(productData.quantity);
          console.log('✓ Parsed quantity (JSON):', productData.quantity);
        } catch (e) {
          console.log('JSON parse failed, trying split method...');
          productData.quantity = productData.quantity.split(',').map(q => q.trim()).filter(q => q);
          console.log('✓ Parsed quantity (split):', productData.quantity);
        }
      }
    } else {
      console.log('⚠ No quantity field provided');
      productData.quantity = [];
    }
    
    // Parse tags
    if (productData.tags !== undefined) {
      console.log('\nOriginal tags type:', typeof productData.tags);
      console.log('Original tags value:', productData.tags);
      
      if (typeof productData.tags === 'string') {
        try {
          productData.tags = JSON.parse(productData.tags);
          console.log('✓ Parsed tags (JSON):', productData.tags);
        } catch (e) {
          console.log('JSON parse failed, trying split method...');
          productData.tags = productData.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
          console.log('✓ Parsed tags (split):', productData.tags);
        }
      }
    } else {
      console.log('⚠ No tags field provided');
      productData.tags = [];
    }
    
    // Parse prices
    console.log('\n--- STEP 2: HANDLING PRICES ---');
    console.log('Original prices type:', typeof productData.prices);
    console.log('Original prices value:', productData.prices);
    
    // Ensure prices is an object
    if (productData.prices && typeof productData.prices === 'string') {
      try {
        productData.prices = JSON.parse(productData.prices);
        console.log('✓ Parsed prices string to object:', productData.prices);
      } catch (e) {
        console.error('✗ Failed to parse prices JSON:', e.message);
        return res.status(400).json({
          success: false,
          message: 'Invalid prices format. Must be valid JSON.'
        });
      }
    }
    
    // Validate prices exist
    if (!productData.prices || typeof productData.prices !== 'object') {
      console.error('✗ Prices missing or invalid');
      return res.status(400).json({
        success: false,
        message: 'Prices object is required'
      });
    }
    
    // Validate all three prices are present and valid
    const requiredSizes = ['30ml', '50ml', '100ml'];
    const missingPrices = requiredSizes.filter(size => !productData.prices[size]);
    
    if (missingPrices.length > 0) {
      console.error(`✗ Missing prices for: ${missingPrices.join(', ')}`);
      return res.status(400).json({
        success: false,
        message: `Missing prices for: ${missingPrices.join(', ')}. All three sizes (30ml, 50ml, 100ml) are required.`
      });
    }
    
    // Convert prices to numbers
    for (const size of requiredSizes) {
      const priceValue = productData.prices[size];
      const numPrice = parseFloat(priceValue);
      
      if (isNaN(numPrice) || numPrice <= 0) {
        console.error(`✗ Invalid price for ${size}: "${priceValue}" is not a valid positive number`);
        return res.status(400).json({
          success: false,
          message: `Invalid price for ${size}: must be a positive number`
        });
      }
      
      productData.prices[size] = numPrice;
      console.log(`✓ Price for ${size}: ${numPrice} TND`);
    }
    
    // Validate price logic (50ml > 30ml, 100ml > 50ml)
    if (productData.prices['50ml'] <= productData.prices['30ml']) {
      console.error(`✗ Price logic error: 50ml (${productData.prices['50ml']}) must be greater than 30ml (${productData.prices['30ml']})`);
      return res.status(400).json({
        success: false,
        message: '50ml price must be greater than 30ml price'
      });
    }
    
    if (productData.prices['100ml'] <= productData.prices['50ml']) {
      console.error(`✗ Price logic error: 100ml (${productData.prices['100ml']}) must be greater than 50ml (${productData.prices['50ml']})`);
      return res.status(400).json({
        success: false,
        message: '100ml price must be greater than 50ml price'
      });
    }
    
    console.log('✓ Price validation passed');
    
    // Validate other required fields
    console.log('\n--- REQUIRED FIELDS VALIDATION ---');
    const requiredFields = ['name', 'fragrance', 'stock'];
    const missingFields = requiredFields.filter(field => !productData[field]);
    
    if (missingFields.length > 0) {
      console.error(`✗ Missing required fields: ${missingFields.join(', ')}`);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    
    // Convert stock to number
    productData.stock = parseInt(productData.stock);
    if (isNaN(productData.stock)) {
      console.error('✗ Stock is not a valid number');
      return res.status(400).json({
        success: false,
        message: 'Stock must be a valid number'
      });
    }
    console.log(`✓ Stock: ${productData.stock}`);
    
    // Validate quantity array
    if (!productData.quantity || productData.quantity.length === 0) {
      console.error('✗ No sizes selected in quantity array');
      return res.status(400).json({
        success: false,
        message: 'At least one size must be selected'
      });
    }
    console.log(`✓ Sizes selected: ${productData.quantity.join(', ')}`);
    
    // Handle optional fields
    if (productData.discountedPrice) {
      productData.discountedPrice = parseFloat(productData.discountedPrice);
      console.log(`✓ Discounted price: ${productData.discountedPrice} TND`);
    }
    
    if (productData.rating) {
      productData.rating = parseFloat(productData.rating);
    }
    
    if (productData.featured === 'true' || productData.featured === true) {
      productData.featured = true;
    } else {
      productData.featured = false;
    }
    
    if (productData.inStock === 'false' || productData.inStock === false) {
      productData.inStock = false;
    } else {
      productData.inStock = productData.stock > 0;
    }
    
    // Remove legacy price field if exists
    delete productData.price;
    
    // Handle image uploads with Cloudinary
    console.log('\n--- STEP 3: HANDLING IMAGES (CLOUDINARY) ---');
    if (req.files && req.files.length > 0) {
      const uploadedImages = [];
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        console.log(`Processing image ${i + 1}:`);
        console.log(`  - Original name: ${file.originalname}`);
        console.log(`  - Cloudinary URL: ${file.path}`);
        console.log(`  - Size: ${file.size} bytes`);
        
        uploadedImages.push({
          url: file.path, // Cloudinary URL
          publicId: file.filename, // Cloudinary public ID
          isPrimary: i === 0
        });
        console.log(`  ✓ Image uploaded to Cloudinary: ${file.path}`);
      }
      
      productData.images = uploadedImages;
      console.log(`✓ Total images to save: ${uploadedImages.length}`);
    } else {
      console.log('⚠ No images uploaded');
      productData.images = [];
    }
    
    // Final data check before DB save
    console.log('\n--- STEP 4: FINAL DATA VALIDATION ---');
    console.log('Final product data structure:');
    console.log(JSON.stringify({
      name: productData.name,
      fragrance: productData.fragrance,
      quantity: productData.quantity,
      stock: productData.stock,
      gender: productData.gender,
      prices: productData.prices,
      discountedPrice: productData.discountedPrice,
      description: productData.description?.substring(0, 100),
      rating: productData.rating,
      featured: productData.featured,
      inStock: productData.inStock,
      tags: productData.tags,
      category: productData.category,
      imagesCount: productData.images.length
    }, null, 2));
    
    // Attempt to create product
    console.log('\n--- STEP 5: CREATING PRODUCT IN DATABASE ---');
    console.log('Calling Product.create()...');
    
    let product;
    try {
      product = await Product.create(productData);
      console.log('✓ Product.create() succeeded');
      console.log(`✓ Product ID: ${product._id}`);
      console.log(`✓ Product Name: ${product.name}`);
    } catch (dbError) {
      console.error('✗ Product.create() failed:');
      console.error('  - Error name:', dbError.name);
      console.error('  - Error message:', dbError.message);
      
      if (dbError.name === 'ValidationError') {
        console.error('  - Validation errors:');
        for (const field in dbError.errors) {
          console.error(`    * ${field}: ${dbError.errors[field].message}`);
        }
      }
      
      throw dbError; // Re-throw to be caught by outer catch
    }
    
    // Return formatted product
    console.log('\n--- STEP 6: FORMATTING RESPONSE ---');
    const formattedProduct = {
      ...product.toObject(),
      currentPrices: product.getAllPrices ? product.getAllPrices() : product.prices,
      availableSizes: product.quantity ? product.quantity.filter(size => 
        product.getPriceForQuantity ? product.getPriceForQuantity(size) !== null : true
      ) : []
    };
    
    console.log('✓ Product created successfully!');
    console.log('========================================\n');
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: formattedProduct
    });
    
  } catch (error) {
    console.error('\n========================================');
    console.error('=== FATAL ERROR IN CREATEPRODUCT ===');
    console.error('========================================');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Log specific error types
    if (error.name === 'CastError') {
      console.error('Error type: CastError - Invalid ID format');
    } else if (error.name === 'ValidationError') {
      console.error('Error type: ValidationError - Schema validation failed');
      for (const field in error.errors) {
        console.error(`  - ${field}: ${error.errors[field].message}`);
      }
    } else if (error.name === 'MongoError' || error.code) {
      console.error('Error type: MongoDB Error');
      console.error('  - Code:', error.code);
      if (error.code === 11000) {
        console.error('  - Duplicate key error');
      }
    } else if (error.name === 'JsonWebTokenError') {
      console.error('Error type: JWT Error - Invalid token');
    } else if (error.name === 'TokenExpiredError') {
      console.error('Error type: Token Expired');
    }
    
    // Delete uploaded files if there's an error (Cloudinary files are already uploaded, no need to delete)
    if (req.files && req.files.length > 0 && req.files[0].path && !req.files[0].path.startsWith('http')) {
      console.log('\n--- CLEANING UP LOCAL UPLOADED FILES ---');
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
            console.log(`✓ Deleted: ${file.path}`);
          } catch (unlinkError) {
            console.error(`✗ Failed to delete: ${file.path}`, unlinkError.message);
          }
        } else {
          console.log(`File not found: ${file.path}`);
        }
      });
    }
    
    console.log('========================================\n');
    
    // Send appropriate error response
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate product. A product with this name may already exist.',
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    console.log('=== UPDATE PRODUCT DEBUG ===');
    console.log('Product ID:', req.params.id);
    console.log('Request files:', req.files ? req.files.length : 0);
    console.log('Replace images flag:', req.body.replaceImages);
    
    let product = await Product.findById(req.params.id);
    
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

    // Build update object properly
    const updateFields = {};
    
    // Simple fields
    if (req.body.name !== undefined) updateFields.name = req.body.name;
    if (req.body.fragrance !== undefined) updateFields.fragrance = req.body.fragrance;
    if (req.body.description !== undefined) updateFields.description = req.body.description;
    if (req.body.category !== undefined) updateFields.category = req.body.category;
    if (req.body.gender !== undefined) updateFields.gender = req.body.gender;
    if (req.body.stock !== undefined) updateFields.stock = parseInt(req.body.stock);
    if (req.body.rating !== undefined) updateFields.rating = parseFloat(req.body.rating);
    if (req.body.discountedPrice !== undefined) updateFields.discountedPrice = parseFloat(req.body.discountedPrice);
    
    // Boolean fields
    if (req.body.featured !== undefined) updateFields.featured = req.body.featured === 'true' || req.body.featured === true;
    if (req.body.inStock !== undefined) updateFields.inStock = req.body.inStock === 'true' || req.body.inStock === true;
    
    // Quantity array
    if (req.body.quantity !== undefined) {
      if (typeof req.body.quantity === 'string') {
        try {
          updateFields.quantity = JSON.parse(req.body.quantity);
        } catch (e) {
          updateFields.quantity = req.body.quantity.split(',').map(q => q.trim());
        }
      } else {
        updateFields.quantity = req.body.quantity;
      }
    }
    
    // Tags array
    if (req.body.tags !== undefined) {
      if (typeof req.body.tags === 'string') {
        try {
          updateFields.tags = JSON.parse(req.body.tags);
        } catch (e) {
          updateFields.tags = req.body.tags.split(',').map(tag => tag.trim());
        }
      } else {
        updateFields.tags = req.body.tags;
      }
    }
    
    // Prices object
    if (req.body.prices !== undefined) {
      let prices = req.body.prices;
      if (typeof prices === 'string') {
        try {
          prices = JSON.parse(prices);
        } catch (e) {
          console.log('Failed to parse prices');
        }
      }
      
      updateFields.prices = {
        '30ml': prices['30ml'] !== undefined ? parseFloat(prices['30ml']) : product.prices['30ml'],
        '50ml': prices['50ml'] !== undefined ? parseFloat(prices['50ml']) : product.prices['50ml'],
        '100ml': prices['100ml'] !== undefined ? parseFloat(prices['100ml']) : product.prices['100ml']
      };
      
      // Validate price logic
      if (updateFields.prices['50ml'] <= updateFields.prices['30ml']) {
        throw new Error('50ml price must be greater than 30ml price');
      }
      if (updateFields.prices['100ml'] <= updateFields.prices['50ml']) {
        throw new Error('100ml price must be greater than 50ml price');
      }
    }
    
    // Handle images with Cloudinary
    if (req.files && req.files.length > 0) {
      const replaceImages = req.body.replaceImages === 'true' || req.body.replaceImages === true;
      
      let currentImages = [...product.images];
      
      if (replaceImages && currentImages.length > 0) {
        // Delete old images from Cloudinary
        const cloudinaryImages = currentImages.filter(img => img.url && img.url.includes('cloudinary'));
        if (cloudinaryImages.length > 0) {
          const urls = cloudinaryImages.map(img => img.url);
          await deleteMultipleCloudinaryImages(urls);
          console.log(`Deleted ${cloudinaryImages.length} old images from Cloudinary`);
        }
        currentImages = [];
        console.log('Replaced all images');
      }
      
      // Add new images from Cloudinary
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        currentImages.push({
          url: file.path, // Cloudinary URL          publicId: file.filename, // Cloudinary public ID
          isPrimary: currentImages.length === 0 && i === 0
        });
        console.log(`Added new image from Cloudinary: ${file.path}`);
      }
      
      updateFields.images = currentImages;
      console.log(`Total images after update: ${currentImages.length}`);
    }
    
    // Update the product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );
    
    console.log('Product updated successfully');
    
    const formattedProduct = {
      ...updatedProduct.toObject(),
      currentPrices: updatedProduct.getAllPrices(),
      availableSizes: updatedProduct.quantity.filter(size => updatedProduct.getPriceForQuantity(size) !== null),
      hasCompletePricing: updatedProduct.hasAllPrices()
    };
    
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: formattedProduct
    });
    
  } catch (error) {
    console.error('Error in updateProduct:', error);
    
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating product',
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

    // Delete images from Cloudinary or local storage
    await deleteProductImages(product.images);
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

    const imageToDelete = product.images[imageIndex];
    
    // Delete image from Cloudinary or local storage
    await deleteSingleProductImage(imageToDelete);
    
    product.images.splice(imageIndex, 1);
    
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

    const products = await Product.find({ _id: { $in: productIds } });
    
    for (const product of products) {
      await deleteProductImages(product.images);
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
          totalValue30ml: { $sum: { $ifNull: ['$discountedPrice', { $cond: [{ $ne: ['$prices.30ml', null] }, '$prices.30ml', 0] }] } },
          totalValue50ml: { $sum: { $ifNull: ['$discountedPrice', { $cond: [{ $ne: ['$prices.50ml', null] }, '$prices.50ml', 0] }] } },
          totalValue100ml: { $sum: { $ifNull: ['$discountedPrice', { $cond: [{ $ne: ['$prices.100ml', null] }, '$prices.100ml', 0] }] } },
          averagePrice30ml: { $avg: { $cond: [{ $ne: ['$prices.30ml', null] }, '$prices.30ml', null] } },
          averagePrice50ml: { $avg: { $cond: [{ $ne: ['$prices.50ml', null] }, '$prices.50ml', null] } },
          averagePrice100ml: { $avg: { $cond: [{ $ne: ['$prices.100ml', null] }, '$prices.100ml', null] } },
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
          totalValue30ml: 1,
          totalValue50ml: 1,
          totalValue100ml: 1,
          averagePrice30ml: { $round: ['$averagePrice30ml', 2] },
          averagePrice50ml: { $round: ['$averagePrice50ml', 2] },
          averagePrice100ml: { $round: ['$averagePrice100ml', 2] },
          totalStock: 1,
          featuredCount: 1,
          lowStockCount: 1,
          outOfStockCount: 1
        }
      }
    ]);

    const genderStats = await Product.aggregate([
      {
        $group: {
          _id: '$gender',
          count: { $sum: 1 },
          totalValue30ml: { $sum: { $cond: [{ $ne: ['$prices.30ml', null] }, '$prices.30ml', 0] } },
          totalValue50ml: { $sum: { $cond: [{ $ne: ['$prices.50ml', null] }, '$prices.50ml', 0] } },
          totalValue100ml: { $sum: { $cond: [{ $ne: ['$prices.100ml', null] }, '$prices.100ml', 0] } }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: stats[0] || {
          totalProducts: 0,
          totalValue30ml: 0,
          totalValue50ml: 0,
          totalValue100ml: 0,
          averagePrice30ml: 0,
          averagePrice50ml: 0,
          averagePrice100ml: 0,
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
      if (req.files && req.files.length > 0 && req.files[0].path && !req.files[0].path.startsWith('http')) {
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
        uploadedImages.push({
          url: file.path, // Cloudinary URL
          publicId: file.filename, // Cloudinary public ID
          isPrimary: product.images.length === 0 && i === 0
        });
        console.log(`Image uploaded to Cloudinary: ${file.path}`);
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
    if (req.files && req.files.length > 0 && req.files[0].path && !req.files[0].path.startsWith('http')) {
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

// @desc    Get price for specific product size
// @route   GET /api/products/:id/price/:size
// @access  Public
const getProductPriceBySize = async (req, res) => {
  try {
    const { id, size } = req.params;
    
    if (!['30ml', '50ml', '100ml'].includes(size)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid size. Must be 30ml, 50ml, or 100ml'
      });
    }
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const price = product.getPriceForQuantity(size);
    
    if (price === null) {
      return res.status(404).json({
        success: false,
        message: `Price not available for ${size} size`
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        productId: product._id,
        name: product.name,
        size: size,
        price: price,
        isAvailable: product.quantity.includes(size) && price !== null,
        inStock: product.inStock
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error fetching price',
      error: error.message
    });
  }
};

// @desc    Update specific size price
// @route   PATCH /api/products/:id/price/:size
// @access  Private/Admin
const updateProductPriceBySize = async (req, res) => {
  try {
    const { id, size } = req.params;
    const { price } = req.body;
    
    if (!['30ml', '50ml', '100ml'].includes(size)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid size. Must be 30ml, 50ml, or 100ml'
      });
    }
    
    if (price === undefined || isNaN(parseFloat(price))) {
      return res.status(400).json({
        success: false,
        message: 'Valid price is required'
      });
    }
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const newPrice = parseFloat(price);
    product.prices[size] = newPrice;
    
    if (product.prices['30ml'] !== null && product.prices['50ml'] !== null && 
        product.prices['50ml'] <= product.prices['30ml']) {
      return res.status(400).json({
        success: false,
        message: '50ml price must be greater than 30ml price'
      });
    }
    
    if (product.prices['50ml'] !== null && product.prices['100ml'] !== null && 
        product.prices['100ml'] <= product.prices['50ml']) {
      return res.status(400).json({
        success: false,
        message: '100ml price must be greater than 50ml price'
      });
    }
    
    await product.save();
    
    res.status(200).json({
      success: true,
      message: `${size} price updated successfully`,
      data: {
        productId: product._id,
        name: product.name,
        prices: product.getAllPrices()
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Error updating price',
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
  uploadProductImages,
  getProductPriceBySize,
  updateProductPriceBySize
};