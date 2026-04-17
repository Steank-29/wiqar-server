const express = require('express');
const { 
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage,
  bulkDeleteProducts,
  updateStock,
  getProductStats,
  uploadProductImages
} = require('../controllers/productController');
const { protect, superAdminOnly, adminOrSuperAdmin } = require('../middleware/auth');
const { checkBlockedApis } = require('../middleware/apiBlocker');
const uploadProduct = require('../middleware/uploadProduct');

const router = express.Router();

// Public routes (no authentication needed)
router.get('/stats/summary', getProductStats);
router.get('/', getProducts);
router.get('/:id', getProductById);

// Admin only routes (admin or super admin can access)
router.put('/:id', 
  protect, 
  adminOrSuperAdmin, 
  checkBlockedApis('/api/products/:id', 'PUT'),
  uploadProduct.array('images', 5), 
  updateProduct
);

router.patch('/:id/stock', 
  protect, 
  adminOrSuperAdmin, 
  updateStock
);

// Super admin only routes (only super admin can access)
router.post('/', 
  protect, 
  superAdminOnly, 
  checkBlockedApis('/api/products', 'POST'),
  uploadProduct.array('images', 5), 
  createProduct
);

router.delete('/:id', 
  protect, 
  superAdminOnly, 
  checkBlockedApis('/api/products/:id', 'DELETE'),
  deleteProduct
);

router.delete('/:id/images/:imageIndex', 
  protect, 
  superAdminOnly, 
  deleteProductImage
);

router.delete('/bulk/delete', 
  protect, 
  superAdminOnly, 
  bulkDeleteProducts
);

router.post('/:id/upload-images', 
  protect, 
  superAdminOnly, 
  uploadProduct.array('images', 5), 
  uploadProductImages
);

module.exports = router;