const User = require('../models/user');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');


const verificationCodes = new Map(); // key: userId, value: { code, expiresAt }

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Helper function to generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper function to send verification email
const sendVerificationEmail = async (email, code, firstName) => {
  const mailOptions = {
    from: `"WQAR Admin" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset Verification Code - WQAR Admin',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F9F6F1;">
        <div style="background-color: #FFFFFF; border-radius: 20px; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
          <h2 style="color: #8C5A3C; font-family: 'Oswald', sans-serif; text-align: center; margin-bottom: 30px;">
            Password Reset Request
          </h2>
          
          <p style="color: #1A1A1A; font-size: 16px; line-height: 1.6;">
            Hello ${firstName || 'there'},
          </p>
          
          <p style="color: #1A1A1A; font-size: 16px; line-height: 1.6;">
            We received a request to reset your password for your WQAR Admin account. 
            Please use the verification code below to complete the process:
          </p>
          
          <div style="background-color: #F9F6F1; border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0;">
            <span style="font-family: monospace; font-size: 36px; font-weight: bold; color: #8C5A3C; letter-spacing: 8px;">
              ${code}
            </span>
          </div>
          
          <p style="color: #1A1A1A; font-size: 16px; line-height: 1.6;">
            This code will expire in <strong>10 minutes</strong>.
          </p>
          
          <p style="color: #666666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
            If you didn't request a password reset, please ignore this email or contact support 
            if you have concerns about your account security.
          </p>
          
          <hr style="border: none; border-top: 1px solid #E0E0E0; margin: 30px 0;" />
          
          <p style="color: #999999; font-size: 12px; text-align: center;">
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// ============================================
// FORGOT PASSWORD METHODS
// ============================================

// @desc    Request password reset - send verification code
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();
    
    console.log('🔍 Password reset requested for:', normalizedEmail);
    
    // Find user by email
    const user = await User.findOne({ email: normalizedEmail });
    
    if (!user) {
      console.log('❌ User not found with email:', normalizedEmail);
      return res.status(404).json({ 
        success: false,
        message: 'No account found with this email address' 
      });
    }
    
    // Check if account is active
    if (!user.isActive) {
      console.log('⚠️ Password reset attempted for inactive account:', normalizedEmail);
      return res.status(403).json({ 
        success: false,
        message: 'This account is deactivated. Please contact support.' 
      });
    }
    
    // Check if account is blocked
    if (user.isBlocked) {
      if (user.blockedUntil && user.blockedUntil > new Date()) {
        console.log('⚠️ Password reset attempted for blocked account:', normalizedEmail);
        return res.status(403).json({ 
          success: false,
          message: 'This account is currently blocked. Please contact support.' 
        });
      }
    }
    
    // Generate verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Store verification code
    verificationCodes.set(user._id.toString(), {
      code: verificationCode,
      expiresAt: expiresAt,
      attempts: 0,
      email: normalizedEmail
    });
    
    // Send verification email
    try {
      await sendVerificationEmail(
        normalizedEmail, 
        verificationCode, 
        user.firstName
      );
      
      console.log('✅ Verification code sent to:', normalizedEmail);
      
      res.status(200).json({
        success: true,
        message: 'Verification code has been sent to your email',
        userId: user._id
      });
      
    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError);
      
      // Clean up stored code if email fails
      verificationCodes.delete(user._id.toString());
      
      res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.'
      });
    }
    
  } catch (error) {
    console.error('🔥 Forgot password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error. Please try again later.' 
    });
  }
};

// @desc    Resend verification code
// @route   POST /api/users/resend-code
// @access  Public
const resendVerificationCode = async (req, res) => {
  try {
    const { email, userId } = req.body;

    if (!email || !userId) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and user ID are required' 
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    console.log('🔄 Resend code requested for:', normalizedEmail);
    
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Check if email matches
    if (user.email !== normalizedEmail) {
      return res.status(400).json({ 
        success: false,
        message: 'Email does not match user ID' 
      });
    }
    
    // Check if there's an existing code that hasn't expired
    const existingCode = verificationCodes.get(userId);
    if (existingCode && existingCode.expiresAt > new Date()) {
      // Clear old code
      verificationCodes.delete(userId);
    }
    
    // Generate new verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Store new verification code
    verificationCodes.set(userId, {
      code: verificationCode,
      expiresAt: expiresAt,
      attempts: 0,
      email: normalizedEmail
    });
    
    // Send verification email
    try {
      await sendVerificationEmail(
        normalizedEmail, 
        verificationCode, 
        user.firstName
      );
      
      console.log('✅ New verification code sent to:', normalizedEmail);
      
      res.status(200).json({
        success: true,
        message: 'New verification code has been sent to your email'
      });
      
    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError);
      
      // Clean up stored code
      verificationCodes.delete(userId);
      
      res.status(500).json({
        success: false,
        message: 'Failed to send verification email. Please try again later.'
      });
    }
    
  } catch (error) {
    console.error('🔥 Resend code error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error. Please try again later.' 
    });
  }
};

// @desc    Verify reset code
// @route   POST /api/users/verify-reset-code
// @access  Public
const verifyResetCode = async (req, res) => {
  try {
    const { userId, code } = req.body;

    if (!userId || !code) {
      return res.status(400).json({ 
        success: false,
        message: 'User ID and verification code are required' 
      });
    }

    console.log('🔐 Verifying code for userId:', userId);
    
    // Get stored verification data
    const storedData = verificationCodes.get(userId);
    
    if (!storedData) {
      console.log('❌ No verification code found for userId:', userId);
      return res.status(400).json({ 
        success: false,
        message: 'No verification code found. Please request a new one.' 
      });
    }
    
    // Check if code has expired
    if (storedData.expiresAt < new Date()) {
      console.log('❌ Verification code expired for userId:', userId);
      verificationCodes.delete(userId);
      return res.status(400).json({ 
        success: false,
        message: 'Verification code has expired. Please request a new one.' 
      });
    }
    
    // Check attempts (max 5 attempts)
    if (storedData.attempts >= 5) {
      console.log('❌ Too many failed attempts for userId:', userId);
      verificationCodes.delete(userId);
      return res.status(400).json({ 
        success: false,
        message: 'Too many failed attempts. Please request a new code.' 
      });
    }
    
    // Verify code
    if (storedData.code !== code) {
      storedData.attempts += 1;
      verificationCodes.set(userId, storedData);
      
      console.log('❌ Invalid verification code for userId:', userId);
      return res.status(400).json({ 
        success: false,
        message: `Invalid verification code. ${5 - storedData.attempts} attempts remaining.` 
      });
    }
    
    // Code is valid - generate reset token
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Create reset token (JWT that expires in 15 minutes)
    const resetToken = jwt.sign(
      { 
        userId: user._id,
        purpose: 'password-reset',
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    // Clear the verification code
    verificationCodes.delete(userId);
    
    console.log('✅ Code verified successfully for user:', user.email);
    
    res.status(200).json({
      success: true,
      message: 'Code verified successfully',
      resetToken: resetToken
    });
    
  } catch (error) {
    console.error('🔥 Verify code error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error. Please try again later.' 
    });
  }
};

// @desc    Reset password with token
// @route   POST /api/users/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { userId, resetToken, newPassword } = req.body;

    if (!userId || !resetToken || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'User ID, reset token, and new password are required' 
      });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters long' 
      });
    }
    
    if (!/(?=.*[A-Z])/.test(newPassword)) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must contain at least one uppercase letter' 
      });
    }
    
    if (!/(?=.*[0-9])/.test(newPassword)) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must contain at least one number' 
      });
    }

    console.log('🔑 Resetting password for userId:', userId);
    
    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.log('❌ Invalid or expired reset token:', jwtError.message);
      return res.status(401).json({ 
        success: false,
        message: 'Invalid or expired reset token. Please request a new code.' 
      });
    }
    
    // Check if token is for password reset
    if (decoded.purpose !== 'password-reset') {
      console.log('❌ Token purpose mismatch');
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token purpose' 
      });
    }
    
    // Check if userId matches
    if (decoded.userId !== userId) {
      console.log('❌ Token userId mismatch');
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token for this user' 
      });
    }
    
    // Find user
    const user = await User.findById(userId).select('+password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Check if email matches token
    if (user.email !== decoded.email) {
      console.log('❌ Token email mismatch');
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token for this user' 
      });
    }
    
    // Update password
    user.password = newPassword;
    
    // Clear any block status if it was due to password issues
    if (user.isBlocked && user.blockReason === 'Multiple failed login attempts') {
      user.isBlocked = false;
      user.blockedUntil = null;
      user.blockReason = null;
      user.blockedBy = null;
    }
    
    // Add password change timestamp if you have this field
    if (user.passwordChangedAt !== undefined) {
      user.passwordChangedAt = new Date();
    }
    
    await user.save();
    
    console.log('✅ Password reset successfully for user:', user.email);
    
    // Send confirmation email (optional)
    try {
      const confirmationMailOptions = {
        from: `"WQAR Admin" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Password Successfully Reset - WQAR Admin',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #F9F6F1;">
            <div style="background-color: #FFFFFF; border-radius: 20px; padding: 40px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
              <h2 style="color: #8C5A3C; font-family: 'Oswald', sans-serif; text-align: center; margin-bottom: 30px;">
                Password Reset Successful
              </h2>
              
              <p style="color: #1A1A1A; font-size: 16px; line-height: 1.6;">
                Hello ${user.firstName},
              </p>
              
              <p style="color: #1A1A1A; font-size: 16px; line-height: 1.6;">
                Your password has been successfully reset. You can now log in to your WQAR Admin account with your new password.
              </p>
              
              <div style="background-color: #F9F6F1; border-radius: 12px; padding: 20px; margin: 30px 0;">
                <p style="color: #1A1A1A; font-size: 14px; line-height: 1.6; margin: 0;">
                  <strong>Security Notice:</strong> If you did not initiate this password reset, 
                  please contact our support team immediately as your account may be compromised.
                </p>
              </div>
              
              <p style="color: #1A1A1A; font-size: 16px; line-height: 1.6;">
                Thank you for using WQAR Admin.
              </p>
            </div>
          </div>
        `
      };
      
      await transporter.sendMail(confirmationMailOptions);
      console.log('✅ Password reset confirmation email sent');
    } catch (emailError) {
      console.error('⚠️ Failed to send confirmation email:', emailError);
      // Don't fail the request if confirmation email fails
    }
    
    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });
    
  } catch (error) {
    console.error('🔥 Reset password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error. Please try again later.' 
    });
  }
};

// Optional: Clean up expired verification codes periodically
setInterval(() => {
  const now = new Date();
  for (const [key, value] of verificationCodes.entries()) {
    if (value.expiresAt < now) {
      verificationCodes.delete(key);
      console.log('🧹 Cleaned up expired verification code for:', key);
    }
  }
}, 5 * 60 * 1000); 

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
    let { email, password } = req.body;
    
    // Add validation for required fields
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Please provide email and password' 
      });
    }
    
    // Normalize email to lowercase
    email = email.toLowerCase().trim();
    
    console.log('🔍 Looking for user with email:', email);
    
    const user = await User.findOne({ email }).select('+password');
    
    // TEST 1: Check if user exists (separate error)
    if (!user) {
      console.log('❌ User not found with email:', email);
      return res.status(401).json({ 
        message: 'Email address not found in our system',
        errorType: 'EMAIL_NOT_FOUND'
      });
    }
    
    console.log('✅ User found:', user.email);
    console.log('🔐 Password hash in DB:', user.password ? user.password.substring(0, 20) + '...' : 'NO PASSWORD');
    
    // TEST 2: Check password match (separate error)
    const isPasswordMatch = await user.matchPassword(password);
    
    if (!isPasswordMatch) {
      console.log('❌ Password mismatch for user:', email);
      console.log('   Entered password length:', password.length);
      console.log('   Entered password:', '*'.repeat(password.length));
      return res.status(401).json({ 
        message: 'Incorrect password. Please try again.',
        errorType: 'INVALID_PASSWORD'
      });
    }
    
    console.log('✅ Password matched successfully!');
    
    // Check if account is active
    if (!user.isActive) {
      console.log('⚠️ Account is deactivated:', email);
      return res.status(401).json({ 
        message: 'Account is deactivated. Please contact support.',
        errorType: 'ACCOUNT_INACTIVE'
      });
    }
    
    // Check if account is blocked
    if (user.isBlocked) {
      // Check if block has expired
      if (user.blockedUntil && user.blockedUntil < new Date()) {
        // Auto-unblock if expired
        user.isBlocked = false;
        user.blockedUntil = null;
        user.blockReason = null;
        await user.save();
        console.log('✅ Auto-unblocked expired block for user:', email);
      } else {
        let blockMessage = 'Account is blocked. ';
        if (user.blockedUntil) {
          blockMessage += `Account will be unlocked on ${user.blockedUntil.toLocaleDateString()}. `;
        }
        if (user.blockReason) {
          blockMessage += `Reason: ${user.blockReason}`;
        }
        console.log('⚠️ Blocked login attempt:', email);
        return res.status(401).json({ 
          message: blockMessage,
          errorType: 'ACCOUNT_BLOCKED'
        });
      }
    }
    
    // Send success response
    console.log('🎉 Login successful for user:', email);
    
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
    console.error('🔥 Login error:', error);
    res.status(500).json({ 
      message: 'Server error. Please try again later.',
      errorType: 'SERVER_ERROR'
    });
  }
};

// @desc    Register a new user (normal admin registration)
// @route   POST /api/users/register
// @access  Public
// In userController.js - modify registerUser function
const registerUser = async (req, res) => {
  try {
    const { 
      firstName, lastName, email, password, dateOfBirth, gender, phoneNumber,
      isFirstUser  // Add this flag
    } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'User already exists' });
    }

    // Check if this is the first user in the system
    const userCount = await User.countDocuments();
    const isFirstUserInSystem = userCount === 0 || isFirstUser === 'true';

    let profilePicture = 'default-avatar.jpg';
    if (req.file) profilePicture = req.file.path;

    const user = await User.create({
      firstName, lastName, email, password, dateOfBirth, gender, phoneNumber,
      role: isFirstUserInSystem ? 'super-admin' : 'admin', // First user becomes super-admin
      profilePicture
    });

    if (user) {
      res.status(201).json({
        _id: user._id, firstName, lastName, email,
        role: user.role, profilePicture: user.profilePicture, phoneNumber,
        token: user.getSignedJwtToken(),
        message: isFirstUserInSystem ? 'Super Admin created successfully' : 'Admin created successfully'
      });
    } else {
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
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
  deleteUser,
  forgotPassword,
  resendVerificationCode,
  verifyResetCode,
  resetPassword
};