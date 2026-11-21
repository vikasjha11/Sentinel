import { Heart, Search, ShoppingBag, UserRound } from 'lucide-react';
import { useStore } from '../store.jsx';
import { go } from '../lib/route.js';

export default function Header({ route }) {
  const { count, saved, user, search, setSearch } = useStore();
  const submit = e => { e.preventDefault(); go(''); document.getElementById('shelf')?.scrollIntoView({ behavior: 'smooth' }); };
  return (
    <header className="site-header">
      <div className="strip">Free delivery above ₹999 · Pay cash on delivery · Code <b>WELCOME10</b> takes 10% off</div>
      <div className="bar">
        <a className="wordmark" href="#/" aria-label="Tilda Goods, home"><span className="stamp">t</span>tilda goods</a>
        <form className="search" role="search" onSubmit={submit}>
          <Search size={17} aria-hidden="true" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notebooks, lamps, mugs" aria-label="Search the shop" />
        </form>
        <nav className="actions" aria-label="Account and bag">
          <a href="#/saved" className={route.name === 'saved' ? 'active' : ''} aria-label={`Saved items, ${saved.length}`}><Heart size={19} />{saved.length > 0 && <span className="pip">{saved.length}</span>}</a>
          <a href="#/account" className={['account', 'orders', 'admin'].includes(route.name) ? 'active' : ''} aria-label={user ? `Account, ${user.name}` : 'Sign in'}><UserRound size={19} /><span className="label">{user ? user.name.split(' ')[0] : 'Sign in'}</span></a>
          <a href="#/bag" className={`bag ${route.name === 'bag' ? 'active' : ''}`} aria-label={`Bag, ${count} items`}><ShoppingBag size={19} /><span className="label">Bag</span>{count > 0 && <span className="pip">{count}</span>}</a>
        </nav>
      </div>
    </header>
  );
}
