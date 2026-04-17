const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Protect routes - verify user is authenticated
const protect = async (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  if (!token) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized to access this route' });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `User role ${req.user.role} is not authorized to access this route` 
      });
    }
    next();
  };
};

// New: Check API permissions middleware
const checkApiPermission = (apiPath, method) => {
  return async (req, res, next) => {
    const user = req.user;
    
    if (!user.canAccessApi(apiPath, method)) {
      return res.status(403).json({ 
        message: `You don't have permission to access ${method} ${apiPath}` 
      });
    }
    
    next();
  };
};

// New: Super admin only middleware (alias)
const superAdminOnly = authorize('super-admin');

// New: Admin or super admin middleware
const adminOrSuperAdmin = authorize('super-admin', 'admin');

module.exports = { protect, authorize, checkApiPermission, superAdminOnly, adminOrSuperAdmin };