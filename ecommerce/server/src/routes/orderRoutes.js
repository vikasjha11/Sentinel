import { Router } from 'express';
import { checkCoupon, createOrder, myOrders, allOrders, updateOrder, stats } from '../controllers/orderController.js';
import { protect, adminOnly } from '../middleware/auth.js';
const router = Router(); router.post('/coupon', checkCoupon); router.use(protect); router.post('/', createOrder); router.get('/my', myOrders); router.get('/admin/all', adminOnly, allOrders); router.patch('/admin/:id', adminOnly, updateOrder); router.get('/admin/stats', adminOnly, stats); export default router;
