'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type KeyMeta = {
  id: string;
  key_prefix: string;
  name: string;
  environment?: string;
  status: 'ACTIVE' | 'REVOKED';
  created_at: string;
};

type Project = {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  config: Record<string, string | number>;
  keys: KeyMeta[];
};

type Gateway = {
  id: string;
  name: string;
  model: string | null;
  device_id: string | null;
  sim_status: string;
  battery_pct: number | null;
  is_active: boolean;
  is_online: boolean;
  last_seen_at: string | null;
  keys: KeyMeta[];
};

type Dashboard = {
  admin: { display_name: string; phone_number: string };
  projects: Project[];
  gateways: Gateway[];
  queue: { queued: number; claimed: number; sent: number; delivered: number; failed: number };
};

type ViewState = 'loading' | 'setup' | 'login' | 'dashboard';
type Tab = 'projects' | 'gateways' | 'integration';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

function SecretDialog({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="secret-title">
        <div className="dialog-mark">1x</div>
        <h2 id="secret-title">Save this key now</h2>
        <p>This secret is shown once. Store it in your app&apos;s server environment variables.</p>
        <code className="secret-value">{secret}</code>
        <div className="button-row">
          <button className="button primary" onClick={copy}>{copied ? 'Copied' : 'Copy key'}</button>
          <button className="button" onClick={onClose}>I saved it</button>
        </div>
      </section>
    </div>
  );
}

function Setup({ onComplete }: { onComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/v1/admin/setup', {
        method: 'POST',
        body: JSON.stringify({
          setup_token: form.get('setup_token'),
          users: [1, 2].map((slot) => ({
            display_name: form.get(`name_${slot}`),
            phone: form.get(`phone_${slot}`),
            password: form.get(`password_${slot}`),
          })),
        }),
      });
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-panel setup-panel">
        <div className="brand"><span className="brand-mark">R</span><span>Relay OTP</span></div>
        <p className="eyebrow">One-time setup</p>
        <h1>Secure the control plane</h1>
        <p className="auth-copy">Create the only two accounts allowed to manage projects, API keys, and gateway devices.</p>
        <form onSubmit={submit} className="stack">
          <label>Setup token<input name="setup_token" type="password" required autoComplete="off" /></label>
          <div className="setup-grid">
            {[1, 2].map((slot) => (
              <fieldset key={slot}>
                <legend>Administrator {slot}</legend>
                <label>Name<input name={`name_${slot}`} required maxLength={100} /></label>
                <label>Phone number<input name={`phone_${slot}`} type="tel" placeholder="+91 98765 43210" required /></label>
                <label>Password<input name={`password_${slot}`} type="password" minLength={12} required autoComplete="new-password" /></label>
              </fieldset>
            ))}
          </div>
          <p className="hint">Use 12+ characters with uppercase, lowercase, and a number.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button primary wide" disabled={busy}>{busy ? 'Securing console...' : 'Create two accounts'}</button>
        </form>
      </section>
    </main>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/v1/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: form.get('phone'), password: form.get('password') }),
      });
      onLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-panel login-panel">
        <div className="brand"><span className="brand-mark">R</span><span>Relay OTP</span></div>
        <p className="eyebrow">Private console</p>
        <h1>Welcome back</h1>
        <p className="auth-copy">Sign in with one of the two authorized accounts.</p>
        <form onSubmit={submit} className="stack">
          <label>Phone number<input name="phone" type="tel" placeholder="9869789060 or +919869789060" autoComplete="tel" required autoFocus /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="button primary wide" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}

function ProjectsView({ data, refresh, reveal }: { data: Dashboard; refresh: () => Promise<void>; reveal: (key: string) => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/v1/admin/projects', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      setShowCreate(false);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create project'); }
  }
  async function createKey(projectId: string) {
    const result = await api<{ key: { rawKey: string } }>(`/api/v1/admin/projects/${projectId}/keys`, {
      method: 'POST', body: JSON.stringify({ name: `Key ${new Date().toLocaleDateString()}`, environment: 'live' }),
    });
    reveal(result.key.rawKey);
    await refresh();
  }
  async function revokeKey(keyId: string) {
    if (!window.confirm('Revoke this key? Applications using it will stop working immediately.')) return;
    await api(`/api/v1/admin/project-keys/${keyId}`, { method: 'DELETE' });
    await refresh();
  }
  async function toggleProject(project: Project) {
    await api(`/api/v1/admin/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !project.enabled }) });
    await refresh();
  }
  return (
    <section className="content-section">
      <div className="section-heading">
        <div><p className="eyebrow">Client access</p><h2>Projects</h2><p>Give every app or website its own isolated credentials.</p></div>
        <button className="button primary" onClick={() => setShowCreate(!showCreate)}>+ New project</button>
      </div>
      {showCreate && (
        <form className="create-form" onSubmit={createProject}>
          <label>Project name<input name="name" required placeholder="Storefront" /></label>
          <label>Slug<input name="slug" required placeholder="storefront" pattern="[a-z0-9][a-z0-9-]{1,48}[a-z0-9]" /></label>
          <label className="span-2">SMS template<input name="sms_template" defaultValue="Your verification code is {{otp}}. It expires in {{expiry_minutes}} minutes." required /></label>
          <label>Cooldown (seconds)<input name="cooldown_seconds" type="number" defaultValue="30" min="10" max="3600" /></label>
          <label>Hourly limit / phone<input name="hourly_limit" type="number" defaultValue="5" min="1" max="100" /></label>
          {error && <p className="error span-2">{error}</p>}
          <div className="button-row span-2"><button className="button primary">Create project</button><button type="button" className="button" onClick={() => setShowCreate(false)}>Cancel</button></div>
        </form>
      )}
      <div className="item-list">
        {data.projects.length === 0 && <div className="empty">No projects yet. Create one for your first app or website.</div>}
        {data.projects.map((project) => (
          <article className="item-card" key={project.id}>
            <header><div><h3>{project.name}</h3><code>{project.slug}</code></div><button className={`status-toggle ${project.enabled ? 'on' : ''}`} onClick={() => toggleProject(project)}>{project.enabled ? 'Enabled' : 'Disabled'}</button></header>
            <div className="config-line"><span>Cooldown {project.config.cooldown_seconds ?? 30}s</span><span>{project.config.hourly_limit ?? 5}/hour</span><span>{project.config.expiry_seconds ?? 300}s expiry</span></div>
            <div className="table-wrap"><table><thead><tr><th>Key</th><th>Environment</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
              {project.keys.map((key) => <tr key={key.id}><td><strong>{key.name}</strong><br/><code>{key.key_prefix}...</code></td><td>{key.environment}</td><td><span className={`badge ${key.status.toLowerCase()}`}>{key.status}</span></td><td>{new Date(key.created_at).toLocaleDateString()}</td><td>{key.status === 'ACTIVE' && <button className="text-button danger" onClick={() => revokeKey(key.id)}>Revoke</button>}</td></tr>)}
              {project.keys.length === 0 && <tr><td colSpan={5} className="muted">No keys issued</td></tr>}
            </tbody></table></div>
            <button className="button small" onClick={() => createKey(project.id)}>+ Generate API key</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function GatewaysView({ data, refresh, reveal }: { data: Dashboard; refresh: () => Promise<void>; reveal: (key: string) => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  async function createGateway(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    try {
      await api('/api/v1/admin/gateways', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      setShowCreate(false); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not register gateway'); }
  }
  async function createKey(gatewayId: string) {
    const result = await api<{ key: { rawKey: string } }>(`/api/v1/admin/gateways/${gatewayId}/keys`, { method: 'POST', body: JSON.stringify({ name: 'Android device key' }) });
    reveal(result.key.rawKey); await refresh();
  }
  async function revokeKey(keyId: string) {
    if (!window.confirm('Revoke this gateway key? The Android sender will disconnect immediately.')) return;
    await api(`/api/v1/admin/gateway-keys/${keyId}`, { method: 'DELETE' }); await refresh();
  }
  async function toggleGateway(gateway: Gateway) {
    await api(`/api/v1/admin/gateways/${gateway.id}`, { method: 'PATCH', body: JSON.stringify({ active: !gateway.is_active }) }); await refresh();
  }
  return (
    <section className="content-section">
      <div className="section-heading"><div><p className="eyebrow">Sender infrastructure</p><h2>Gateways</h2><p>Each Android phone gets its own revocable device key.</p></div><button className="button primary" onClick={() => setShowCreate(!showCreate)}>+ Register gateway</button></div>
      {showCreate && <form className="create-form" onSubmit={createGateway}><label>Name<input name="name" required placeholder="Primary Android" /></label><label>Device ID<input name="device_id" placeholder="Optional unique ID" /></label><label>Model<input name="model" placeholder="Pixel 7a" /></label>{error && <p className="error span-2">{error}</p>}<div className="button-row span-2"><button className="button primary">Register</button><button type="button" className="button" onClick={() => setShowCreate(false)}>Cancel</button></div></form>}
      <div className="item-list">
        {data.gateways.length === 0 && <div className="empty">No gateways registered. Add the Android phone that will send SMS.</div>}
        {data.gateways.map((gateway) => <article className="item-card" key={gateway.id}>
          <header><div><h3>{gateway.name}</h3><p>{gateway.model || 'Android device'} · <span className={gateway.is_online ? 'online-dot' : 'offline-dot'}>{gateway.is_online ? 'Online' : 'Offline'}</span></p></div><button className={`status-toggle ${gateway.is_active ? 'on' : ''}`} onClick={() => toggleGateway(gateway)}>{gateway.is_active ? 'Active' : 'Paused'}</button></header>
          <div className="config-line"><span>SIM {gateway.sim_status || 'UNKNOWN'}</span><span>Battery {gateway.battery_pct == null ? '—' : `${gateway.battery_pct}%`}</span><span>Last seen {gateway.last_seen_at ? new Date(gateway.last_seen_at).toLocaleString() : 'never'}</span></div>
          <div className="table-wrap"><table><thead><tr><th>Device key</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
            {gateway.keys.map((key) => <tr key={key.id}><td><strong>{key.name}</strong><br/><code>{key.key_prefix}...</code></td><td><span className={`badge ${key.status.toLowerCase()}`}>{key.status}</span></td><td>{new Date(key.created_at).toLocaleDateString()}</td><td>{key.status === 'ACTIVE' && <button className="text-button danger" onClick={() => revokeKey(key.id)}>Revoke</button>}</td></tr>)}
            {gateway.keys.length === 0 && <tr><td colSpan={4} className="muted">No device keys issued</td></tr>}
          </tbody></table></div>
          <button className="button small" onClick={() => createKey(gateway.id)}>+ Generate gateway key</button>
        </article>)}
      </div>
    </section>
  );
}

function IntegrationView() {
  const origin = typeof window === 'undefined' ? 'https://your-domain.vercel.app' : window.location.origin;
  return <section className="content-section docs"><div className="section-heading"><div><p className="eyebrow">API reference</p><h2>Connect an application</h2><p>Call Relay OTP from your website&apos;s backend. Keep the project key in server-side environment variables.</p></div></div>
    <div className="endpoint"><span className="method">POST</span><code>{origin}/api/v1/otp/send</code></div>
    <pre>{`curl -X POST ${origin}/api/v1/otp/send \\\n  -H "Content-Type: application/json" \\\n  -H "X-Project-Key: $RELAY_OTP_KEY" \\\n  -d '{"phone":"+919876543210"}'`}</pre>
    <div className="endpoint"><span className="method">POST</span><code>{origin}/api/v1/otp/verify</code></div>
    <pre>{`curl -X POST ${origin}/api/v1/otp/verify \\\n  -H "Content-Type: application/json" \\\n  -H "X-Project-Key: $RELAY_OTP_KEY" \\\n  -d '{"phone":"+919876543210","request_id":"...","otp":"123456"}'`}</pre>
    <aside className="notice"><strong>Gateway keys are infrastructure credentials.</strong><span>Use them only inside the Android gateway app. Never put them in a website, browser bundle, or client app.</span></aside>
  </section>;
}

export default function AdminConsole() {
  const [view, setView] = useState<ViewState>('loading');
  const [tab, setTab] = useState<Tab>('projects');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    try {
      const data = await api<Dashboard>('/api/v1/admin/dashboard');
      setDashboard(data); setView('dashboard'); setError('');
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'Authentication required') setView('login');
      else setError(cause instanceof Error ? cause.message : 'Could not load dashboard');
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        const setup = await api<{ configured: boolean }>('/api/v1/admin/setup');
        if (!setup.configured) { setView('setup'); return; }
        await loadDashboard();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not initialize console'); }
    }
    void initialize();
  }, [loadDashboard]);

  async function logout() {
    await api('/api/v1/admin/auth/logout', { method: 'POST' });
    setDashboard(null); setView('login');
  }

  if (view === 'loading') return <main className="loading-screen"><div className="loader"/><p>{error || 'Loading Relay OTP...'}</p></main>;
  if (view === 'setup') return <Setup onComplete={() => setView('login')} />;
  if (view === 'login') return <Login onLogin={loadDashboard} />;
  if (!dashboard) return <main className="loading-screen"><p>{error || 'Dashboard unavailable'}</p><button className="button" onClick={loadDashboard}>Retry</button></main>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">R</span><span>Relay OTP</span></div>
      <nav aria-label="Admin sections">
        <button className={tab === 'projects' ? 'active' : ''} onClick={() => setTab('projects')}><span>▦</span>Projects</button>
        <button className={tab === 'gateways' ? 'active' : ''} onClick={() => setTab('gateways')}><span>▣</span>Gateways</button>
        <button className={tab === 'integration' ? 'active' : ''} onClick={() => setTab('integration')}><span>&lt;/&gt;</span>Integration</button>
      </nav>
      <div className="user-panel"><div className="avatar">{dashboard.admin.display_name.slice(0, 1).toUpperCase()}</div><div><strong>{dashboard.admin.display_name}</strong><span>{dashboard.admin.phone_number}</span></div><button title="Sign out" aria-label="Sign out" onClick={logout}>↪</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="health-dot"/>Service operational</div><div className="queue-strip"><span><b>{dashboard.queue.queued}</b> queued</span><span><b>{dashboard.queue.claimed}</b> processing</span><span><b>{dashboard.queue.failed}</b> failed</span></div></header>
      {error && <p className="global-error">{error}</p>}
      {tab === 'projects' && <ProjectsView data={dashboard} refresh={loadDashboard} reveal={setSecret} />}
      {tab === 'gateways' && <GatewaysView data={dashboard} refresh={loadDashboard} reveal={setSecret} />}
      {tab === 'integration' && <IntegrationView />}
    </main>
    {secret && <SecretDialog secret={secret} onClose={() => setSecret('')} />}
  </div>;
}
