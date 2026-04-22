// routes/userRoutes.js
const express = require('express');
const { 
  loginUser, 
  registerUser, 
  createAdminBySuperAdmin,
  getUserProfile, 
  updateUserProfile,
  uploadProfilePicture,
  getAllUsers,
  updateUserApiPermissions,
  toggleUserStatus,
  getApiEndpoints,
  updateUserById,
  getUserById,
  blockUser,
  unblockUser,
  getBlockedUsers,
  deleteUser,
  // Add the new forgot password methods
  forgotPassword,
  resendVerificationCode,
  verifyResetCode,
  resetPassword
} = require('../controllers/userController');
const { protect, superAdminOnly } = require('../middleware/auth');
const upload = require('../config/multer');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================

// Authentication
router.post('/login', loginUser);
router.post('/register', upload.single('profilePicture'), registerUser);
router.post('/register-admin', upload.single('profilePicture'), registerUser); // Optional

// Forgot Password Routes (Public)
router.post('/forgot-password', forgotPassword);
router.post('/resend-code', resendVerificationCode);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', resetPassword);

// ==================== PROTECTED ROUTES (Profile) ====================
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, upload.single('profilePicture'), updateUserProfile);

router.post('/upload-profile-picture', protect, upload.single('profilePicture'), uploadProfilePicture);

// ==================== SUPER ADMIN ONLY ROUTES ====================
// These MUST be before any /:userId routes
router.get('/all', protect, superAdminOnly, getAllUsers);  // Changed from /users to /all
router.get('/blocked', protect, superAdminOnly, getBlockedUsers);
router.get('/api-endpoints', protect, superAdminOnly, getApiEndpoints);
router.post('/create-admin', protect, superAdminOnly, upload.single('profilePicture'), createAdminBySuperAdmin);

// Block/Unblock routes (specific userId)
router.put('/:userId/block', protect, superAdminOnly, blockUser);
router.put('/:userId/unblock', protect, superAdminOnly, unblockUser);
router.put('/:userId/permissions', protect, superAdminOnly, updateUserApiPermissions);
router.put('/:userId/toggle-status', protect, superAdminOnly, toggleUserStatus);
router.delete('/:userId', protect, superAdminOnly, deleteUser);

// Generic user routes (MUST BE LAST)
router.get('/:userId', protect, superAdminOnly, getUserById);
router.put('/:userId', protect, superAdminOnly, upload.single('profilePicture'), updateUserById);

// Backward compatibility (optional)
router.post('/', upload.single('profilePicture'), registerUser);

module.exports = router;