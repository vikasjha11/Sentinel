import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { LANDING_LINKS, go, parseRoute } from './nav.js';
import { Brand } from './ui.jsx';

function goToSection(id) {
  const scroll = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (parseRoute().area === 'landing') { scroll(); return; }
  go('/');
  setTimeout(scroll, 60);
}

export function PublicHeader({ signedIn }) {
  const [open, setOpen] = useState(false);
  const link = (item) => (item.route
    ? <a key={item.label} href={`#${item.route}`} onClick={() => setOpen(false)}>{item.label}</a>
    : <button key={item.label} onClick={() => { setOpen(false); goToSection(item.section); }}>{item.label}</button>);
  return (
    <header className="public-header">
      <div className="public-bar">
        <Brand />
        <nav className={`public-nav ${open ? 'open' : ''}`} aria-label="Main">
          <a href="#/" onClick={() => setOpen(false)}>Home</a>
          {LANDING_LINKS.map(link)}
          <div className="public-nav-actions">
            {signedIn
              ? <a className="primary-btn" href="#/app/dashboard">Open dashboard</a>
              : <><a className="text-btn" href="#/signin">Sign in</a><a className="primary-btn" href="#/signup">Get started</a></>}
          </div>
        </nav>
        <button className="icon-btn public-toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-bar footer-grid">
        <div>
          <Brand />
          <p className="muted">A reliability platform for monitoring, investigating and recovering microservices.</p>
        </div>
        <div><h4>Platform</h4><a href="#/signup">Get started</a><a href="#/signin">Sign in</a><button onClick={() => goToSection('features')}>Features</button></div>
        <div><h4>Resources</h4><a href="#/docs">Documentation</a><button onClick={() => goToSection('architecture')}>Architecture</button></div>
        <div><h4>Project</h4><span>Sentinel with the Tilda Goods demo stack</span><span>Early access build, version 0.1.0</span></div>
      </div>
      <div className="public-bar footer-bottom">© {new Date().getFullYear()} Sentinel. All rights reserved.</div>
    </footer>
  );
}
