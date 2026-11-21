import React, { useState } from 'react';
import { AlertTriangle, Cloud, Globe, Layers, Server, X } from 'lucide-react';
import { request } from './api.js';

function ConnectionFields({ type, setType, url, setUrl }) {
  return (
    <>
      <div className="field-label">Connection method</div>
      <div className="connection-options">
        <button type="button" className={`connection-option ${type === 'url' ? 'selected' : ''}`} onClick={() => setType('url')}>
          <Globe size={18} /><b>Public URL</b><span>Check availability and response time</span>
        </button>
        <button type="button" className={`connection-option ${type === 'agent' ? 'selected' : ''}`} onClick={() => setType('agent')}>
          <Server size={18} /><b>Local or agent</b><span>Register now, connect an agent later</span>
        </button>
      </div>
      {type === 'url' ? (
        <label>Health-check URL
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/health" required />
          <small>Public HTTP or HTTPS endpoints only. Private and local services use the Docker service registry.</small>
        </label>
      ) : (
        <div className="info-box"><Cloud size={16} /> The application is saved as “Agent needed”. Live checks start once an agent is connected.</div>
      )}
    </>
  );
}

// One modal for both creating and editing an application.
export function ProjectModal({ token, project, onClose, onSaved }) {
  const editing = Boolean(project);
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [type, setType] = useState(project?.connectionType === 'agent' ? 'agent' : 'url');
  const [url, setUrl] = useState(project?.targetUrl || 'https://');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const docker = project?.connectionType === 'docker';

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = JSON.stringify({ name, description, connectionType: docker ? 'docker' : type, targetUrl: !docker && type === 'url' ? url : undefined });
      const saved = await request(editing ? `/projects/${project.id}` : '/projects', { method: editing ? 'PUT' : 'POST', body }, token);
      await onSaved(saved);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={editing ? 'Edit application' : 'Add application'}>
        <div className="modal-head">
          <div>
            <h2>{editing ? 'Edit application' : 'Add application'}</h2>
            <p className="muted">{editing ? 'Update the details or the monitored endpoint.' : 'Register an application and choose how Sentinel connects to it.'}</p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <label>Application name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Orders API" required minLength={2} />
        </label>
        <label>Description <span className="optional">Optional</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows="2" placeholder="What does this application do?" />
        </label>
        {docker
          ? <div className="info-box"><Layers size={16} /> This application is monitored over the internal Docker network. Its services come from the server-side registry, so only the name and description can be edited.</div>
          : <ConnectionFields type={type} setType={setType} url={url} setUrl={setUrl} />}
        {error && <div className="error-box" role="alert"><AlertTriangle size={16} />{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add application'}</button>
        </div>
      </form>
    </div>
  );
}
