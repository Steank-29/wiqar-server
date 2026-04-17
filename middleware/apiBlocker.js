// This middleware can be applied to any route to check permissions
const checkBlockedApis = (apiPath, method) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        return next();
      }
      
      const apiKey = `${method}:${apiPath}`;
      
      if (user.blockedApis && user.blockedApis.includes(apiKey)) {
        return res.status(403).json({
          message: `Access to ${method} ${apiPath} has been blocked by super admin`,
          blocked: true
        });
      }
      
      next();
    } catch (error) {
      next();
    }
  };
};

module.exports = { checkBlockedApis };