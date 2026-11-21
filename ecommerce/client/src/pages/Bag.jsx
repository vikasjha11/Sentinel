import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2, Tag } from 'lucide-react';
import { api, imageUrl, money } from '../api.js';
import { useStore } from '../store.jsx';
import { Photo } from '../components/ui.jsx';

export const FREE_FROM = 999; export const SHIP = 79;
export const useCoupon = () => {
  const [coupon, setCoupon] = useState(() => { try { return JSON.parse(sessionStorage.getItem('tilda_coupon')) || null; } catch { return null; } });
  useEffect(() => { sessionStorage.setItem('tilda_coupon', JSON.stringify(coupon)); }, [coupon]);
  return [coupon, setCoupon];
};

export function Summary({ coupon, children }) {
  const { subtotal } = useStore();
  const discount = coupon?.valid ? coupon.discount : 0; const shipping = subtotal === 0 || subtotal >= FREE_FROM ? 0 : SHIP;
  return (
    <aside className="summary" aria-label="Order summary">
      <h2>Summary</h2>
      <dl>
        <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
        {discount > 0 && <div className="good"><dt>Code {coupon.code}</dt><dd>−{money(discount)}</dd></div>}
        <div><dt>Delivery</dt><dd>{shipping === 0 ? 'Free' : money(shipping)}</dd></div>
        <div className="total"><dt>Total</dt><dd>{money(subtotal - discount + shipping)}</dd></div>
      </dl>
      <p className="pay">Pay cash on delivery.</p>
      {children}
    </aside>
  );
}

export default function Bag() {
  const { bag, setQty, subtotal, refreshBag, user, notify } = useStore();
  const [coupon, setCoupon] = useCoupon(); const [code, setCode] = useState(coupon?.code || ''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (bag.length) refreshBag(); }, []);
  // A coupon's discount depends on the subtotal, so re-check it whenever the bag changes.
  useEffect(() => { if (coupon?.code) apply(coupon.code, true); }, [subtotal]);
  async function apply(c = code, quiet = false) {
    if (!c.trim()) return; setBusy(true);
    try { const r = await api('/orders/coupon', { method: 'POST', body: JSON.stringify({ code: c, subtotal }) }); setCoupon(r.valid ? r : null); if (!quiet) notify(r.valid ? `${r.code} applied: ${r.message}.` : r.message, r.valid ? 'info' : 'warn'); }
    catch (e) { if (!quiet) notify(e.message.includes('sign in') ? 'Sign in to use a code.' : e.message, 'warn'); } finally { setBusy(false); }
  }
  if (!bag.length) return <div className="page narrow empty-page"><h1>Your bag is empty</h1><p>Nothing here yet. The shelf has a few things worth a look.</p><a className="btn primary" href="#/">Back to the shelf</a></div>;
  const away = Math.max(FREE_FROM - subtotal, 0);
  return (
    <div className="page">
      <h1 className="page-title">Your bag</h1>
      <div className="split">
        <div>
          <div className="ship-meter"><p>{away > 0 ? <>Add <b>{money(away)}</b> more for free delivery.</> : <>Free delivery unlocked.</>}</p><div className="bar"><i style={{ width: `${Math.min(subtotal / FREE_FROM, 1) * 100}%` }} /></div></div>
          <ul className="lines">
            {bag.map(({ product: p, qty }) => (
              <li key={p._id}>
                <Photo src={imageUrl(p.image)} alt={p.name} className="thumb" />
                <div className="line-main"><a href={`#/product/${p._id}`}>{p.name}</a><span className="cat">{p.category}</span>{p.stock < 1 && <small className="low">Sold out. Remove it to continue.</small>}</div>
                <div className="stepper" role="group" aria-label={`Quantity of ${p.name}`}><button onClick={() => setQty(p._id, qty - 1)} aria-label="One fewer"><Minus size={14} /></button><output>{qty}</output><button onClick={() => setQty(p._id, qty + 1)} disabled={qty >= Math.min(p.stock, 20)} aria-label="One more"><Plus size={14} /></button></div>
                <b className="line-total">{money(p.price * qty)}</b>
                <button className="icon-btn" onClick={() => setQty(p._id, 0)} aria-label={`Remove ${p.name}`}><Trash2 size={17} /></button>
              </li>
            ))}
          </ul>
        </div>
        <Summary coupon={coupon}>
          <form className="coupon" onSubmit={e => { e.preventDefault(); apply(); }}>
            <label htmlFor="code"><Tag size={14} /> Have a code?</label>
            <div><input id="code" value={code} onChange={e => setCode(e.target.value)} placeholder="WELCOME10" autoCapitalize="characters" /><button className="btn" disabled={busy || !code.trim()}>Apply</button></div>
            {!user && <small>You’ll need to sign in to check out.</small>}
          </form>
          <a className={`btn primary block ${bag.some(i => i.product.stock < 1) ? 'disabled' : ''}`} href={user ? '#/checkout' : '#/account'}>{user ? 'Continue to checkout' : 'Sign in to check out'}</a>
        </Summary>
      </div>
    </div>
  );
}
