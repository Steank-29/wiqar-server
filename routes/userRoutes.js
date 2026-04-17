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
  deleteUser  
} = require('../controllers/userController');
const { protect, superAdminOnly } = require('../middleware/auth');
const upload = require('../config/multer');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
router.post('/login', loginUser);
router.post('/register', upload.single('profilePicture'), registerUser);

// ==================== PROTECTED ROUTES (Profile - MUST COME FIRST) ====================
// These routes MUST be defined BEFORE the generic /:userId routes
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, upload.single('profilePicture'), updateUserProfile);

router.post('/upload-profile-picture', protect, upload.single('profilePicture'), uploadProfilePicture);

// ==================== SUPER ADMIN ONLY ROUTES ====================
// Specific routes before generic ones
router.get('/users', protect, superAdminOnly, getAllUsers);
router.get('/users/blocked', protect, superAdminOnly, getBlockedUsers);
router.get('/api-endpoints', protect, superAdminOnly, getApiEndpoints);
router.delete('/:userId', protect, superAdminOnly, deleteUser);
router.post('/create-admin', protect, superAdminOnly, upload.single('profilePicture'), createAdminBySuperAdmin);

// Block/Unblock routes (specific)
router.put('/:userId/block', protect, superAdminOnly, blockUser);
router.put('/:userId/unblock', protect, superAdminOnly, unblockUser);

// User management (specific)
router.put('/:userId/permissions', protect, superAdminOnly, updateUserApiPermissions);
router.put('/:userId/toggle-status', protect, superAdminOnly, toggleUserStatus);

// ==================== GENERIC USER ROUTES (MUST COME LAST) ====================
// These catch-all routes must be defined AFTER all specific routes
router.get('/:userId', protect, superAdminOnly, getUserById);
router.put('/:userId', protect, superAdminOnly, upload.single('profilePicture'), updateUserById);

// Backward compatibility
router.post('/', upload.single('profilePicture'), registerUser);

module.exports = router;