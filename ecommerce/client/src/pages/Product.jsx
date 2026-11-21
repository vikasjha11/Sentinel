import { useEffect, useState } from 'react';
import { Heart, Minus, Plus, Truck, Wallet } from 'lucide-react';
import { api, discountPct, imageUrl, money } from '../api.js';
import { useStore } from '../store.jsx';
import { go } from '../lib/route.js';
import { Notice, Photo, Stars } from '../components/ui.jsx';

function Reviews({ productId, onChanged }) {
  const { user, notify } = useStore();
  const [reviews, setReviews] = useState(null);
  const [form, setForm] = useState({ rating: 5, comment: '' });
  const [busy, setBusy] = useState(false);
  const load = () => api(`/products/${productId}/reviews`).then(d => setReviews(d.reviews)).catch(() => setReviews([]));
  useEffect(() => { load(); }, [productId]);
  const submit = async e => {
    e.preventDefault(); setBusy(true);
    try { await api(`/products/${productId}/reviews`, { method: 'POST', body: JSON.stringify(form) }); setForm({ rating: 5, comment: '' }); notify('Thanks, your review is up.'); await load(); onChanged(); }
    catch (err) { notify(err.message, 'warn'); } finally { setBusy(false); }
  };
  return (
    <section className="reviews" aria-labelledby="rev-h">
      <h2 id="rev-h">Reviews</h2>
      <div className="reviews-grid">
        <div>
          {reviews === null ? <p className="muted">Loading reviews…</p> : reviews.length === 0 ? <p className="muted">No reviews yet. Bought it? Tell the next person how it holds up.</p>
            : <ul className="review-list">{reviews.map(r => <li key={r._id}><div className="who"><b>{r.name}</b><Stars value={r.rating} size={13} /><time>{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div><p>{r.comment}</p></li>)}</ul>}
        </div>
        {user ? (
          <form className="review-form" onSubmit={submit}>
            <h3>Write a review</h3>
            <fieldset className="rate"><legend>Your rating</legend>{[1, 2, 3, 4, 5].map(n => <label key={n}><input type="radio" name="rating" checked={form.rating === n} onChange={() => setForm(f => ({ ...f, rating: n }))} /><span>{n}</span></label>)}</fieldset>
            <label className="field"><span>What did you think?</span><textarea rows="4" maxLength="600" required minLength="3" value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} /></label>
            <button className="btn primary" disabled={busy}>{busy ? 'Posting…' : 'Post review'}</button>
          </form>
        ) : <div className="review-form"><h3>Write a review</h3><p className="muted">Sign in to leave one.</p><a className="btn" href="#/account">Sign in</a></div>}
      </div>
    </section>
  );
}

export default function Product({ id }) {
  const { addToBag, toggleSaved, isSaved, productsDown } = useStore();
  const [p, setP] = useState(null); const [error, setError] = useState(''); const [qty, setQty] = useState(1);
  const load = () => api(`/products/${id}`).then(d => { setP(d.product); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { setP(null); setQty(1); load(); }, [id, productsDown]);

  if (error) return <div className="page narrow"><Notice tone="bad" title="This item isn’t available" action={<button className="btn" onClick={() => go('')}>Back to the shelf</button>}>{error}</Notice></div>;
  if (!p) return <div className="page"><div className="detail skeleton"><div className="photo" /><div><i /><i /><i /></div></div></div>;
  const off = discountPct(p); const max = Math.min(p.stock, 20);
  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="#/">Shelf</a><span>/</span><span>{p.category}</span><span>/</span><span aria-current="page">{p.name}</span></nav>
      <div className="detail">
        <Photo src={imageUrl(p.image)} alt={p.name} className="big" />
        <div className="info">
          <span className="cat">{p.category}</span>
          <h1>{p.name}</h1>
          <Stars value={p.ratingAvg} count={p.ratingCount} />
          <div className="price-row large"><b>{money(p.price)}</b>{off > 0 && <><s>{money(p.compareAtPrice)}</s><span className="tag sale">{off}% off</span></>}</div>
          <p className="desc">{p.description}</p>
          <p className={`stock ${p.stock < 1 ? 'out' : p.stock <= 5 ? 'low' : 'in'}`}>{p.stock < 1 ? 'Sold out for now' : p.stock <= 5 ? `Only ${p.stock} left` : 'In stock, ready to ship'}</p>
          <div className="buy">
            <div className="stepper" role="group" aria-label="Quantity"><button onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One fewer"><Minus size={15} /></button><output>{qty}</output><button onClick={() => setQty(q => Math.min(max, q + 1))} disabled={qty >= max} aria-label="One more"><Plus size={15} /></button></div>
            <button className="btn primary grow" disabled={p.stock < 1} onClick={() => addToBag(p, qty)}>Add to bag</button>
            <button className={`btn icon ${isSaved(p._id) ? 'on' : ''}`} onClick={() => toggleSaved(p)} aria-pressed={isSaved(p._id)} aria-label="Save for later"><Heart size={18} /></button>
          </div>
          <ul className="assure"><li><Truck size={17} /> Free delivery above ₹999, otherwise ₹79.</li><li><Wallet size={17} /> Pay cash when it arrives.</li></ul>
        </div>
      </div>
      <Reviews productId={p._id} onChanged={load} />
    </div>
  );
}
