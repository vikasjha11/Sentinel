import { useEffect, useState } from 'react';
import { api, imageUrl, money } from '../api.js';
import { useStore } from '../store.jsx';
import { Notice } from '../components/ui.jsx';

const STEPS = ['Confirmed', 'Packed', 'Shipped', 'Delivered'];
export default function Orders() {
  const { user, ordersDown } = useStore();
  const [orders, setOrders] = useState(null); const [error, setError] = useState('');
  useEffect(() => { if (user) api('/orders/my').then(d => setOrders(d.orders)).catch(e => setError(e.message)); }, [user, ordersDown]);
  if (!user) return <div className="page narrow empty-page"><h1>Your orders</h1><p>Sign in to see what you’ve ordered.</p><a className="btn primary" href="#/account">Sign in</a></div>;
  return (
    <div className="page narrow">
      <h1 className="page-title">Your orders</h1>
      {error ? <Notice tone="bad" title="Couldn’t load your orders">{error}</Notice> : orders === null ? <p className="muted">Loading…</p> : orders.length === 0 ? <div className="empty-page"><p>No orders yet.</p><a className="btn primary" href="#/">Browse the shelf</a></div> : (
        <ul className="orders">
          {orders.map(o => {
            const at = STEPS.indexOf(o.status);
            return (
              <li key={o._id}>
                <header><div><b>{o.orderNumber}</b><span>{new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div><b>{money(o.total)}</b></header>
                {o.status === 'Cancelled' ? <p className="cancelled">This order was cancelled.</p> : <ol className="steps" aria-label={`Status: ${o.status}`}>{STEPS.map((s, i) => <li key={s} className={i <= at ? 'done' : ''}>{s}</li>)}</ol>}
                <ul className="mini-lines">{o.items.map(i => <li key={i.name}><img src={imageUrl(i.image)} alt="" /><span>{i.name} <em>× {i.quantity}</em></span><b>{money(i.price * i.quantity)}</b></li>)}</ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
