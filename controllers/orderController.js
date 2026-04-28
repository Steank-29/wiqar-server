const Order = require('../models/Order');
const sgMail = require('@sendgrid/mail');

// Initialize SendGrid
if (!process.env.SENDGRID_API_KEY) {
  console.error('⚠️ WARNING: SENDGRID_API_KEY is not set in environment variables!');
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('✅ SendGrid initialized successfully');
}

// Email configuration
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@wiqar-perfume.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@wiqar-perfume.com';

// Brand colors (matching your theme)
const BRAND = {
  name: 'WIQAR',
  primary: '#8C5A3C',
  primaryLight: '#B07850',
  primaryDark: '#5C3520',
  secondary: '#D4A574',
  accent: '#C6A15B',
  success: '#10B981',
  warning: '#F59E0B',
  white: '#FFFFFF',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
};

// Helper functions
const formatPrice = (price) => {
  return new Intl.NumberFormat('tn-TN', { style: 'currency', currency: 'TND' }).format(price);
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Get status badge style
const getStatusBadge = (status) => {
  const statusStyles = {
    pending: { bg: '#FEF3C7', color: '#D97706', text: 'En attente' },
    confirmed: { bg: '#DBEAFE', color: '#2563EB', text: 'Confirmée' },
    processing: { bg: '#E0E7FF', color: '#4F46E5', text: 'En traitement' },
    shipped: { bg: '#D1FAE5', color: '#059669', text: 'Expédiée' },
    delivered: { bg: '#D1FAE5', color: '#059669', text: 'Livrée' },
    cancelled: { bg: '#FEE2E2', color: '#DC2626', text: 'Annulée' }
  };
  return statusStyles[status] || statusStyles.pending;
};

// ==================== CUSTOMER EMAIL TEMPLATE ====================
const generateCustomerEmailHTML = (order, orderNumber) => {
  const itemsList = order.items.map(item => `
    <tr style="border-bottom: 1px solid ${BRAND.gray200};">
      <td style="padding: 14px 8px; text-align: left;">
        <strong style="color: ${BRAND.gray800};">${item.name}</strong>
        <div style="font-size: 12px; color: ${BRAND.gray500}; margin-top: 4px;">
          ${item.selectedSize || ''} • Quantité: ${item.quantity}
        </div>
      </td>
      <td style="padding: 14px 8px; text-align: right; color: ${BRAND.gray700};">
        ${formatPrice(item.price * item.quantity)}
      </td>
    </tr>
  `).join('');

  const statusBadge = getStatusBadge(order.orderStatus);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmation de commande - ${BRAND.name}</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: ${BRAND.gray50}; }
    .container { max-width: 580px; margin: 0 auto; padding: 20px; }
    .card { background: ${BRAND.white}; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryDark} 100%); padding: 30px 20px; text-align: center; }
    .header h1 { color: ${BRAND.white}; font-size: 28px; margin: 0; font-weight: 600; letter-spacing: 2px; }
    .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px; }
    .content { padding: 30px; }
    .status-badge { display: inline-block; padding: 6px 16px; border-radius: 50px; font-size: 13px; font-weight: 600; background: ${statusBadge.bg}; color: ${statusBadge.color}; }
    .info-section { background: ${BRAND.gray50}; border-radius: 16px; padding: 20px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
    .info-label { color: ${BRAND.gray500}; }
    .info-value { color: ${BRAND.gray700}; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .total-row { border-top: 2px solid ${BRAND.gray200}; margin-top: 10px; padding-top: 10px; }
    .grand-total { background: ${BRAND.primaryLight}10; border-radius: 12px; padding: 16px; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; background: ${BRAND.gray50}; font-size: 12px; color: ${BRAND.gray500}; }
    .btn { display: inline-block; padding: 12px 28px; background: ${BRAND.primary}; color: ${BRAND.white}; text-decoration: none; border-radius: 50px; font-weight: 500; margin: 20px 0 10px; }
    hr { border: none; border-top: 1px solid ${BRAND.gray200}; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>${BRAND.name}</h1>
        <p>L'Art du Parfum d'Exception</p>
      </div>
      
      <div class="content">
        <div style="text-align: center; margin-bottom: 24px;">
          <span class="status-badge">${statusBadge.text}</span>
          <h2 style="color: ${BRAND.gray800}; margin: 16px 0 4px; font-size: 22px;">Merci pour votre commande !</h2>
          <p style="color: ${BRAND.gray500}; margin: 0;">Commande #${orderNumber}</p>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">📅 Date</span>
            <span class="info-value">${formatDate(order.createdAt)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">💳 Paiement</span>
            <span class="info-value">${order.paymentMethod === 'cash_on_delivery' ? 'Paiement à la livraison' : 'Virement bancaire'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">🚚 Livraison</span>
            <span class="info-value">${order.shippingCost === 0 ? 'Gratuite' : formatPrice(order.shippingCost)}</span>
          </div>
        </div>

        <h3 style="color: ${BRAND.gray800}; margin: 0 0 12px;">📦 Récapitulatif</h3>
        <table>
          <tbody>
            ${itemsList}
          </tbody>
        </table>

        <div class="grand-total">
          <div class="info-row" style="margin-bottom: 0;">
            <span style="font-weight: 600; color: ${BRAND.gray800};">Total</span>
            <span style="font-size: 20px; font-weight: 700; color: ${BRAND.primary};">${formatPrice(order.total)}</span>
          </div>
        </div>

        <hr>

        <div class="info-section" style="margin-top: 0;">
          <h3 style="margin: 0 0 12px; font-size: 14px; color: ${BRAND.gray700};">📍 Livraison</h3>
          <p style="margin: 0 0 4px; color: ${BRAND.gray700};"><strong>${order.customer.fullName}</strong></p>
          <p style="margin: 0; color: ${BRAND.gray600}; font-size: 13px;">${order.customer.address}, ${order.customer.city} ${order.customer.postalCode || ''}</p>
          <p style="margin: 8px 0 0; color: ${BRAND.gray600}; font-size: 13px;">📞 ${order.customer.phone}</p>
        </div>

        <div style="text-align: center;">
          <a href="${process.env.SHOP_URL || 'https://wiqar-perfume.com'}" class="btn">Continuer mes achats</a>
        </div>
      </div>

      <div class="footer">
        <p><strong>${BRAND.name}</strong> — Parfums d'Exception depuis 2020</p>
        <p>${ADMIN_EMAIL} • ${process.env.SHOP_URL || 'www.wiqar-perfume.com'}</p>
        <p style="margin-top: 16px;">© ${new Date().getFullYear()} ${BRAND.name}. Tous droits réservés.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
};

// ==================== ADMIN EMAIL TEMPLATE ====================
const generateAdminEmailHTML = (order, orderNumber) => {
  const itemsList = order.items.map(item => `
    <tr style="border-bottom: 1px solid ${BRAND.gray200};">
      <td style="padding: 10px 8px;">${item.name}</td>
      <td style="padding: 10px 8px; text-align: center;">${item.selectedSize || '-'}</td>
      <td style="padding: 10px 8px; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px 8px; text-align: right;">${formatPrice(item.price)}</td>
      <td style="padding: 10px 8px; text-align: right;"><strong>${formatPrice(item.price * item.quantity)}</strong></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Nouvelle commande - ${BRAND.name}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
    .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px 25px; color: white; }
    .content { padding: 25px; }
    .alert { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th { background: #1a1a2e; color: white; padding: 10px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    .total-box { background: #f8fafc; padding: 15px; border-radius: 12px; margin-top: 20px; }
    .order-info { background: #f1f5f9; padding: 15px; border-radius: 12px; margin-bottom: 20px; }
    .btn { display: inline-block; padding: 10px 20px; background: ${BRAND.primary}; color: white; text-decoration: none; border-radius: 8px; }
    hr { margin: 15px 0; border: none; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">🛍️ Nouvelle commande</h2>
      <p style="margin: 5px 0 0; opacity: 0.8;">${orderNumber}</p>
    </div>
    
    <div class="content">
      <div class="alert">
        ⚠️ <strong>Action requise</strong> — Veuillez traiter cette commande
      </div>

      <div class="order-info">
        <h3 style="margin: 0 0 10px;">📋 Informations client</h3>
        <p><strong>Nom:</strong> ${order.customer.fullName}</p>
        <p><strong>Email:</strong> <a href="mailto:${order.customer.email}">${order.customer.email}</a></p>
        <p><strong>Téléphone:</strong> ${order.customer.phone}</p>
        <p><strong>Adresse:</strong> ${order.customer.address}, ${order.customer.city} ${order.customer.postalCode || ''}</p>
        <p><strong>Paiement:</strong> ${order.paymentMethod === 'cash_on_delivery' ? '💰 Paiement à la livraison' : '🏦 Virement bancaire'}</p>
        ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
      </div>

      <h3>📦 Articles commandés</h3>
      <table>
        <thead>
          <tr><th>Produit</th><th>Taille</th><th>Qté</th><th>PU</th><th>Total</th></tr>
        </thead>
        <tbody>${itemsList}</tbody>
      </table>

      <div class="total-box">
        <p><strong>Sous-total:</strong> ${formatPrice(order.subtotal)}</p>
        <p><strong>Frais de livraison:</strong> ${order.shippingCost === 0 ? 'Gratuit' : formatPrice(order.shippingCost)}</p>
        <hr>
        <h3 style="margin: 10px 0 0;">Total: ${formatPrice(order.total)}</h3>
      </div>

      <p style="text-align: center; margin-top: 25px;">
        <a href="${process.env.ADMIN_DASHBOARD_URL || 'https://admin.wiqar-perfume.com'}/orders/${order._id}" class="btn">📋 Voir dans l'administration</a>
      </p>
    </div>
  </div>
</body>
</html>`;
};

// ==================== SEND EMAILS FUNCTION ====================
const sendOrderEmails = async (order, orderNumber) => {
  const customerEmail = {
    to: order.customer.email,
    from: FROM_EMAIL,
    subject: `✨ Merci pour votre commande #${orderNumber} - ${BRAND.name}`,
    html: generateCustomerEmailHTML(order, orderNumber),
    text: `Merci pour votre commande #${orderNumber}. Total: ${formatPrice(order.total)}. Nous traiterons votre commande rapidement.`
  };
  
  const adminEmail = {
    to: ADMIN_EMAIL,
    from: FROM_EMAIL,
    subject: `🛍️ Nouvelle commande #${orderNumber} - ${formatPrice(order.total)}`,
    html: generateAdminEmailHTML(order, orderNumber),
    text: `Nouvelle commande! #${orderNumber} de ${order.customer.fullName}. Total: ${formatPrice(order.total)}`
  };
  
  const results = await Promise.allSettled([
    sgMail.send(customerEmail),
    sgMail.send(adminEmail)
  ]);
  
  results.forEach((result, index) => {
    const emailType = index === 0 ? 'Customer' : 'Admin';
    if (result.status === 'fulfilled') {
      console.log(`✅ ${emailType} email sent for order ${orderNumber}`);
    } else {
      console.error(`❌ Failed to send ${emailType} email:`, result.reason);
    }
  });
  
  return results;
};

// ==================== GET ALL ORDERS ====================
const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    let query = {};
    
    if (req.query.status) query.orderStatus = req.query.status;
    if (req.query.paymentMethod) query.paymentMethod = req.query.paymentMethod;
    
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

// ==================== GET ORDER BY ID ====================
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

// ==================== GET ORDER BY NUMBER ====================
const getOrderByNumber = async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
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

// ==================== UPDATE ORDER STATUS ====================
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
    
    if (status === 'confirmed') order.confirmedAt = Date.now();
    if (status === 'shipped') order.shippedAt = Date.now();
    if (status === 'delivered') order.deliveredAt = Date.now();
    if (status === 'cancelled') order.cancelledAt = Date.now();
    
    await order.save();

    res.json({ message: 'Order status updated', order });
  } catch (error) {
    res.status(500).json({ message: 'Error updating order', error: error.message });
  }
};

// ==================== UPDATE PAYMENT STATUS ====================
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

    res.json({ message: 'Payment status updated', order });
  } catch (error) {
    res.status(500).json({ message: 'Error updating payment status', error: error.message });
  }
};

// ==================== ADD TRACKING INFORMATION ====================
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
    
    if (order.orderStatus === 'confirmed' || order.orderStatus === 'processing') {
      order.orderStatus = 'shipped';
      order.shippedAt = Date.now();
    }
    
    await order.save();

    res.json({ message: 'Tracking information added', order });
  } catch (error) {
    res.status(500).json({ message: 'Error adding tracking info', error: error.message });
  }
};

// ==================== GET CUSTOMER ORDERS ====================
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

// ==================== GET ORDER STATISTICS ====================
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

// ==================== DELETE ORDER ====================
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

// ==================== BULK DELETE ORDERS ====================
const bulkDeleteOrders = async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'Please provide order IDs' });
    }
    const result = await Order.deleteMany({ _id: { $in: orderIds } });
    res.json({ message: `${result.deletedCount} orders deleted successfully`, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting orders', error: error.message });
  }
};

// ==================== CANCEL ORDER ====================
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
    res.json({ message: 'Order cancelled successfully', order });
  } catch (error) {
    res.status(500).json({ message: 'Error cancelling order', error: error.message });
  }
};

// ==================== CREATE NEW ORDER ====================
const createOrder = async (req, res) => {
  try {
    const { items, customer, subtotal, shippingCost, total, paymentMethod, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No order items' });
    }

    if (!customer || !customer.fullName || !customer.email || !customer.phone || !customer.address || !customer.city) {
      return res.status(400).json({ message: 'Please provide all required customer information' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer.email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    // Generate order number
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    const lastOrder = await Order.findOne({
      orderNumber: new RegExp(`ORD-${year}${month}${day}-`)
    }).sort({ orderNumber: -1 });
    
    let sequence = '0001';
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.split('-')[2]);
      sequence = (lastSequence + 1).toString().padStart(4, '0');
    }
    
    const orderNumber = `ORD-${year}${month}${day}-${sequence}`;

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

    // Send emails in background
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
    res.status(500).json({ message: 'Error creating order', error: error.message });
  }
};

// ==================== RESEND ORDER EMAIL ====================
const resendOrderEmail = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    await sendOrderEmails(order, order.orderNumber);
    res.json({ success: true, message: 'Order confirmation emails resent successfully' });
  } catch (error) {
    console.error('Email resend error:', error);
    res.status(500).json({ message: 'Error resending emails', error: error.message });
  }
};

// ==================== TEST EMAIL CONFIGURATION ====================
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
      items: [{ name: 'Test Product', quantity: 1, price: 100, selectedSize: '30ml' }],
      subtotal: 100,
      shippingCost: 10,
      total: 110,
      paymentMethod: 'cash_on_delivery',
      paymentStatus: 'pending',
      orderStatus: 'pending',
      createdAt: new Date(),
      notes: 'Test order - please ignore'
    };
    await sendOrderEmails(testOrder, 'TEST-001');
    res.json({ success: true, message: 'Test email sent successfully' });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ message: 'Error sending test email', error: error.message });
  }
};

// ==================== EXPORTS ====================
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