const Order = require('../models/Order');

// @desc    Create new order
// @route   POST /api/orders
// @access  Public
const createOrder = async (req, res) => {
  try {
    const {
      items,
      customer,
      subtotal,
      shippingCost,
      total,
      paymentMethod,
      notes
    } = req.body;

    // Basic validation
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    }

    if (!customer || !customer.fullName || !customer.email || !customer.phone || !customer.address || !customer.city) {
      return res.status(400).json({ message: 'Please provide all required customer information' });
    }

    // Generate order number manually
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    // Find the last order created today
    const lastOrder = await Order.findOne({
      orderNumber: new RegExp(`ORD-${year}${month}${day}-`)
    }).sort({ orderNumber: -1 });
    
    let sequence = '0001';
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.split('-')[2]);
      sequence = (lastSequence + 1).toString().padStart(4, '0');
    }
    
    const orderNumber = `ORD-${year}${month}${day}-${sequence}`;

    // Create order with generated order number
    const order = new Order({
      orderNumber,
      customer,
      items,
      subtotal,
      shippingCost,
      total,
      paymentMethod: paymentMethod || 'cash_on_delivery',
      paymentStatus: 'pending',
      orderStatus: 'pending',
      notes
    });

    const createdOrder = await order.save();

    res.status(201).json({
      success: true,
      order: {
        _id: createdOrder._id,
        orderNumber: createdOrder.orderNumber,
        total: createdOrder.total,
        orderStatus: createdOrder.orderStatus,
        createdAt: createdOrder.createdAt
      }
    });

  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ 
      message: 'Error creating order', 
      error: error.message 
    });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    let query = {};
    
    // Filter by status
    if (req.query.status) {
      query.orderStatus = req.query.status;
    }
    
    // Filter by payment method
    if (req.query.paymentMethod) {
      query.paymentMethod = req.query.paymentMethod;
    }
    
    // Search by order number or customer name/email
    if (req.query.search) {
      query.$or = [
        { orderNumber: { $regex: req.query.search, $options: 'i' } },
        { 'customer.fullName': { $regex: req.query.search, $options: 'i' } },
        { 'customer.email': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      page,
      pages: Math.ceil(total / limit),
      total
    });

  } catch (error) {
    res.status(500).json({ message: 'Error fetching orders', error: error.message });
  }
};

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private/Admin
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);

  } catch (error) {
    res.status(500).json({ message: 'Error fetching order', error: error.message });
  }
};

// @desc    Get order by order number
// @route   GET /api/orders/number/:orderNumber
// @access  Public
const getOrderByNumber = async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Only return limited info for public access
    res.json({
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      total: order.total,
      orderDate: order.orderDate,
      customer: {
        fullName: order.customer.fullName,
        city: order.customer.city
      },
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price
      }))
    });

  } catch (error) {
    res.status(500).json({ message: 'Error fetching order', error: error.message });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.orderStatus = status;
    
    // Add timestamps based on status
    if (status === 'confirmed') order.confirmedAt = Date.now();
    if (status === 'shipped') order.shippedAt = Date.now();
    if (status === 'delivered') order.deliveredAt = Date.now();
    if (status === 'cancelled') order.cancelledAt = Date.now();
    
    await order.save();

    res.json({ 
      message: 'Order status updated',
      order 
    });

  } catch (error) {
    res.status(500).json({ message: 'Error updating order', error: error.message });
  }
};

// @desc    Update payment status
// @route   PUT /api/orders/:id/payment-status
// @access  Private/Admin
const updatePaymentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'paid', 'failed', 'refunded'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid payment status' });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.paymentStatus = status;
    await order.save();

    res.json({ 
      message: 'Payment status updated',
      order 
    });

  } catch (error) {
    res.status(500).json({ message: 'Error updating payment status', error: error.message });
  }
};

// @desc    Add tracking information
// @route   PUT /api/orders/:id/tracking
// @access  Private/Admin
const addTrackingInfo = async (req, res) => {
  try {
    const { trackingNumber, shippingCarrier } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ message: 'Tracking number is required' });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.trackingNumber = trackingNumber;
    order.shippingCarrier = shippingCarrier || 'Other';
    
    // Auto-update status to shipped if tracking is added
    if (order.orderStatus === 'confirmed' || order.orderStatus === 'processing') {
      order.orderStatus = 'shipped';
      order.shippedAt = Date.now();
    }
    
    await order.save();

    res.json({ 
      message: 'Tracking information added',
      order 
    });

  } catch (error) {
    res.status(500).json({ message: 'Error adding tracking info', error: error.message });
  }
};

// @desc    Get customer orders by email
// @route   GET /api/orders/customer/:email
// @access  Public
const getCustomerOrders = async (req, res) => {
  try {
    const orders = await Order.find({ 'customer.email': req.params.email })
      .sort({ createdAt: -1 })
      .select('orderNumber orderStatus total orderDate items');

    res.json(orders);

  } catch (error) {
    res.status(500).json({ message: 'Error fetching orders', error: error.message });
  }
};

// @desc    Get order statistics
// @route   GET /api/orders/stats/summary
// @access  Public
const getOrderStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ orderStatus: 'pending' });
    const confirmedOrders = await Order.countDocuments({ orderStatus: 'confirmed' });
    const shippedOrders = await Order.countDocuments({ orderStatus: 'shipped' });
    const deliveredOrders = await Order.countDocuments({ orderStatus: 'delivered' });
    
    const revenue = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    res.json({
      totalOrders,
      pendingOrders,
      confirmedOrders,
      shippedOrders,
      deliveredOrders,
      totalRevenue: revenue[0]?.total || 0
    });

  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};

// @desc    Delete order
// @route   DELETE /api/orders/:id
// @access  Private/SuperAdmin
const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    await order.deleteOne();
    res.json({ message: 'Order deleted successfully' });

  } catch (error) {
    res.status(500).json({ message: 'Error deleting order', error: error.message });
  }
};

// @desc    Bulk delete orders
// @route   DELETE /api/orders/bulk/delete
// @access  Private/SuperAdmin
const bulkDeleteOrders = async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'Please provide order IDs' });
    }

    const result = await Order.deleteMany({ _id: { $in: orderIds } });

    res.json({ 
      message: `${result.deletedCount} orders deleted successfully`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    res.status(500).json({ message: 'Error deleting orders', error: error.message });
  }
};

// @desc    Cancel order with reason
// @route   PUT /api/orders/:id/cancel
// @access  Private/SuperAdmin
const cancelOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.orderStatus === 'delivered') {
      return res.status(400).json({ message: 'Cannot cancel delivered order' });
    }

    order.orderStatus = 'cancelled';
    order.cancelledAt = Date.now();
    order.cancellationReason = reason || 'Cancelled by admin';
    
    await order.save();

    res.json({ 
      message: 'Order cancelled successfully',
      order 
    });

  } catch (error) {
    res.status(500).json({ message: 'Error cancelling order', error: error.message });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  getOrderByNumber,
  updateOrderStatus,
  getCustomerOrders,
  deleteOrder,
  bulkDeleteOrders,
  getOrderStats,
  updatePaymentStatus,
  addTrackingInfo,
  cancelOrder
};