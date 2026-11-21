import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import { asyncHandler } from '../utils/http.js';

export const listReviews = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Product not found.' });
  const reviews = await Review.find({ product: req.params.id }).sort({ createdAt: -1 }).limit(50);
  res.json({ reviews });
});

export const addReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id) || !(await Product.exists({ _id: id, active: true }))) return res.status(404).json({ message: 'Product not found.' });
  const rating = Number(req.body.rating); const comment = String(req.body.comment || '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Choose a rating from 1 to 5.' });
  if (comment.length < 3 || comment.length > 600) return res.status(400).json({ message: 'Write a few words (up to 600 characters).' });
  if (await Review.exists({ product: id, user: req.user._id })) return res.status(409).json({ message: 'You have already reviewed this product.' });
  const review = await Review.create({ product: id, user: req.user._id, name: req.user.name, rating, comment });
  const [agg] = await Review.aggregate([{ $match: { product: review.product } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  await Product.updateOne({ _id: id }, { ratingAvg: Math.round(agg.avg * 10) / 10, ratingCount: agg.count });
  res.status(201).json({ review });
});
