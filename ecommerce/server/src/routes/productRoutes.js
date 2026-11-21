import { Router } from 'express';
import { listCategories, listProducts, getProduct, createProduct, updateProduct, deleteProduct } from '../controllers/productController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import Product from '../models/Product.js';
import { addReview, listReviews } from '../controllers/reviewController.js';
const router = Router(); router.get('/', listProducts); router.get('/admin/all', protect, adminOnly, asyncHandler(async (_req,res)=>res.json({ products: await Product.find().sort({ createdAt: -1 }) }))); router.get('/categories', listCategories); router.get('/:id/reviews', listReviews); router.post('/:id/reviews', protect, addReview); router.get('/:id', getProduct); router.post('/', protect, adminOnly, createProduct); router.patch('/:id', protect, adminOnly, updateProduct); router.delete('/:id', protect, adminOnly, deleteProduct); export default router;
