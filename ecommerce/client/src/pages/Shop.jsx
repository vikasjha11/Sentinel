import { useEffect, useRef, useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { api, imageUrl, money } from '../api.js';
import { useStore } from '../store.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { Notice, Pagination, Skeleton } from '../components/ui.jsx';

const SORTS = [['newest', 'Newest first'], ['rating', 'Best rated'], ['price-asc', 'Price, low to high'], ['price-desc', 'Price, high to low']];
const blank = { category: 'All', sort: 'newest', minPrice: '', maxPrice: '', inStock: false, page: 1 };

function Hero() {
  const { mediaDown } = useStore();
  return (
    <section className={`hero ${mediaDown ? 'no-board' : ''}`}>
      <div className="hero-copy">
        <h1>Good things for the desk you actually sit at.</h1>
        <p>Notebooks, lamps, mugs and the small things that make a workspace feel like yours. Cash on delivery, anywhere in India.</p>
        <div className="hero-cta"><a className="btn primary" href="#shelf" onClick={e => { e.preventDefault(); document.getElementById('shelf').scrollIntoView({ behavior: 'smooth' }); }}>Browse the shelf <ArrowRight size={17} /></a><span>First order? Use <b>WELCOME10</b>.</span></div>
      </div>
      {!mediaDown && <div className="hero-board" aria-hidden="true">
        <figure className="a"><img src={imageUrl('desk-lamp')} alt="" /><figcaption>LED desk lamp <b>{money(1199)}</b></figcaption></figure>
        <figure className="b"><img src={imageUrl('notebook')} alt="" /><figcaption>Spiral notebook <b>{money(299)}</b></figcaption></figure>
        <figure className="c"><img src={imageUrl('ceramic-mug')} alt="" /><figcaption>Stoneware mug <b>{money(649)}</b></figcaption></figure>
      </div>}
    </section>
  );
}

export default function Shop() {
  const { search, setSearch, productsDown } = useStore();
  const [f, setF] = useState(blank);
  const [data, setData] = useState({ products: [], total: 0, pages: 1 });
  const [categories, setCategories] = useState([]);
  const [state, setState] = useState({ loading: true, error: '' });
  const [debounced, setDebounced] = useState(search);
  const top = useRef(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setF(x => ({ ...x, page: 1 })); }, [debounced]);
  useEffect(() => { api('/products/categories').then(d => setCategories(d.categories)).catch(() => {}); }, [productsDown]);

  useEffect(() => {
    if (productsDown) { setData({ products: [], total: 0, pages: 1 }); setState({ loading: false, error: '' }); return; }
    const params = new URLSearchParams({ page: f.page, limit: 9, sort: f.sort });
    if (debounced.trim()) params.set('q', debounced.trim());
    if (f.category !== 'All') params.set('category', f.category);
    if (f.minPrice !== '') params.set('minPrice', f.minPrice);
    if (f.maxPrice !== '') params.set('maxPrice', f.maxPrice);
    if (f.inStock) params.set('inStock', 'true');
    let live = true;
    setState(s => ({ ...s, loading: true }));
    api(`/products?${params}`)
      .then(d => { if (live) { setData(d); setState({ loading: false, error: '' }); } })
      .catch(e => { if (live) setState({ loading: false, error: e.message }); });
    return () => { live = false; };
  }, [f, debounced, productsDown]);

  const set = patch => setF(x => ({ ...x, page: 1, ...patch }));
  const filtered = f.category !== 'All' || f.minPrice !== '' || f.maxPrice !== '' || f.inStock || debounced.trim();
  const reset = () => { setF(blank); setSearch(''); };
  const goPage = page => { setF(x => ({ ...x, page })); top.current?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <>
      {!filtered && f.page === 1 && <Hero />}
      <section className="shelf" id="shelf" ref={top}>
        <aside className="filters" aria-label="Filters">
          <h2>Filter</h2>
          <fieldset><legend>Category</legend>
            {['All', ...categories].map(c => <label key={c} className="radio"><input type="radio" name="cat" checked={f.category === c} onChange={() => set({ category: c })} /><span>{c}</span></label>)}
          </fieldset>
          <fieldset><legend>Price, ₹</legend>
            <div className="range"><input type="number" min="0" inputMode="numeric" placeholder="Min" value={f.minPrice} onChange={e => set({ minPrice: e.target.value })} aria-label="Minimum price" /><span>to</span><input type="number" min="0" inputMode="numeric" placeholder="Max" value={f.maxPrice} onChange={e => set({ maxPrice: e.target.value })} aria-label="Maximum price" /></div>
          </fieldset>
          <label className="check"><input type="checkbox" checked={f.inStock} onChange={e => set({ inStock: e.target.checked })} /><span>In stock only</span></label>
          {filtered && <button className="link" onClick={reset}><RotateCcw size={14} /> Clear filters</button>}
        </aside>
        <div className="results">
          <div className="results-bar">
            <h2>{debounced.trim() ? `Results for “${debounced.trim()}”` : f.category === 'All' ? 'The shelf' : f.category}</h2>
            <span className="count">{state.loading ? 'Loading…' : `${data.total} ${data.total === 1 ? 'item' : 'items'}`}</span>
            <label className="sort"><span>Sort</span><select value={f.sort} onChange={e => set({ sort: e.target.value })}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
          {productsDown ? <Notice tone="bad" title="The shelf is closed for a moment">Our product service isn’t responding, so we can’t show items right now. Your bag is safe. This page updates by itself when it’s back.</Notice>
            : state.error ? <Notice tone="bad" title="Couldn’t load products" action={<button className="btn" onClick={() => setF(x => ({ ...x }))}>Try again</button>}>{state.error}</Notice>
            : <div className={`grid ${state.loading ? 'is-loading' : ''}`}>
                {state.loading && !data.products.length ? <Skeleton n={6} /> : data.products.map(p => <ProductCard key={p._id} product={p} />)}
                {!state.loading && !data.products.length && <div className="empty"><b>Nothing matches that.</b><p>Try a wider price range or a different word.</p><button className="btn" onClick={reset}>Clear filters</button></div>}
              </div>}
          <Pagination page={f.page} pages={data.pages} onChange={goPage} />
        </div>
      </section>
    </>
  );
}
