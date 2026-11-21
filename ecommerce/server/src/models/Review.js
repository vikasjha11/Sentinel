import mongoose from 'mongoose';
const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, maxlength: 80 },
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  comment: { type: String, required: true, trim: true, minlength: 3, maxlength: 600 },
}, { timestamps: true });
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
export default mongoose.model('Review', reviewSchema);
