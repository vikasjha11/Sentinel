import { useEffect, useState } from 'react';

const read = () => {
  const [name = '', param] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'shop', param };
};
export const go = path => { location.hash = `/${path}`; window.scrollTo({ top: 0 }); };
export function useRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => { setRoute(read()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
