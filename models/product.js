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
    enum: ['50ml', '100ml', '150ml'],
    required: true
  }],
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
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
discountedPrice: {
  type: Number,
  min: [0, 'Discounted price cannot be negative'],
  validate: {
    validator: function(value) {
      // Skip validation if value is not provided or if it's an update operation
      if (!value || value === undefined) return true;
      // Get the price (either from the update or existing document)
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

// Virtual for current price
productSchema.virtual('currentPrice').get(function() {
  return this.discountedPrice || this.price;
});

// Indexes for better query performance
productSchema.index({ name: 'text', fragrance: 'text', tags: 'text' });
productSchema.index({ gender: 1 });
productSchema.index({ price: 1 });
productSchema.index({ stock: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ createdAt: -1 });

// Pre-save middleware - WITHOUT using next
productSchema.pre('save', function() {
  // Update inStock based on stock quantity
  this.inStock = this.stock > 0;
  
  // Ensure tags are lowercase and trimmed
  if (this.tags && Array.isArray(this.tags)) {
    this.tags = this.tags.map(tag => tag.toLowerCase().trim());
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

module.exports = mongoose.model('Product', productSchema);