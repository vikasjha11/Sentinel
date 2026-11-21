import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LogOut, Menu, X } from 'lucide-react';
import { request } from './api.js';
import { APP_NAV, PAGE_TITLES, go, parseRoute } from './nav.js';
import { Brand } from './ui.jsx';
import Landing from './Landing.jsx';
import Docs from './Docs.jsx';
import Auth from './Auth.jsx';
import { ProjectModal } from './Modals.jsx';
import { Applications, Dashboard, Health, Incidents, Settings } from './pages.jsx';
import { Analytics, RecoveryPolicy } from './Operations.jsx';
import { IncidentModal, ProjectOverview, ServiceDetail, ServicesPage } from './Services.jsx';

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const [token, setToken] = useState(() => localStorage.getItem('sentinel-token') || '');
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(token));
  const [data, setData] = useState({ projects: [], incidents: [], overview: {}, services: [] });
  const [theme, setTheme] = useState(() => localStorage.getItem('sentinel-theme') || 'light');
  const [toast, setToast] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [projectModal, setProjectModal] = useState(null); // null | 'new' | project
  const [incidentId, setIncidentId] = useState(null);
  const [serviceView, setServiceView] = useState(null);
  const [checkTick, setCheckTick] = useState(0);

  useEffect(() => {
    const onHash = () => { setRoute(parseRoute()); setNavOpen(false); setServiceView(null); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    localStorage.setItem('sentinel-theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const logout = useCallback(() => {
    localStorage.removeItem('sentinel-token');
    setToken('');
    setUser(null);
    setData({ projects: [], incidents: [], overview: {}, services: [] });
    window.location.hash = '/';
    setRoute(parseRoute());
  }, []);

  useEffect(() => {
    if (!token) { setBooting(false); return; }
    request('/auth/me', {}, token)
      .then((d) => setUser(d.user))
      .catch(() => { localStorage.removeItem('sentinel-token'); setToken(''); })
      .finally(() => setBooting(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [projects, incidents, overview, services] = await Promise.all([
        request('/projects', {}, token),
        request('/incidents', {}, token),
        request('/overview', {}, token),
        request('/services', {}, token).catch(() => null),
      ]);
      setData({ projects, incidents, overview, services: services?.services || [] });
    } catch (error) {
      if (error.message.includes('sign in')) logout(); else setToast(error.message);
    }
  }, [token, logout]);

  useEffect(() => {
    if (!user) return undefined;
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [user, refresh]);

  // Route guards: the app needs a session; auth pages redirect to the app when signed in.
  useEffect(() => {
    if (booting) return;
    if (route.area === 'app' && !user) go('/signin');
    if ((route.area === 'signin' || route.area === 'signup') && user) go('/app/dashboard');
  }, [route, user, booting]);

  useEffect(() => {
    const titles = { landing: 'Sentinel | Reliable microservices, smarter operations', signin: 'Sign in | Sentinel', signup: 'Create account | Sentinel', docs: 'Documentation | Sentinel' };
    document.title = route.area === 'app' ? `${PAGE_TITLES[route.page] || 'Dashboard'} | Sentinel` : titles[route.area];
  }, [route]);

  const notify = setToast;
  const navigate = (page, id) => go(`/app/${page}${id ? `/${id}` : ''}`);
  const onAuth = (nextUser, nextToken) => { setUser(nextUser); setToken(nextToken); go('/app/dashboard'); };

  async function runCheck(project) {
    try {
      await request(`/projects/${project.id}/check`, { method: 'POST', body: '{}' }, token);
      setCheckTick((n) => n + 1);
      await refresh();
      notify(`Health check completed for ${project.name}.`);
    } catch (error) { notify(error.message); }
  }

  async function removeProject(project) {
    if (user?.role !== 'owner') return notify('Workspace owner access is required.');
    if (!window.confirm(`Remove ${project.name} and its monitoring history?`)) return undefined;
    try { await request(`/projects/${project.id}`, { method: 'DELETE' }, token); await refresh(); notify('Application removed.'); } catch (error) { notify(error.message); }
    return undefined;
  }

  async function resolveIncident(incident) {
    if (incident.source === 'docker' && !window.confirm('Resolve manually?\n\nThis skips health verification and is recorded in the audit trail with your name. Use “Approve restart” to resolve through verified recovery.')) return;
    try { await request(`/incidents/${incident.id}/resolve`, { method: 'POST', body: '{}' }, token); await refresh(); notify('Incident marked as resolved.'); } catch (error) { notify(error.message); }
  }

  async function recoverIncident(incident) {
    try {
      await request(`/incidents/${incident.id}/recover`, { method: 'POST', body: '{}' }, token);
      await refresh();
      notify('Restart approved. Sentinel is verifying recovery.');
      setIncidentId(incident.id);
    } catch (error) { notify(error.message); await refresh(); }
  }

  const openApplication = (project) => (project.connectionType === 'docker' ? navigate('applications', project.id) : navigate('health'));

  if (booting) return <div className="loading-screen"><p>Loading…</p></div>;
  if (route.area === 'landing') return <Landing signedIn={Boolean(user)} />;
  if (route.area === 'docs') return <Docs signedIn={Boolean(user)} />;
  if (route.area === 'signin' || route.area === 'signup') return user ? null : <Auth mode={route.area} onAuth={onAuth} />;
  if (!user) return null;

  const openIncidents = data.incidents.filter((i) => i.status === 'open').length;
  const downServices = data.services.filter((s) => s.status === 'DOWN').length;
  const counts = { applications: data.projects.length, microservices: downServices, incidents: openIncidents };
  const { page, id } = route;

  let content;
  if (page === 'applications' && id) {
    content = serviceView
      ? <ServiceDetail id={serviceView.id} initialTab={serviceView.tab} token={token} onBack={() => setServiceView(null)} onOpenIncident={setIncidentId} onToast={notify} />
      : <ProjectOverview projectId={id} token={token} onBack={() => navigate('applications')} onOpenIncident={setIncidentId} onOpenService={(sid, tab) => setServiceView({ id: sid, tab })} onToast={notify} />;
  } else if (page === 'applications') {
    content = <Applications projects={data.projects} canDelete={user.role === 'owner'} onAdd={() => setProjectModal('new')} onEdit={setProjectModal} onOpen={openApplication} onCheck={runCheck} onDelete={removeProject} onRefresh={refresh} />;
  } else if (page === 'microservices') {
    content = <ServicesPage token={token} onToast={notify} onOpenIncident={setIncidentId} onOpenProject={(pid) => navigate('applications', pid)} />;
  } else if (page === 'health') {
    content = <Health projects={data.projects} token={token} onCheck={runCheck} refreshKey={checkTick} />;
  } else if (page === 'incidents') {
    content = <Incidents incidents={data.incidents} onOpen={setIncidentId} onRecover={recoverIncident} onResolve={resolveIncident} onRefresh={refresh} />;
  } else if (page === 'policy') {
    content = <RecoveryPolicy user={user} token={token} onToast={notify} />;
  } else if (page === 'analytics') {
    content = <Analytics token={token} onToast={notify} />;
  } else if (page === 'settings') {
    content = <Settings user={user} theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} token={token} onToast={notify} />;
  } else {
    content = <Dashboard user={user} overview={data.overview} projects={data.projects} incidents={data.incidents} services={data.services} onNavigate={navigate} onAdd={() => setProjectModal('new')} onOpenIncident={setIncidentId} onRecover={recoverIncident} onResolve={resolveIncident} />;
  }

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <Brand href="#/app/dashboard" />
        <button className="icon-btn" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>{navOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </header>
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <Brand href="#/app/dashboard" />
        <nav aria-label="Application">
          {APP_NAV.map((section) => (
            <div className="nav-group" key={section.group}>
              <div className="nav-label">{section.group}</div>
              {section.items.map((item) => (
                <a key={item.key} href={`#/app/${item.key}`} className={`nav-item ${page === item.key ? 'active' : ''}`} aria-current={page === item.key ? 'page' : undefined}>
                  <item.icon size={17} /><span>{item.label}</span>
                  {counts[item.key] > 0 && <small>{counts[item.key]}</small>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-row"><div className="user-avatar">{user.name[0].toUpperCase()}</div><div className="user-details"><b>{user.name}</b><span>{user.email}</span></div></div>
          <button className="nav-item" onClick={logout}><LogOut size={17} /><span>Sign out</span></button>
        </div>
      </aside>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <main className="main-area"><div className="page-content">{content}</div></main>
      {projectModal && <ProjectModal token={token} project={projectModal === 'new' ? null : projectModal} onClose={() => setProjectModal(null)} onSaved={async () => { await refresh(); notify(projectModal === 'new' ? 'Application added.' : 'Application updated.'); }} />}
      {incidentId && <IncidentModal id={incidentId} token={token} onClose={() => setIncidentId(null)} onChanged={refresh} onToast={notify} />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={16} />{toast}<button className="icon-btn" aria-label="Dismiss" onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  );
}
