const Order = require('../models/Order');
const sgMail = require('@sendgrid/mail');

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


sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Email configuration
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@wiqar-perfume.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@wiqar-perfume.com';

// Helper function to format order number
const formatOrderNumber = (orderNumber) => {
  return orderNumber || 'Unknown Order';
};

// Helper function to format price
const formatPrice = (price) => {
  return new Intl.NumberFormat('tn-TN', { style: 'currency', currency: 'TND' }).format(price);
};

// Helper function to generate order summary HTML for customer
const generateCustomerEmailHTML = (order, orderNumber) => {
  const itemsList = order.items.map(item => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px; text-align: left;">${item.name}</td>
      <td style="padding: 12px; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; text-align: right;">${formatPrice(item.price)}</td>
      <td style="padding: 12px; text-align: right;">${formatPrice(item.price * item.quantity)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation - WIQAR Perfumes</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }
        .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #8C5A3C; }
        .header h1 { color: #8C5A3C; margin: 0; font-size: 28px; }
        .order-info { background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .order-details { margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background-color: #8C5A3C; color: white; padding: 12px; text-align: left; }
        .total-row { font-weight: bold; border-top: 2px solid #e5e7eb; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; margin-top: 20px; }
        .status { display: inline-block; padding: 5px 10px; border-radius: 5px; font-size: 12px; font-weight: bold; }
        .status-pending { background-color: #fef3c7; color: #d97706; }
        .customer-info { margin: 20px 0; padding: 15px; background-color: #f9fafb; border-radius: 8px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #8C5A3C; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>WIQAR Perfumes</h1>
          <p>Order Confirmation</p>
        </div>
        
        <div class="order-info">
          <p><strong>Order Number:</strong> ${orderNumber}</p>
          <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
          <p><strong>Order Status:</strong> <span class="status status-pending">${order.orderStatus.toUpperCase()}</span></p>
          <p><strong>Payment Method:</strong> ${order.paymentMethod === 'cash_on_delivery' ? 'Cash on Delivery' : order.paymentMethod}</p>
        </div>
        
        <div class="customer-info">
          <h3>Shipping Information</h3>
          <p><strong>Name:</strong> ${order.customer.fullName}</p>
          <p><strong>Phone:</strong> ${order.customer.phone}</p>
          <p><strong>Email:</strong> ${order.customer.email}</p>
          <p><strong>Address:</strong> ${order.customer.address}</p>
          <p><strong>City:</strong> ${order.customer.city}</p>
          ${order.customer.postalCode ? `<p><strong>Postal Code:</strong> ${order.customer.postalCode}</p>` : ''}
          ${order.notes ? `<p><strong>Order Notes:</strong> ${order.notes}</p>` : ''}
        </div>
        
        <div class="order-details">
          <h3>Order Summary</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsList}
              <tr class="total-row">
                <td colspan="3" style="padding: 12px; text-align: right; font-weight: bold;">Subtotal:</td>
                <td style="padding: 12px; text-align: right;">${formatPrice(order.subtotal)}</td>
              </tr>
              <tr>
                <td colspan="3" style="padding: 12px; text-align: right;">Shipping Cost:</td>
                <td style="padding: 12px; text-align: right;">${formatPrice(order.shippingCost)}</td>
              </tr>
              <tr style="background-color: #f3f4f6;">
                <td colspan="3" style="padding: 12px; text-align: right; font-weight: bold; font-size: 18px;">Total:</td>
                <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 18px; color: #8C5A3C;">${formatPrice(order.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div style="text-align: center;">
          <p>Thank you for shopping with WIQAR Perfumes!</p>
          <p>We will process your order as soon as possible.</p>
          <p>If you have any questions, please contact us at <a href="mailto:${ADMIN_EMAIL}">${ADMIN_EMAIL}</a></p>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} WIQAR Perfumes. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Helper function to generate admin email HTML
const generateAdminEmailHTML = (order, orderNumber) => {
  const itemsList = order.items.map(item => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px; text-align: left;">${item.name}</td>
      <td style="padding: 12px; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; text-align: right;">${formatPrice(item.price)}</td>
      <td style="padding: 12px; text-align: right;">${formatPrice(item.price * item.quantity)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Order Received - WIQAR Perfumes</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }
        .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #10b981; }
        .header h1 { color: #10b981; margin: 0; font-size: 28px; }
        .alert { background-color: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; }
        .order-info { background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background-color: #374151; color: white; padding: 12px; text-align: left; }
        .total-row { font-weight: bold; border-top: 2px solid #e5e7eb; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; margin-top: 20px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #8C5A3C; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛍️ New Order Received!</h1>
          <p>A new order has been placed on WIQAR Perfumes</p>
        </div>
        
        <div class="alert">
          <p><strong>⚠️ ACTION REQUIRED:</strong> Please review and process this order.</p>
        </div>
        
        <div class="order-info">
          <p><strong>Order Number:</strong> ${orderNumber}</p>
          <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
          <p><strong>Order Status:</strong> ${order.orderStatus}</p>
          <p><strong>Payment Method:</strong> ${order.paymentMethod === 'cash_on_delivery' ? '💰 Cash on Delivery' : order.paymentMethod}</p>
          <p><strong>Payment Status:</strong> ${order.paymentStatus}</p>
        </div>
        
        <div class="customer-info">
          <h3>👤 Customer Information</h3>
          <p><strong>Name:</strong> ${order.customer.fullName}</p>
          <p><strong>Phone:</strong> ${order.customer.phone}</p>
          <p><strong>Email:</strong> <a href="mailto:${order.customer.email}">${order.customer.email}</a></p>
          <p><strong>Address:</strong> ${order.customer.address}</p>
          <p><strong>City:</strong> ${order.customer.city}</p>
          ${order.customer.postalCode ? `<p><strong>Postal Code:</strong> ${order.customer.postalCode}</p>` : ''}
          ${order.notes ? `<p><strong>Order Notes:</strong> ${order.notes}</p>` : ''}
        </div>
        
        <div class="order-details">
          <h3>📦 Order Summary</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsList}
              <tr class="total-row">
                <td colspan="3" style="padding: 12px; text-align: right; font-weight: bold;">Subtotal:</td>
                <td style="padding: 12px; text-align: right;">${formatPrice(order.subtotal)}</td>
              </tr>
              <tr>
                <td colspan="3" style="padding: 12px; text-align: right;">Shipping Cost:</td>
                <td style="padding: 12px; text-align: right;">${formatPrice(order.shippingCost)}</td>
              </tr>
              <tr style="background-color: #f3f4f6;">
                <td colspan="3" style="padding: 12px; text-align: right; font-weight: bold; font-size: 18px;">Total:</td>
                <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 18px; color: #10b981;">${formatPrice(order.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} WIQAR Perfumes - Admin Notification</p>
          <p>This is an automated notification from your e-commerce platform.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Helper function to send emails
const sendOrderEmails = async (order, orderNumber) => {
  const customerEmailHTML = generateCustomerEmailHTML(order, orderNumber);
  const adminEmailHTML = generateAdminEmailHTML(order, orderNumber);
  
  const customerEmail = {
    to: order.customer.email,
    from: FROM_EMAIL,
    subject: `Order Confirmation #${orderNumber} - WIQAR Perfumes`,
    html: customerEmailHTML,
    text: `Thank you for your order #${orderNumber}! Total: ${formatPrice(order.total)}. We'll process your order soon.`
  };
  
  const adminEmail = {
    to: ADMIN_EMAIL,
    from: FROM_EMAIL,
    subject: `🛍️ New Order #${orderNumber} - ${formatPrice(order.total)}`,
    html: adminEmailHTML,
    text: `New order received! Order #${orderNumber} from ${order.customer.fullName}. Total: ${formatPrice(order.total)}`
  };
  
  // Send both emails in parallel
  const results = await Promise.allSettled([
    sgMail.send(customerEmail),
    sgMail.send(adminEmail)
  ]);
  
  // Log results
  results.forEach((result, index) => {
    const emailType = index === 0 ? 'Customer' : 'Admin';
    if (result.status === 'fulfilled') {
      console.log(`✅ ${emailType} email sent successfully for order ${orderNumber}`);
    } else {
      console.error(`❌ Failed to send ${emailType} email for order ${orderNumber}:`, result.reason);
    }
  });
  
  return results;
};

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

    console.log('=== CREATE ORDER DEBUG ===');
    console.log('Order items count:', items?.length);
    console.log('Customer email:', customer?.email);
    console.log('Total amount:', total);

    // Basic validation
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    }

    if (!customer || !customer.fullName || !customer.email || !customer.phone || !customer.address || !customer.city) {
      return res.status(400).json({ message: 'Please provide all required customer information' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer.email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
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
    console.log(`✅ Order created successfully: ${orderNumber}`);

    // ✨ SEND EMAILS (Non-blocking - will run in background)
    sendOrderEmails(createdOrder, orderNumber).catch(err => {
      console.error('Background email sending failed:', err);
    });

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

// @desc    Resend order confirmation email
// @route   POST /api/orders/:id/resend-email
// @access  Private/Admin
const resendOrderEmail = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    await sendOrderEmails(order, order.orderNumber);
    
    res.json({ 
      success: true, 
      message: 'Order confirmation emails resent successfully' 
    });
    
  } catch (error) {
    console.error('Email resend error:', error);
    res.status(500).json({ 
      message: 'Error resending emails', 
      error: error.message 
    });
  }
};

// @desc    Test email configuration
// @route   GET /api/orders/test-email
// @access  Private/Admin
const testEmailConfig = async (req, res) => {
  try {
    const testOrder = {
      orderNumber: 'TEST-001',
      customer: {
        fullName: 'Test Customer',
        email: req.query.email || ADMIN_EMAIL,
        phone: '+216 00 000 000',
        address: 'Test Address',
        city: 'Test City'
      },
      items: [
        { name: 'Test Product', quantity: 1, price: 100 }
      ],
      subtotal: 100,
      shippingCost: 10,
      total: 110,
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'pending',
      orderStatus: 'pending',
      createdAt: new Date()
    };
    
    await sendOrderEmails(testOrder, 'TEST-001');
    
    res.json({ 
      success: true, 
      message: 'Test email sent successfully' 
    });
    
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ 
      message: 'Error sending test email', 
      error: error.message 
    });
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
  cancelOrder,
  resendOrderEmail,  
  testEmailConfig    
};