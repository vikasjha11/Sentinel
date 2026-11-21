import { useStore } from '../store.jsx';
import ProductCard from '../components/ProductCard.jsx';

export default function Saved() {
  const { saved } = useStore();
  return (
    <div className="page">
      <h1 className="page-title">Saved for later</h1>
      {saved.length === 0 ? <div className="empty-page"><p>Tap the heart on anything you’d like to come back to.</p><a className="btn primary" href="#/">Browse the shelf</a></div>
        : <div className="grid">{saved.map(p => <ProductCard key={p._id} product={p} />)}</div>}
    </div>
  );
}
