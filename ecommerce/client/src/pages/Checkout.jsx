import { useState } from 'react';
import { api, imageUrl, money } from '../api.js';
import { useStore } from '../store.jsx';
import { go } from '../lib/route.js';
import { Field, Notice } from '../components/ui.jsx';
import { Summary, useCoupon } from './Bag.jsx';

const blank = { name: '', phone: '', address: '', city: '', state: '', pincode: '' };
const rules = {
  name: v => (v.trim().length < 2 ? 'Enter the recipient’s name.' : ''),
  phone: v => (/^[0-9+() -]{8,18}$/.test(v.trim()) ? '' : 'Enter a phone number we can reach.'),
  address: v => (v.trim().length < 6 ? 'Add the house number and street.' : ''),
  city: v => (v.trim() ? '' : 'Enter your city.'),
  state: v => (v.trim() ? '' : 'Enter your state.'),
  pincode: v => (/^[0-9]{5,10}$/.test(v.trim()) ? '' : 'Pincode should be 5 to 10 digits.'),
};

export default function Checkout() {
  const { bag, user, clearBag, notify, setLastOrder, ordersDown } = useStore();
  const [coupon, setCoupon] = useCoupon();
  const [form, setForm] = useState(blank); const [touched, setTouched] = useState({}); const [busy, setBusy] = useState(false);
  if (!user) return <div className="page narrow empty-page"><h1>Sign in to check out</h1><a className="btn primary" href="#/account">Sign in</a></div>;
  if (!bag.length) return <div className="page narrow empty-page"><h1>Your bag is empty</h1><a className="btn primary" href="#/">Back to the shelf</a></div>;
  const errors = Object.fromEntries(Object.entries(rules).map(([k, fn]) => [k, fn(form[k])]));
  const bind = k => ({ value: form[k], onChange: e => setForm(f => ({ ...f, [k]: e.target.value })), onBlur: () => setTouched(t => ({ ...t, [k]: true })), 'aria-invalid': touched[k] && !!errors[k] });
  const err = k => (touched[k] ? errors[k] : '');

  const submit = async e => {
    e.preventDefault();
    if (Object.values(errors).some(Boolean)) { setTouched(Object.fromEntries(Object.keys(rules).map(k => [k, true]))); return notify('Check the highlighted fields.', 'warn'); }
    setBusy(true);
    try {
      const { order } = await api('/orders', { method: 'POST', body: JSON.stringify({ items: bag.map(i => ({ productId: i.product._id, quantity: i.qty })), shippingAddress: form, couponCode: coupon?.valid ? coupon.code : '' }) });
      clearBag(); setCoupon(null); setLastOrder(order); go(`done/${order.orderNumber}`);
    } catch (error) { notify(error.message, 'warn'); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <h1 className="page-title">Checkout</h1>
      {ordersDown && <Notice tone="bad" title="Orders are paused">The order service isn’t responding. You can fill this in, but placing the order will fail until it’s back.</Notice>}
      <form className="split" onSubmit={submit} noValidate>
        <fieldset className="address"><legend>Where should it go?</legend>
          <Field label="Full name" error={err('name')}><input autoComplete="name" {...bind('name')} /></Field>
          <Field label="Phone" error={err('phone')}><input type="tel" autoComplete="tel" {...bind('phone')} /></Field>
          <Field label="Address" error={err('address')}><input autoComplete="street-address" {...bind('address')} /></Field>
          <div className="two"><Field label="City" error={err('city')}><input autoComplete="address-level2" {...bind('city')} /></Field><Field label="State" error={err('state')}><input autoComplete="address-level1" {...bind('state')} /></Field></div>
          <Field label="Pincode" error={err('pincode')}><input inputMode="numeric" autoComplete="postal-code" {...bind('pincode')} /></Field>
        </fieldset>
        <Summary coupon={coupon}>
          <ul className="mini-lines">{bag.map(({ product: p, qty }) => <li key={p._id}><img src={imageUrl(p.image)} alt="" /><span>{p.name} <em>× {qty}</em></span><b>{money(p.price * qty)}</b></li>)}</ul>
          <button className="btn primary block" disabled={busy}>{busy ? 'Placing order…' : 'Place order, pay on delivery'}</button>
        </Summary>
      </form>
    </div>
  );
}

export function Done() {
  const { lastOrder: o } = useStore();
  if (!o) return <div className="page narrow empty-page"><h1>Thanks for your order</h1><a className="btn primary" href="#/orders">See your orders</a></div>;
  return (
    <div className="page narrow done">
      <p className="stamp-note">Order placed</p>
      <h1>Thank you, it’s on its way to being packed.</h1>
      <p>Your order number is <b>{o.orderNumber}</b>. Keep {money(o.total)} ready in cash for delivery.</p>
      <ul className="mini-lines boxed">{o.items.map(i => <li key={i.name}><img src={imageUrl(i.image)} alt="" /><span>{i.name} <em>× {i.quantity}</em></span><b>{money(i.price * i.quantity)}</b></li>)}</ul>
      <dl className="totals">
        <div><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>
        {o.discount > 0 && <div><dt>Code {o.couponCode}</dt><dd>−{money(o.discount)}</dd></div>}
        <div><dt>Delivery</dt><dd>{o.shipping ? money(o.shipping) : 'Free'}</dd></div>
        <div className="total"><dt>Total</dt><dd>{money(o.total)}</dd></div>
      </dl>
      <p className="muted">Delivering to {o.shippingAddress.name}, {o.shippingAddress.address}, {o.shippingAddress.city}.</p>
      <div className="row"><a className="btn primary" href="#/orders">Track your orders</a><a className="btn" href="#/">Keep shopping</a></div>
    </div>
  );
}
