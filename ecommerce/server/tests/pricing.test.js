import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCoupon, orderTotals, shippingFee } from '../src/utils/pricing.js';

test('shipping is free from ₹999 and for an empty cart', () => {
  assert.equal(shippingFee(0), 0);
  assert.equal(shippingFee(998), 79);
  assert.equal(shippingFee(999), 0);
});
test('WELCOME10 takes 10% and is capped at ₹300', () => {
  assert.equal(applyCoupon('welcome10', 1000).discount, 100);
  assert.equal(applyCoupon('WELCOME10', 9000).discount, 300);
});
test('DESK200 needs a ₹1,500 basket', () => {
  const low = applyCoupon('DESK200', 1200);
  assert.equal(low.valid, false); assert.match(low.message, /₹300 more/);
  assert.equal(applyCoupon('DESK200', 1500).discount, 200);
});
test('unknown and empty codes give no discount', () => {
  assert.equal(applyCoupon('NOPE', 2000).valid, false);
  assert.equal(applyCoupon('', 2000).message, '');
});
test('totals apply the discount before shipping', () => {
  assert.deepEqual(orderTotals(1000, 'WELCOME10'), { subtotal: 1000, discount: 100, couponCode: 'WELCOME10', shipping: 0, total: 900 });
  assert.equal(orderTotals(500, 'bad').total, 579);
});
