import React from 'react';
import { Activity, FolderKanban, ShieldCheck } from 'lucide-react';

const STATUS_MAP = {
  healthy: ['healthy', 'Healthy'],
  degraded: ['degraded', 'Degraded'],
  unhealthy: ['unhealthy', 'Unhealthy'],
  awaiting_agent: ['pending', 'Agent needed'],
  pending: ['pending', 'Pending'],
  planned: ['pending', 'Planned'],
  open: ['unhealthy', 'Open'],
  resolved: ['healthy', 'Resolved'],
};

export function Status({ status }) {
  const [kind, label] = STATUS_MAP[status] || ['pending', status || 'Not connected'];
  return <span className={`status status-${kind}`}><span className="status-dot" />{label}</span>;
}

export function Brand({ href = '#/' }) {
  return (
    <a className="brand" href={href} aria-label="Sentinel home">
      <span className="brand-mark"><Activity size={16} /></span>
      <span>Sentinel</span>
    </a>
  );
}

export function Metric({ label, value, note }) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span>{label}</span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
    </div>
  );
}

export function PageHeading({ title, description, children }) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = FolderKanban, title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={22} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export const AllClear = ({ title, text }) => <EmptyState icon={ShieldCheck} title={title} text={text} />;
