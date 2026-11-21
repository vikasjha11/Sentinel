import { useCallback, useEffect, useState } from 'react';
import { api, imageUrl, money } from '../api.js';
import { useStore } from '../store.jsx';
import { Field, Notice } from '../components/ui.jsx';

const STATUSES = ['Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
const blank = { name: '', category: 'Stationery', description: '', price: '', compareAtPrice: '', stock: '', image: '/images/notebook.jpg' };

export default function Admin() {
  const { user, notify } = useStore();
  const [tab, setTab] = useState('products');
  const [stats, setStats] = useState(null); const [products, setProducts] = useState([]); const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(blank); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [s, p, o] = await Promise.all([api('/orders/admin/stats'), api('/products/admin/all'), api('/orders/admin/all')]);
      setStats(s); setProducts(p.products); setOrders(o.orders); setError('');
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { if (user?.role === 'admin') load(); }, [user, load]);
  if (user?.role !== 'admin') return <div className="page narrow empty-page"><h1>Admin only</h1><p>This area is for store admins.</p></div>;

  const run = async (fn, ok) => { try { await fn(); if (ok) notify(ok); await load(); } catch (e) { notify(e.message, 'warn'); } };
  const create = async e => { e.preventDefault(); setBusy(true); await run(async () => { await api('/products', { method: 'POST', body: JSON.stringify({ ...form, price: Number(form.price), compareAtPrice: Number(form.compareAtPrice || 0), stock: Number(form.stock) }) }); setForm(blank); }, 'Product added.'); setBusy(false); };
  const upload = async e => {
    const file = e.target.files?.[0]; if (!file) return;
    const body = new FormData(); body.append('image', file);
    try { const { image } = await api('/uploads', { method: 'POST', body }); setForm(f => ({ ...f, image })); notify('Photo uploaded.'); } catch (err) { notify(err.message, 'warn'); }
  };
  const bind = k => ({ value: form[k], onChange: e => setForm(f => ({ ...f, [k]: e.target.value })) });
  const lowStock = products.filter(p => p.active && p.stock <= 5);

  return (
    <div className="page admin">
      <h1 className="page-title">Admin desk</h1>
      {error && <Notice tone="bad" title="Some data didn’t load" action={<button className="btn" onClick={load}>Retry</button>}>{error}</Notice>}
      {stats && <dl className="stat-row"><div><dt>Revenue</dt><dd>{money(stats.orderValue)}</dd></div><div><dt>Orders</dt><dd>{stats.orders}</dd></div><div><dt>Active products</dt><dd>{stats.products}</dd></div><div><dt>Customers</dt><dd>{stats.customers}</dd></div><div className={lowStock.length ? 'warn' : ''}><dt>Low stock</dt><dd>{lowStock.length}</dd></div></dl>}
      <div className="tabs" role="tablist">{['products', 'orders'].map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'products' ? 'Products & stock' : 'Orders'}</button>)}</div>

      {tab === 'products' && (
        <div className="admin-split">
          <div className="table-wrap"><table>
            <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th></th></tr></thead>
            <tbody>{products.map(p => (
              <tr key={p._id} className={p.active ? '' : 'archived'}>
                <td><div className="prod-cell"><img src={imageUrl(p.image)} alt="" /><div><b>{p.name}</b><span>{p.category}{!p.active && ' · archived'}</span></div></div></td>
                <td>{money(p.price)}</td>
                <td><input className="stock-input" type="number" min="0" defaultValue={p.stock} aria-label={`Stock for ${p.name}`} onBlur={e => Number(e.target.value) !== p.stock && run(() => api(`/products/${p._id}`, { method: 'PATCH', body: JSON.stringify({ stock: Number(e.target.value) }) }), 'Stock updated.')} /></td>
                <td>{p.active ? <button className="link danger" onClick={() => window.confirm(`Archive ${p.name}? It will disappear from the shop.`) && run(() => api(`/products/${p._id}`, { method: 'DELETE' }), 'Product archived.')}>Archive</button> : <button className="link" onClick={() => run(() => api(`/products/${p._id}`, { method: 'PATCH', body: JSON.stringify({ active: true }) }), 'Product restored.')}>Restore</button>}</td>
              </tr>))}</tbody>
          </table></div>
          <form className="panel" onSubmit={create}>
            <h2>Add a product</h2>
            <Field label="Name"><input required maxLength="120" {...bind('name')} /></Field>
            <Field label="Category"><input required maxLength="60" list="cats" {...bind('category')} /><datalist id="cats">{[...new Set(products.map(p => p.category))].map(c => <option key={c} value={c} />)}</datalist></Field>
            <Field label="Description"><textarea required rows="3" maxLength="2000" {...bind('description')} /></Field>
            <div className="two"><Field label="Price, ₹"><input type="number" min="1" required {...bind('price')} /></Field><Field label="Was, ₹" hint="Optional"><input type="number" min="0" {...bind('compareAtPrice')} /></Field></div>
            <Field label="Stock"><input type="number" min="0" required {...bind('stock')} /></Field>
            <Field label="Photo" hint="JPG, PNG or WebP"><input type="file" accept="image/*" onChange={upload} /></Field>
            <img className="preview" src={imageUrl(form.image)} alt="Product preview" />
            <button className="btn primary block" disabled={busy}>{busy ? 'Adding…' : 'Add product'}</button>
          </form>
        </div>
      )}
      {tab === 'orders' && (
        <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>{orders.length === 0 ? <tr><td colSpan="4" className="muted">No orders yet.</td></tr> : orders.map(o => (
            <tr key={o._id}>
              <td><b>{o.orderNumber}</b><span className="sub">{new Date(o.createdAt).toLocaleString('en-IN')}</span></td>
              <td>{o.user?.name || '—'}<span className="sub">{o.shippingAddress?.city}</span></td>
              <td>{money(o.total)}{o.couponCode && <span className="sub">{o.couponCode}</span>}</td>
              <td><select value={o.status} disabled={['Delivered', 'Cancelled'].includes(o.status)} onChange={e => run(() => api(`/orders/admin/${o._id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }), 'Order updated.')} aria-label={`Status of ${o.orderNumber}`}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}
