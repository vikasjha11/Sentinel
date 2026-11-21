import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, snapshot } from './api.js';
import { go } from './lib/route.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
function usePersisted(key, initial) {
  const [value, setValue] = useState(() => read(key, initial));
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}
const MAX_QTY = 20;

export function StoreProvider({ children }) {
  const [user, setUser] = useState(() => read('tilda_user', null));
  const [bag, setBag] = usePersisted('tilda_bag', {});
  const [saved, setSaved] = usePersisted('tilda_saved', []);
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState([]);
  const [health, setHealth] = useState(null);
  const [lastOrder, setLastOrder] = useState(null);

  const notify = useCallback((message, tone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600);
  }, []);

  // Poll the gateway so the shop reflects real microservice outages (this is what Sentinel watches).
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try { const h = await api('/health'); if (live) setHealth(h.services || {}); }
      catch { if (live) setHealth({ gateway: 'unavailable', products: 'unavailable', media: 'unavailable', orders: 'unavailable', auth: 'unavailable' }); }
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  const down = key => ['unavailable', 'unhealthy'].includes(health?.[key]);

  useEffect(() => {
    const onExpired = () => { localStorage.removeItem('tilda_token'); localStorage.removeItem('tilda_user'); setUser(null); notify('Your session expired. Please sign in again.', 'warn'); };
    window.addEventListener('tilda:auth-expired', onExpired);
    return () => window.removeEventListener('tilda:auth-expired', onExpired);
  }, [notify]);

  const signIn = ({ token, user: u }) => { localStorage.setItem('tilda_token', token); localStorage.setItem('tilda_user', JSON.stringify(u)); setUser(u); };
  const signOut = () => { localStorage.removeItem('tilda_token'); localStorage.removeItem('tilda_user'); setUser(null); go(''); notify('Signed out.'); };

  const addToBag = (product, qty = 1) => {
    if (product.stock < 1) return notify('That one is sold out for now.', 'warn');
    setBag(b => {
      const have = b[product._id]?.qty || 0;
      return { ...b, [product._id]: { product: snapshot(product), qty: Math.min(have + qty, product.stock, MAX_QTY) } };
    });
    notify(`${product.name} is in your bag.`);
  };
  const setQty = (id, qty) => setBag(b => {
    if (qty <= 0) { const { [id]: _gone, ...rest } = b; return rest; }
    return { ...b, [id]: { ...b[id], qty: Math.min(qty, b[id].product.stock || MAX_QTY, MAX_QTY) } };
  });
  const clearBag = () => setBag({});

  // Bring bag prices and stock in line with the catalogue; drop anything that was removed.
  const refreshBag = useCallback(async () => {
    const entries = Object.values(bag);
    const fresh = await Promise.all(entries.map(e => api(`/products/${e.product._id}`).then(d => d.product).catch(err => (/not found/i.test(err.message) ? null : undefined))));
    setBag(current => {
      const next = { ...current };
      entries.forEach((e, i) => {
        const p = fresh[i];
        if (p === null) delete next[e.product._id];
        else if (p && next[e.product._id]) next[e.product._id] = { product: snapshot(p), qty: Math.min(next[e.product._id].qty, p.stock || 0) || 1 };
      });
      return next;
    });
  }, [bag, setBag]);

  const toggleSaved = product => {
    const has = saved.some(p => p._id === product._id);
    setSaved(s => (has ? s.filter(p => p._id !== product._id) : [...s, snapshot(product)]));
    notify(has ? 'Removed from saved items.' : 'Saved for later.');
  };
  const isSaved = id => saved.some(p => p._id === id);

  const items = useMemo(() => Object.values(bag), [bag]);
  const count = items.reduce((n, i) => n + i.qty, 0);
  const subtotal = items.reduce((n, i) => n + i.qty * i.product.price, 0);

  const value = { user, signIn, signOut, bag: items, count, subtotal, addToBag, setQty, clearBag, refreshBag, saved, toggleSaved, isSaved, search, setSearch, notify, toasts, health, productsDown: down('products'), mediaDown: down('media'), ordersDown: down('orders'), lastOrder, setLastOrder };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
