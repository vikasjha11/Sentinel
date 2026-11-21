const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
export const getToken = () => localStorage.getItem('tilda_token');

export async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const headers = {
    ...(options.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    ...options.headers,
  };
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ message: 'The server returned an unreadable response.' }));
  if (!response.ok) {
    if (response.status === 401 && getToken()) window.dispatchEvent(new Event('tilda:auth-expired'));
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}

export const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n || 0));

// Bundled catalogue photos live in /public/images. Older database rows point at .svg/.png names.
const BUNDLED = new Set(['notebook', 'gel-pens', 'backpack', 'flask', 'desk-lamp', 'headphones', 'desk-mat', 'planter', 'candle', 'ceramic-mug', 'oak-riser', 'linen-cushion']);
export function imageUrl(image) {
  if (!image) return '/images/notebook.jpg';
  if (image.startsWith('/uploads/')) return `${API.replace(/\/api$/, '')}${image}`;
  const base = image.split('?')[0].split('/').pop().replace(/\.[a-z]+$/i, '').toLowerCase();
  return BUNDLED.has(base) ? `/images/${base}.jpg` : image;
}

export const discountPct = p => (p.compareAtPrice > p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0);
export const snapshot = p => ({ _id: p._id, name: p.name, category: p.category, price: p.price, compareAtPrice: p.compareAtPrice, image: p.image, stock: p.stock, ratingAvg: p.ratingAvg, ratingCount: p.ratingCount });
