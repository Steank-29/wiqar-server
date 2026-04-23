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
  // NEW: Store prices for each size
  prices: {
    '30ml': {
      type: Number,
      min: [0, 'Price cannot be negative'],
      default: 18
    },
    '50ml': {
      type: Number,
      min: [0, 'Price cannot be negative'],
      default: 25
    },
    '100ml': {
      type: Number,
      min: [0, 'Price cannot be negative'],
      default: 35
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
        // Skip validation if value is not provided or if it's an update operation
        if (!value || value === undefined) return true;
        // For backward compatibility, check if we're using old price field
        const priceToCompare = this.price || this.get('price');
        return value <= priceToCompare;
      },
      message: 'Discounted price cannot be greater than original price'
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
  if (this.discountedPrice && this.price > 0) {
    return Math.round(((this.price - this.discountedPrice) / this.price) * 100);
  }
  return 0;
});

// Virtual for current price (for backward compatibility)
productSchema.virtual('price').get(function() {
  // Return default price (30ml) for backward compatibility
  return this.prices ? this.prices['30ml'] : 18;
});

// Method to get price for specific quantity
productSchema.methods.getPriceForQuantity = function(quantitySize) {
  if (!this.prices) return null;
  return this.prices[quantitySize];
};

// Method to get all prices
productSchema.methods.getAllPrices = function() {
  return {
    '30ml': this.prices ? this.prices['30ml'] : 18,
    '50ml': this.prices ? this.prices['50ml'] : 25,
    '100ml': this.prices ? this.prices['100ml'] : 35
  };
};

// Method to check if quantity is available
productSchema.methods.isQuantityAvailable = function(quantitySize) {
  return this.quantity.includes(quantitySize);
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

// Pre-save middleware
productSchema.pre('save', function() {
  // Initialize prices if not exists
  if (!this.prices) {
    this.prices = {
      '30ml': 18,
      '50ml': 25,
      '100ml': 35
    };
  } else {
    // Ensure each size has a price
    if (this.prices['30ml'] === undefined || this.prices['30ml'] === null) {
      this.prices['30ml'] = 18;
    }
    if (this.prices['50ml'] === undefined || this.prices['50ml'] === null) {
      this.prices['50ml'] = 25;
    }
    if (this.prices['100ml'] === undefined || this.prices['100ml'] === null) {
      this.prices['100ml'] = 35;
    }
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