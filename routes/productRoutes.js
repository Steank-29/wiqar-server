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
  uploadProductImages,
  getProductPriceBySize,
  updateProductPriceBySize
} = require('../controllers/productController');
const { protect, superAdminOnly, adminOrSuperAdmin } = require('../middleware/auth');
const { checkBlockedApis } = require('../middleware/apiBlocker');
const { uploadProduct } = require('../middleware/uploadProduct'); // ← CHANGED: destructure uploadProduct

const router = express.Router();

// Public routes (no authentication needed)
router.get('/stats/summary', getProductStats);
router.get('/', getProducts);
router.get('/:id', getProductById);
router.get('/:id/price/:size', getProductPriceBySize);

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

// Admin & Super Admin can create products (FIXED)
router.post('/', 
  protect, 
  adminOrSuperAdmin,  // ← Changed from superAdminOnly
  checkBlockedApis('/api/products', 'POST'),
  uploadProduct.array('images', 5), 
  createProduct
);

// Super admin only routes (only super admin can access)
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

router.patch('/:id/price/:size', 
  protect, 
  superAdminOnly, 
  checkBlockedApis('/api/products/:id/price/:size', 'PATCH'),
  updateProductPriceBySize
);

module.exports = router;