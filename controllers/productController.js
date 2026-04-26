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

// UPDATED: Helper function to validate and set prices - NO DEFAULTS
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
        prices['30ml'] = price;
      } else if (existingProduct && existingProduct.prices) {
        prices['30ml'] = existingProduct.prices['30ml'];
      }
      
      if (productData.prices['50ml'] !== undefined) {
        const price = parseFloat(productData.prices['50ml']);
        if (isNaN(price)) throw new Error('Invalid price for 50ml');
        prices['50ml'] = price;
      } else if (existingProduct && existingProduct.prices) {
        prices['50ml'] = existingProduct.prices['50ml'];
      }
      
      if (productData.prices['100ml'] !== undefined) {
        const price = parseFloat(productData.prices['100ml']);
        if (isNaN(price)) throw new Error('Invalid price for 100ml');
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
      // Add helper method to get price for specific size
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
    
    // Handle prices - now required
    try {
      productData.prices = setProductPrices(productData);
    } catch (error) {
      if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    // Remove legacy price field if exists
    delete productData.price;

    // Handle image uploads
    if (req.files && req.files.length > 0) {
      const uploadedImages = [];
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const relativePath = file.path.replace(/\\/g, '/');
        uploadedImages.push({
          url: relativePath,
          isPrimary: i === 0
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
    
    // Return formatted product
    const formattedProduct = {
      ...product.toObject(),
      currentPrices: product.getAllPrices(),
      availableSizes: product.quantity.filter(size => product.getPriceForQuantity(size) !== null)
    };
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: formattedProduct
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
    
    // Handle prices update - preserve existing if not provided
    if (updateData.prices || updateData.price) {
      try {
        const newPrices = setProductPrices(updateData, product);
        
        // Update only the prices that were provided
        updateData.prices = {
          '30ml': updateData.prices?.['30ml'] !== undefined ? parseFloat(updateData.prices['30ml']) : product.prices['30ml'],
          '50ml': updateData.prices?.['50ml'] !== undefined ? parseFloat(updateData.prices['50ml']) : product.prices['50ml'],
          '100ml': updateData.prices?.['100ml'] !== undefined ? parseFloat(updateData.prices['100ml']) : product.prices['100ml']
        };
      } catch (error) {
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
    }
    
    // Remove legacy price field if exists
    delete updateData.price;

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      // Don't delete old images by default - keep them unless specified
      if (updateData.replaceImages === 'true') {
        const oldImagePaths = product.images.map(img => img.url);
        deleteOldImages(oldImagePaths);
        product.images = [];
      }
      
      const uploadedImages = [];
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const relativePath = file.path.replace(/\\/g, '/');
        uploadedImages.push({
          url: relativePath,
          isPrimary: product.images.length === 0 && i === 0
        });
        console.log(`New image ${i + 1} saved at: ${relativePath}`);
      }
      
      updateData.images = [...product.images, ...uploadedImages];
      console.log('Updated images:', JSON.stringify(updateData.images, null, 2));
    } else {
      // Keep existing images
      updateData.images = product.images;
    }

    // Use findByIdAndUpdate with proper options
    product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true, 
        runValidators: true,
        context: 'query'
      }
    );
    
    console.log('Product updated successfully');
    
    // Return formatted product
    const formattedProduct = {
      ...product.toObject(),
      currentPrices: product.getAllPrices(),
      availableSizes: product.quantity.filter(size => product.getPriceForQuantity(size) !== null),
      hasCompletePricing: product.hasAllPrices()
    };
    
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: formattedProduct
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

    // Get gender distribution with pricing
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
          isPrimary: product.images.length === 0 && i === 0
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
    
    // Update the specific price
    product.prices[size] = newPrice;
    
    // Validate price logic
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
  updateProductPriceBySize // New function for updating individual size prices
};