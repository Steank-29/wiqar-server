const express = require('express');
const router = express.Router();
const { protect, superAdminOnly, adminOrSuperAdmin } = require('../middleware/auth');
const { checkBlockedApis } = require('../middleware/apiBlocker');
const {
  submitContactForm,
  getMessages,
  updateMessageStatus,
  deleteMessage,
  getStats
} = require('../controllers/contactController');

// Public routes (no authentication)
router.post('/', submitContactForm);

// Admin & Super Admin routes (can view but not modify)
router.get('/', protect, adminOrSuperAdmin, getMessages);
router.get('/stats', protect, adminOrSuperAdmin, getStats);

// Super Admin only routes (can modify/delete)
router.put('/:id/status', 
  protect, 
  superAdminOnly, 
  checkBlockedApis('/api/contact/:id/status', 'PUT'),
  updateMessageStatus
);

router.delete('/:id', 
  protect, 
  superAdminOnly, 
  checkBlockedApis('/api/contact/:id', 'DELETE'),
  deleteMessage
);

module.exports = router;