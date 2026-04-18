const User = require('../models/user');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Helper function to delete old profile picture
const deleteOldProfilePicture = (picturePath) => {
  if (picturePath && picturePath !== 'default-avatar.jpg' && picturePath !== 'default-avatar.png') {
    const fullPath = path.join(__dirname, '..', picturePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
};

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Add validation for required fields
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Please provide email and password' 
      });
    }
    
    const user = await User.findOne({ email }).select('+password');
    
    // Check if user exists and password matches
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ 
        message: 'Invalid email or password' 
      });
    }
    
    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({ 
        message: 'Account is deactivated. Please contact support.' 
      });
    }
    
    // Send success response
    res.json({
      success: true,
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
      phoneNumber: user.phoneNumber,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      apiPermissions: user.apiPermissions,
      blockedApis: user.blockedApis,
      token: user.getSignedJwtToken()
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Server error. Please try again later.' 
    });
  }
};

// @desc    Register a new user (normal admin registration)
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      password, 
      dateOfBirth, 
      gender, 
      phoneNumber 
    } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ message: 'User already exists' });
    }

    let profilePicture = 'default-avatar.jpg';
    if (req.file) {
      profilePicture = req.file.path;
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      dateOfBirth,
      gender,
      phoneNumber,
      role: 'admin', // Default role for public registration
      profilePicture
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        phoneNumber: user.phoneNumber,
        token: user.getSignedJwtToken()
      });
    } else {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create super admin or admin (only super admin can do this)
// @route   POST /api/users/create-admin
// @access  Private/Super-Admin
const createAdminBySuperAdmin = async (req, res) => {
  try {
    // Only super admin can access this
    if (req.user.role !== 'super-admin') {
      return res.status(403).json({ 
        message: 'Only super admin can create new admins or super admins' 
      });
    }

    const { 
      firstName, 
      lastName, 
      email, 
      password, 
      dateOfBirth, 
      gender, 
      phoneNumber,
      role, // 'admin' or 'super-admin'
      apiPermissions, // Optional: specific API permissions for admin
      blockedApis // Optional: APIs to block for this user
    } = req.body;

    // Validate role
    if (role && !['admin', 'super-admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be admin or super-admin' });
    }

    const userRole = role || 'admin';

    const userExists = await User.findOne({ email });

    if (userExists) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ message: 'User already exists' });
    }

    let profilePicture = 'default-avatar.jpg';
    if (req.file) {
      profilePicture = req.file.path;
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      dateOfBirth,
      gender,
      phoneNumber,
      role: userRole,
      profilePicture,
      createdBy: req.user._id,
      apiPermissions: apiPermissions || [],
      blockedApis: blockedApis || []
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        phoneNumber: user.phoneNumber,
        createdBy: user.createdBy,
        apiPermissions: user.apiPermissions,
        blockedApis: user.blockedApis,
        message: `${userRole} created successfully`
      });
    } else {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    if (user) {
      res.json({
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        phoneNumber: user.phoneNumber,
        addresses: user.addresses,
        apiPermissions: user.apiPermissions,
        blockedApis: user.blockedApis,
        createdBy: user.createdBy
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Upload profile picture only
// @route   POST /api/users/upload-profile-picture
// @access  Private
const uploadProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.file) {
      deleteOldProfilePicture(user.profilePicture);
      user.profilePicture = req.file.path;
      await user.save();
      
      res.json({
        message: 'Profile picture updated successfully',
        profilePicture: user.profilePicture
      });
    } else {
      res.status(400).json({ message: 'No file uploaded' });
    }
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all users (super admin only)
// @route   GET /api/users
// @access  Private/Super-Admin
const getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'super-admin') {
      return res.status(403).json({ message: 'Not authorized to view all users' });
    }
    
    const users = await User.find({}).select('-password').populate('createdBy', 'firstName lastName email');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user API permissions (super admin only)
// @route   PUT /api/users/:userId/permissions
// @access  Private/Super-Admin
const updateUserApiPermissions = async (req, res) => {
  try {
    if (req.user.role !== 'super-admin') {
      return res.status(403).json({ message: 'Only super admin can update permissions' });
    }
    
    const { userId } = req.params;
    const { apiPermissions, blockedApis } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Don't allow changing super admin permissions
    if (user.role === 'super-admin') {
      return res.status(403).json({ message: 'Cannot modify super admin permissions' });
    }
    
    if (apiPermissions) user.apiPermissions = apiPermissions;
    if (blockedApis) user.blockedApis = blockedApis;
    
    await user.save();
    
    res.json({
      message: 'Permissions updated successfully',
      apiPermissions: user.apiPermissions,
      blockedApis: user.blockedApis
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Deactivate/Activate user (super admin only)
// @route   PUT /api/users/:userId/toggle-status
// @access  Private/Super-Admin
const toggleUserStatus = async (req, res) => {
  try {
    if (req.user.role !== 'super-admin') {
      return res.status(403).json({ message: 'Only super admin can change user status' });
    }
    
    const { userId } = req.params;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Don't allow deactivating super admin
    if (user.role === 'super-admin' && user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Cannot deactivate another super admin' });
    }
    
    user.isActive = !user.isActive;
    await user.save();
    
    res.json({
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: user.isActive
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// controllers/userController.js

// @desc    Delete user (super admin only)
// @route   DELETE /api/users/:userId
// @access  Private/Super-Admin
const deleteUser = async (req, res) => {
  try {
    // Check if user is super admin
    if (!req.user || req.user.role !== 'super-admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Only super admin can delete users' 
      });
    }

    const { userId } = req.params;
    
    // Validate userId
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID provided' 
      });
    }
    
    // Find the user to delete
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Don't allow deleting super admin
    if (user.role === 'super-admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Cannot delete a super admin' 
      });
    }
    
    // Don't allow deleting yourself
    if (userId === req.user._id.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'You cannot delete your own account' 
      });
    }
    
    // Delete profile picture if not default
    if (user.profilePicture && user.profilePicture !== 'default-avatar.jpg' && user.profilePicture !== 'default-avatar.png') {
      const fs = require('fs');
      const path = require('path');
      const fullPath = path.join(__dirname, '..', user.profilePicture);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    
    // Delete the user
    await user.deleteOne();
    
    console.log('User deleted successfully:', user.email);
    
    res.status(200).json({
      success: true,
      message: `User ${user.email} has been deleted successfully`
    });
  } catch (error) {
    console.error('Error in deleteUser:', error);
    res.status(500).json({ 
      success: false,
      message: error.message || 'Internal server error while deleting user'
    });
  }
};

// @desc    Get API endpoints list (for dashboard configuration)
// @route   GET /api/users/api-endpoints
// @access  Private/Super-Admin
const getApiEndpoints = async (req, res) => {
  try {
    // Define all available API endpoints
    const endpoints = [
      { path: '/api/users/profile', method: 'GET', description: 'Get user profile' },
      { path: '/api/users/profile', method: 'PUT', description: 'Update user profile' },
      { path: '/api/users/upload-profile-picture', method: 'POST', description: 'Upload profile picture' },
      { path: '/api/products', method: 'GET', description: 'Get all products' },
      { path: '/api/products', method: 'POST', description: 'Create product' },
      { path: '/api/products/:id', method: 'PUT', description: 'Update product' },
      { path: '/api/products/:id', method: 'DELETE', description: 'Delete product' },
      { path: '/api/orders', method: 'GET', description: 'Get all orders' },
      { path: '/api/orders', method: 'POST', description: 'Create order' },
      // Add more endpoints as needed
    ];
    
    res.json(endpoints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// controllers/userController.js - Add these updated functions

// controllers/userController.js

// @desc    Block/Unblock user (super admin only)
// @route   PUT /api/users/:userId/block
// @access  Private/Super-Admin
const blockUser = async (req, res, next) => {
  try {
    console.log('Block user request received for userId:', req.params.userId);
    console.log('Request body:', req.body);
    
    // Check if user is super admin
    if (!req.user || req.user.role !== 'super-admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Only super admin can block users' 
      });
    }

    const { userId } = req.params;
    
    // Validate userId
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID provided' 
      });
    }
    
    const { blockReason, blockDuration } = req.body;
    
    // Find the user to block
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    console.log('Found user:', user.email, 'Role:', user.role);
    
    // Don't allow blocking super admin
    if (user.role === 'super-admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Cannot block a super admin' 
      });
    }
    
    // Don't allow blocking yourself
    if (userId === req.user._id.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'You cannot block yourself' 
      });
    }
    
    // Set block fields
    user.isBlocked = true;
    user.blockedAt = new Date();
    user.blockReason = blockReason || 'No reason provided';
    user.blockedBy = req.user._id;
    
    if (blockDuration && blockDuration > 0) {
      user.blockedUntil = new Date(Date.now() + blockDuration * 24 * 60 * 60 * 1000);
    }
    
    await user.save();
    
    console.log('User blocked successfully:', user.email);
    
    res.status(200).json({
      success: true,
      message: `User ${user.email} has been blocked successfully`,
      data: {
        isBlocked: user.isBlocked,
        blockedAt: user.blockedAt,
        blockedUntil: user.blockedUntil,
        blockReason: user.blockReason
      }
    });
  } catch (error) {
    console.error('Error in blockUser:', error);
    res.status(500).json({ 
      success: false,
      message: error.message || 'Internal server error while blocking user',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Unblock user (super admin only)
// @route   PUT /api/users/:userId/unblock
// @access  Private/Super-Admin
const unblockUser = async (req, res, next) => {
  try {
    console.log('Unblock user request received for userId:', req.params.userId);
    
    if (!req.user || req.user.role !== 'super-admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Only super admin can unblock users' 
      });
    }

    const { userId } = req.params;
    
    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid user ID provided' 
      });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    user.isBlocked = false;
    user.blockedAt = null;
    user.blockedUntil = null;
    user.blockReason = null;
    user.blockedBy = null;
    
    await user.save();
    
    console.log('User unblocked successfully:', user.email);
    
    res.status(200).json({
      success: true,
      message: `User ${user.email} has been unblocked successfully`,
      data: { isBlocked: user.isBlocked }
    });
  } catch (error) {
    console.error('Error in unblockUser:', error);
    res.status(500).json({ 
      success: false,
      message: error.message || 'Internal server error while unblocking user'
    });
  }
};

// @desc    Get all blocked users (super admin only)
// @route   GET /api/users/blocked
// @access  Private/Super-Admin
const getBlockedUsers = async (req, res, next) => {
  try {
    // Only super admin can access this
    if (req.user.role !== 'super-admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Only super admin can view blocked users' 
      });
    }

    const blockedUsers = await User.find({ isBlocked: true })
      .select('-password')
      .populate('createdBy', 'firstName lastName email')
      .populate('blockedBy', 'firstName lastName email');
    
    res.status(200).json({
      success: true,
      count: blockedUsers.length,
      data: blockedUsers
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update any user profile (super admin only)
// @route   PUT /api/users/:userId
// @access  Private/Super-Admin
const updateUserById = async (req, res, next) => {
  try {
    // Only super admin can access this
    if (req.user.role !== 'super-admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Only super admin can update other users' 
      });
    }

    const { userId } = req.params;
    const user = await User.findById(userId);
    
    if (!user) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Update fields
    if (req.body.firstName) user.firstName = req.body.firstName;
    if (req.body.lastName) user.lastName = req.body.lastName;
    if (req.body.email) user.email = req.body.email;
    if (req.body.phoneNumber) user.phoneNumber = req.body.phoneNumber;
    if (req.body.dateOfBirth) user.dateOfBirth = req.body.dateOfBirth;
    if (req.body.gender) user.gender = req.body.gender;
    
    // Update role (super admin only can change roles)
    if (req.body.role && ['admin', 'super-admin'].includes(req.body.role)) {
      // Prevent demoting yourself from super-admin
      if (userId === req.user._id.toString() && req.body.role !== 'super-admin') {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(403).json({ 
          success: false,
          message: 'You cannot demote yourself from super-admin' 
        });
      }
      user.role = req.body.role;
    }
    
    // Update password if provided
    if (req.body.password) {
      user.password = req.body.password;
    }

    // Update profile picture if uploaded
    if (req.file) {
      deleteOldProfilePicture(user.profilePicture);
      user.profilePicture = req.file.path;
    }

    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        _id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        role: updatedUser.role,
        profilePicture: updatedUser.profilePicture,
        phoneNumber: updatedUser.phoneNumber,
        dateOfBirth: updatedUser.dateOfBirth,
        gender: updatedUser.gender,
        isActive: updatedUser.isActive,
        isBlocked: updatedUser.isBlocked
      }
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

// @desc    Get user by ID (super admin only)
// @route   GET /api/users/:userId
// @access  Private/Super-Admin
const getUserById = async (req, res, next) => {
  try {
    // Only super admin can access this
    if (req.user.role !== 'super-admin') {
      return res.status(403).json({ 
        success: false,
        message: 'Only super admin can view other users' 
      });
    }

    const { userId } = req.params;
    const user = await User.findById(userId)
      .select('-password')
      .populate('createdBy', 'firstName lastName email')
      .populate('blockedBy', 'firstName lastName email');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// Update the updateUserProfile function
const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      if (req.body.firstName) user.firstName = req.body.firstName;
      if (req.body.lastName) user.lastName = req.body.lastName;
      if (req.body.email) user.email = req.body.email;
      if (req.body.phoneNumber) user.phoneNumber = req.body.phoneNumber;
      
      if (req.body.password) {
        user.password = req.body.password;
      }

      if (req.file) {
        deleteOldProfilePicture(user.profilePicture);
        user.profilePicture = req.file.path;
      }

      const updatedUser = await user.save();

      res.status(200).json({
        success: true,
        data: {
          _id: updatedUser._id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          role: updatedUser.role,
          profilePicture: updatedUser.profilePicture,
          phoneNumber: updatedUser.phoneNumber,
          token: updatedUser.getSignedJwtToken()
        }
      });
    } else {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

// Make sure to export all functions
module.exports = {
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
};