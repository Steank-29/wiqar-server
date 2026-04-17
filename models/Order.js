const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  customer: {
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String }
  },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    variantKey: String,
    name: String,
    price: Number,
    quantity: Number,
    selectedSize: String,
    mainImage: String
  }],
  paymentMethod: {
    type: String,
    enum: ['cash_on_delivery', 'bank_transfer'],
    default: 'cash_on_delivery'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  subtotal: { 
    type: Number, 
    required: true,
    min: 0
  },
  shippingCost: { 
    type: Number, 
    default: 0,
    min: 0
  },
  total: { 
    type: Number, 
    required: true,
    min: 0
  },
  notes: String,
  orderDate: { 
    type: Date, 
    default: Date.now 
  },
  confirmedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
  trackingNumber: String,
  shippingCarrier: String,
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Remove the pre-save hook since we're generating orderNumber in the controller
// The pre-save hook is causing the "next is not a function" error

// Indexes for better query performance
orderSchema.index({ 'customer.email': 1 });
orderSchema.index({ 'customer.phone': 1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ orderDate: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;