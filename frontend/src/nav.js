import { Activity, AlertTriangle, Boxes, FolderKanban, HeartPulse, LayoutDashboard, Settings, BarChart3, ShieldCheck } from 'lucide-react';

// Public landing page: section anchors plus links to other public routes.
export const LANDING_LINKS = [
  { label: 'Platform', section: 'platform' },
  { label: 'Features', section: 'features' },
  { label: 'Architecture', section: 'architecture' },
  { label: 'Documentation', route: '/docs' },
];

// Authenticated application: one sidebar, defined once.
export const APP_NAV = [
  { group: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    group: 'Infrastructure',
    items: [
      { key: 'applications', label: 'Applications', icon: FolderKanban },
      { key: 'microservices', label: 'Microservices', icon: Boxes },
      { key: 'health', label: 'Service health', icon: HeartPulse },
    ],
  },
  {
    group: 'Operations',
    items: [
      { key: 'incidents', label: 'Incidents', icon: AlertTriangle },
      { key: 'policy', label: 'Recovery policy', icon: ShieldCheck },
      { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  { group: 'Account', items: [{ key: 'settings', label: 'Settings', icon: Settings }] },
];

export const PAGE_TITLES = {
  dashboard: 'Dashboard',
  applications: 'Applications',
  microservices: 'Microservices',
  health: 'Service health',
  incidents: 'Incidents',
  policy: 'Recovery policy',
  analytics: 'Analytics',
  settings: 'Settings',
};

export const BrandIcon = Activity;

export function parseRoute() {
  const path = window.location.hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'app') return { area: 'app', page: parts[1] || 'dashboard', id: parts[2] || null };
  if (['signin', 'signup', 'docs'].includes(parts[0])) return { area: parts[0] };
  return { area: 'landing' };
}

export function go(path) {
  window.location.hash = path;
}
