const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Please add a first name'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Please add a last name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  profilePicture: {
    type: String,
    default: 'default-avatar.jpg'
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Please add date of birth']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: [true, 'Please specify gender']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Please add phone number']
  },
  role: {
    type: String,
    enum: ['super-admin', 'admin'],
    default: 'admin'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // New: Track who created this user
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // New: API permissions - what APIs this user can access
  apiPermissions: {
    type: [String],
    default: [] // Empty array means all APIs allowed (for super admin)
  },
  // New: Blocked APIs (for admin restrictions)
  blockedApis: {
    type: [String],
    default: []
  },
    // Add to your userSchema
    isBlocked: {
    type: Boolean,
    default: false
    },
    blockedAt: {
    type: Date
    },
    blockedUntil: {
    type: Date
    },
    blockReason: {
    type: String,
    default: ''
    },
    blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
    },
  addresses: [{
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    isDefault: Boolean
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function() {
  // Only hash the password if it has been modified (or is new)
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

// Sign JWT and return
userSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role, apiPermissions: this.apiPermissions },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// New: Check if user can access specific API
userSchema.methods.canAccessApi = function(apiPath, method) {
  // Super admin has full access
  if (this.role === 'super-admin') {
    return true;
  }
  
  // If no permissions defined, allow access
  if (this.apiPermissions.length === 0) {
    return true;
  }
  
  // Check if API is blocked for this user
  const apiKey = `${method}:${apiPath}`;
  return !this.blockedApis.includes(apiKey);
};

const User = mongoose.model('User', userSchema);

module.exports = User;