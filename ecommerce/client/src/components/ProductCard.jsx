import { Heart } from 'lucide-react';
import { useStore } from '../store.jsx';
import { discountPct, imageUrl, money } from '../api.js';
import { Photo, Stars } from './ui.jsx';

export default function ProductCard({ product: p }) {
  const { addToBag, toggleSaved, isSaved } = useStore();
  const off = discountPct(p); const soldOut = p.stock < 1; const saved = isSaved(p._id);
  return (
    <article className="cell product">
      <a href={`#/product/${p._id}`} className="product-link" aria-label={p.name}>
        <Photo src={imageUrl(p.image)} alt={p.name} />
        {soldOut && <span className="tag soldout">Sold out</span>}
        {!soldOut && off > 0 && <span className="tag sale">{off}% off</span>}
      </a>
      <button className={`save ${saved ? 'on' : ''}`} onClick={() => toggleSaved(p)} aria-pressed={saved} aria-label={saved ? `Remove ${p.name} from saved` : `Save ${p.name}`}><Heart size={17} /></button>
      <div className="meta">
        <span className="cat">{p.category}</span>
        <h3><a href={`#/product/${p._id}`}>{p.name}</a></h3>
        {p.ratingCount > 0 && <Stars value={p.ratingAvg} count={p.ratingCount} size={13} />}
        <div className="price-row"><b>{money(p.price)}</b>{off > 0 && <s>{money(p.compareAtPrice)}</s>}</div>
        {!soldOut && p.stock <= 5 && <small className="low">Only {p.stock} left</small>}
      </div>
      <button className="add" disabled={soldOut} onClick={() => addToBag(p)}>{soldOut ? 'Sold out' : 'Add to bag'}</button>
    </article>
  );
}
