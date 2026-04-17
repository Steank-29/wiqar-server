const express = require('express');
const {
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
} = require('../controllers/orderController');
const { protect, superAdminOnly, adminOrSuperAdmin } = require('../middleware/auth');
const { checkBlockedApis } = require('../middleware/apiBlocker');

const router = express.Router();

// Public routes (no authentication needed)
router.post('/', createOrder);
router.get('/number/:orderNumber', getOrderByNumber);
router.get('/customer/:email', getCustomerOrders);
router.get('/stats/summary', getOrderStats);

// Admin only routes (admin or super admin can access)
router.get('/', 
  protect, 
  adminOrSuperAdmin, 
  getOrders
);

router.get('/:id', 
  protect, 
  adminOrSuperAdmin, 
  getOrderById
);

router.put('/:id/status', 
  protect, 
  adminOrSuperAdmin, 
  checkBlockedApis('/api/orders/:id/status', 'PUT'),
  updateOrderStatus
);

router.put('/:id/payment-status', 
  protect, 
  adminOrSuperAdmin, 
  checkBlockedApis('/api/orders/:id/payment-status', 'PUT'),
  updatePaymentStatus
);

router.put('/:id/tracking', 
  protect, 
  adminOrSuperAdmin, 
  checkBlockedApis('/api/orders/:id/tracking', 'PUT'),
  addTrackingInfo
);

// Super admin only routes (only super admin can access)
router.delete('/:id', 
  protect, 
  superAdminOnly, 
  checkBlockedApis('/api/orders/:id', 'DELETE'),
  deleteOrder
);

router.delete('/bulk/delete', 
  protect, 
  superAdminOnly, 
  checkBlockedApis('/api/orders/bulk/delete', 'DELETE'),
  bulkDeleteOrders
);

router.put('/:id/cancel', 
  protect, 
  superAdminOnly, 
  checkBlockedApis('/api/orders/:id/cancel', 'PUT'),
  cancelOrder
);

module.exports = router;