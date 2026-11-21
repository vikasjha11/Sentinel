import { Star, X, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { useStore } from '../store.jsx';

export function Stars({ value = 0, count, size = 14 }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => <Star key={n} size={size} className={n <= Math.round(value) ? 'on' : ''} />)}
      {count !== undefined && <span className="stars-count">{count ? `(${count})` : 'No reviews yet'}</span>}
    </span>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return <div className="toasts" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast ${t.tone}`}>{t.message}</div>)}</div>;
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter(n => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <nav className="pagination" aria-label="Pages">
      <button disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
      {nums.map((n, i) => <span key={n}>{i > 0 && n - nums[i - 1] > 1 && <em>…</em>}<button className={n === page ? 'current' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => onChange(n)}>{n}</button></span>)}
      <button disabled={page === pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
    </nav>
  );
}

export const Notice = ({ tone = 'info', title, children, action }) => (
  <div className={`notice ${tone}`} role="status"><div><b>{title}</b>{children && <p>{children}</p>}</div>{action}</div>
);

export const Field = ({ label, error, hint, children }) => (
  <label className={`field ${error ? 'has-error' : ''}`}><span>{label}</span>{children}{error ? <small className="err">{error}</small> : hint && <small>{hint}</small>}</label>
);

export function Photo({ src, alt, className = '' }) {
  const { mediaDown } = useStore();
  if (mediaDown) return <div className={`photo photo-off ${className}`}><ImageOff size={22} /><span>Photos are temporarily unavailable</span></div>;
  return <div className={`photo ${className}`}><img src={src} alt={alt} loading="lazy" decoding="async" /></div>;
}

export const Skeleton = ({ n = 6 }) => Array.from({ length: n }, (_, i) => <div className="cell skeleton" key={i}><div className="photo" /><i /><i /></div>);
export const CloseButton = props => <button className="icon-btn" aria-label="Close" {...props}><X size={18} /></button>;
