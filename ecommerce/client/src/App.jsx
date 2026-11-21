import { StoreProvider, useStore } from './store.jsx';
import { useRoute } from './lib/route.js';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import { Notice, Toasts } from './components/ui.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Bag from './pages/Bag.jsx';
import Checkout, { Done } from './pages/Checkout.jsx';
import Orders from './pages/Orders.jsx';
import Saved from './pages/Saved.jsx';
import Account from './pages/Account.jsx';
import Admin from './pages/Admin.jsx';

function Page({ route }) {
  switch (route.name) {
    case 'product': return <Product id={route.param} />;
    case 'bag': return <Bag />;
    case 'checkout': return <Checkout />;
    case 'done': return <Done />;
    case 'orders': return <Orders />;
    case 'saved': return <Saved />;
    case 'account': return <Account />;
    case 'admin': return <Admin />;
    default: return <Shop />;
  }
}

function Shell() {
  const route = useRoute(); const { health } = useStore();
  const gatewayDown = health && ['unavailable', 'unhealthy'].includes(health.gateway);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header route={route} />
      {gatewayDown && <div className="page"><Notice tone="bad" title="We can’t reach the shop’s servers">Check your connection or try again in a minute. This page will recover on its own.</Notice></div>}
      <main id="main"><Page route={route} /></main>
      <Footer />
      <Toasts />
    </>
  );
}

export default () => <StoreProvider><Shell /></StoreProvider>;
