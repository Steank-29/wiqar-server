const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  fragrance: {
    type: String,
    required: [true, 'Fragrance notes are required'],
    trim: true,
    maxlength: [200, 'Fragrance notes cannot exceed 200 characters']
  },
  quantity: [{
    type: String,
    enum: ['30ml', '50ml', '100ml'],
    required: true
  }],
  // NEW: Store prices for each size - NO DEFAULTS
  prices: {
    '30ml': {
      type: Number,
      required: [true, 'Price for 30ml is required'],
      min: [0, 'Price cannot be negative']
    },
    '50ml': {
      type: Number,
      required: [true, 'Price for 50ml is required'],
      min: [0, 'Price cannot be negative']
    },
    '100ml': {
      type: Number,
      required: [true, 'Price for 100ml is required'],
      min: [0, 'Price cannot be negative']
    }
  },
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  gender: {
    type: String,
    enum: ['men', 'women', 'unisex'],
    default: 'unisex',
    required: true
  },
  discountedPrice: {
    type: Number,
    min: [0, 'Discounted price cannot be negative'],
    validate: {
      validator: function(value) {
        if (!value || value === undefined) return true;
        // Check against all prices? Or you can modify this logic
        // This example checks if discounted price is less than any available size price
        if (this.prices) {
          const allPrices = [this.prices['30ml'], this.prices['50ml'], this.prices['100ml']];
          return allPrices.some(price => value <= price);
        }
        return true;
      },
      message: 'Discounted price must be less than or equal to at least one size price'
    }
  },
  description: {
    type: String,
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
    default: ''
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  featured: {
    type: Boolean,
    default: false
  },
  inStock: {
    type: Boolean,
    default: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    default: 'Perfumes',
    enum: ['Perfumes', 'Attars', 'Oils', 'Gifts']
  },
  images: [{
    url: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for discount percentage
productSchema.virtual('discountPercentage').get(function() {
  if (this.discountedPrice && this.prices) {
    // Calculate based on the smallest price or a specific size
    const smallestPrice = Math.min(this.prices['30ml'], this.prices['50ml'], this.prices['100ml']);
    if (smallestPrice > 0) {
      return Math.round(((smallestPrice - this.discountedPrice) / smallestPrice) * 100);
    }
  }
  return 0;
});

// Virtual for price (removed default, now returns null if no price exists)
productSchema.virtual('price').get(function() {
  // Return 30ml price if available, otherwise null
  return this.prices ? this.prices['30ml'] : null;
});

// Method to get price for specific quantity
productSchema.methods.getPriceForQuantity = function(quantitySize) {
  if (!this.prices) return null;
  return this.prices[quantitySize];
};

// Method to get all prices
productSchema.methods.getAllPrices = function() {
  if (!this.prices) return null;
  return {
    '30ml': this.prices['30ml'],
    '50ml': this.prices['50ml'],
    '100ml': this.prices['100ml']
  };
};

// Method to check if quantity is available
productSchema.methods.isQuantityAvailable = function(quantitySize) {
  return this.quantity.includes(quantitySize);
};

// Method to validate that all prices are set
productSchema.methods.hasAllPrices = function() {
  return this.prices && 
         this.prices['30ml'] !== undefined && 
         this.prices['30ml'] !== null &&
         this.prices['50ml'] !== undefined && 
         this.prices['50ml'] !== null &&
         this.prices['100ml'] !== undefined && 
         this.prices['100ml'] !== null;
};

// Indexes for better query performance
productSchema.index({ name: 'text', fragrance: 'text', tags: 'text' });
productSchema.index({ gender: 1 });
productSchema.index({ 'prices.30ml': 1 });
productSchema.index({ 'prices.50ml': 1 });
productSchema.index({ 'prices.100ml': 1 });
productSchema.index({ stock: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ createdAt: -1 });

// Pre-save middleware - NO DEFAULTS, only validation
productSchema.pre('save', function(next) {
  // Validate that all prices are provided
  if (!this.prices) {
    next(new Error('Prices object is required. Please provide prices for 30ml, 50ml, and 100ml'));
    return;
  }
  
  // Check if all three prices exist
  if (this.prices['30ml'] === undefined || this.prices['30ml'] === null ||
      this.prices['50ml'] === undefined || this.prices['50ml'] === null ||
      this.prices['100ml'] === undefined || this.prices['100ml'] === null) {
    next(new Error('All three prices (30ml, 50ml, 100ml) are required'));
    return;
  }
  
  // Update inStock based on stock quantity
  this.inStock = this.stock > 0;
  
  // Ensure tags are lowercase and trimmed
  if (this.tags && Array.isArray(this.tags)) {
    this.tags = this.tags.map(tag => tag.toLowerCase().trim());
  }
  
  // Remove duplicate entries from quantity array
  if (this.quantity && Array.isArray(this.quantity)) {
    this.quantity = [...new Set(this.quantity)];
  }
  
  // Update the updatedAt timestamp
  this.updatedAt = Date.now();
  
  next();
});

// Static method to get low stock products
productSchema.statics.getLowStockProducts = function(threshold = 20) {
  return this.find({ stock: { $lt: threshold } }).sort({ stock: 1 });
};

// Static method to get featured products
productSchema.statics.getFeaturedProducts = function(limit = 10) {
  return this.find({ featured: true, inStock: true })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get products by price range for specific size
productSchema.statics.getProductsByPriceRange = function(size, minPrice, maxPrice) {
  const priceField = `prices.${size}`;
  const query = {};
  if (minPrice !== undefined) query[priceField] = { $gte: minPrice };
  if (maxPrice !== undefined) {
    query[priceField] = { ...query[priceField], $lte: maxPrice };
  }
  return this.find(query).sort({ [priceField]: 1 });
};

module.exports = mongoose.model('Product', productSchema);