export const FREE_SHIPPING_FROM = 999;
export const SHIPPING_FEE = 79;

// Coupons live on the server so the price a customer sees is the price they pay.
const COUPONS = {
  WELCOME10: { label: '10% off your order', percent: 10, cap: 300, minSubtotal: 0 },
  DESK200: { label: '₹200 off orders above ₹1,500', flat: 200, minSubtotal: 1500 },
};

export const shippingFee = subtotal => (subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE);

export function applyCoupon(rawCode, subtotal) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { valid: false, code: '', discount: 0, message: '' };
  const coupon = COUPONS[code];
  if (!coupon) return { valid: false, code, discount: 0, message: 'That code is not valid.' };
  if (subtotal < coupon.minSubtotal) return { valid: false, code, discount: 0, message: `Add ₹${coupon.minSubtotal - subtotal} more to use ${code}.` };
  const raw = coupon.percent ? Math.round((subtotal * coupon.percent) / 100) : coupon.flat;
  const discount = Math.min(raw, coupon.cap ?? raw, subtotal);
  return { valid: true, code, discount, message: coupon.label };
}

export function orderTotals(subtotal, couponCode) {
  const coupon = applyCoupon(couponCode, subtotal);
  const discounted = subtotal - coupon.discount;
  const shipping = shippingFee(subtotal); // free-shipping threshold ignores the coupon
  return { subtotal, discount: coupon.discount, couponCode: coupon.valid ? coupon.code : '', shipping, total: discounted + shipping };
}
