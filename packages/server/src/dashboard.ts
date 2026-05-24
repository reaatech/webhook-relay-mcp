import type { Application } from 'express';

function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Webhook Relay MCP - Dashboard</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; min-height: 100vh; }
  .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; }
  .header h1 { font-size: 20px; color: #f0f6fc; }
  .header span { font-size: 12px; color: #8b949e; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 16px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; }
  .card h2 { font-size: 14px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .stat { font-size: 28px; font-weight: 600; color: #58a6ff; }
  .stat-label { font-size: 12px; color: #8b949e; margin-top: 4px; }
  .source-list { list-style: none; }
  .source-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #21262d; font-size: 13px; }
  .source-item:last-child { border-bottom: none; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.green { background: #3fb950; }
  .dot.red { background: #f85149; }
  .dot.gray { background: #484f58; }
  .event-list { list-style: none; max-height: 400px; overflow-y: auto; }
  .event-item { padding: 8px 0; border-bottom: 1px solid #21262d; font-size: 12px; }
  .event-item:last-child { border-bottom: none; }
  .event-type { color: #d2a8ff; font-weight: 600; }
  .event-source { color: #7ee787; }
  .event-time { color: #8b949e; font-size: 11px; }
  .event-data { color: #8b949e; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stats-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .stats-table th { text-align: left; padding: 6px 8px; color: #8b949e; border-bottom: 1px solid #30363d; }
  .stats-table td { padding: 6px 8px; border-bottom: 1px solid #21262d; }
  .loading { color: #8b949e; font-style: italic; }
  .error { color: #f85149; }
  .refresh { color: #8b949e; font-size: 11px; text-align: right; margin-bottom: 8px; }
</style>
</head>
<body>
<div class="header">
  <h1>Webhook Relay MCP</h1>
  <span>Admin Dashboard</span>
</div>
<div class="container">
  <div class="grid" id="statCards">
    <div class="card"><h2>Active Subscriptions</h2><div class="stat" id="activeSubs">-</div><div class="stat-label">currently active</div></div>
    <div class="card"><h2>Total Events</h2><div class="stat" id="totalEvents">-</div><div class="stat-label">events received</div></div>
    <div class="card"><h2>Pending Events</h2><div class="stat" id="pendingEvents">-</div><div class="stat-label">awaiting delivery</div></div>
    <div class="card"><h2>Registered Sources</h2><div class="stat" id="sourceCount">-</div><div class="stat-label">webhook sources</div></div>
  </div>
  <div class="grid">
    <div class="card">
      <h2>Webhook Sources</h2>
      <div class="refresh">Auto-refresh 30s</div>
      <ul class="source-list" id="sourceList"><li class="loading">Loading...</li></ul>
    </div>
    <div class="card">
      <h2>Recent Events</h2>
      <div class="refresh">Last 20 events</div>
      <ul class="event-list" id="eventList"><li class="loading">Loading...</li></ul>
    </div>
  </div>
  <div class="grid">
    <div class="card" style="grid-column: 1 / -1;">
      <h2>Event Counts by Source</h2>
      <table class="stats-table" id="statsTable">
        <thead><tr><th>Source</th><th>Count</th></tr></thead>
        <tbody id="statsBody"><tr><td class="loading">Loading...</td><td></td></tr></tbody>
      </table>
    </div>
  </div>
</div>
<script>
  const API_BASE = window.location.origin;

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }

  async function fetchMetrics() {
    try {
      const text = await (await fetch(API_BASE + '/metrics')).text();
      const lines = text.split('\\n');
      const metrics = {};
      for (const line of lines) {
        const m = line.match(/^(\\w+)\\{?(.*?)\\}?\\s+([\\d.]+)$/);
        if (m) {
          const key = m[2] ? m[1] + '{' + m[2] + '}' : m[1];
          metrics[key] = parseFloat(m[3]);
        }
      }
      return metrics;
    } catch {
      return {};
    }
  }

  async function loadData() {
    try {
      const metrics = await fetchMetrics();
      document.getElementById('activeSubs').textContent = metrics['webhook_subscription_active'] ?? 0;
      document.getElementById('totalEvents').textContent = metrics['webhook_received_total'] ?? 0;
      document.getElementById('pendingEvents').textContent = metrics['webhook_events_pending'] ?? 0;
      const received = metrics['webhook_received_total'] || 0;
      const failed = metrics['webhook_validation_failed_total'] || 0;
      const ingested = metrics['webhook_ingested_total'] || 0;

      loadRecentEvents();
      loadSourceStats(metrics);

    } catch (e) {
      document.getElementById('activeSubs').textContent = '!';
      console.error('Failed to load metrics', e);
    }
  }

  async function loadRecentEvents() {
    const list = document.getElementById('eventList');
    try {
      const res = await fetch(API_BASE + '/webhooks/events?limit=20', {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) {
        list.innerHTML = '<li class="error">Endpoint unavailable (auth required for MCP tools)</li>';
        return;
      }
      const data = await res.json();
      const events = data.events || data || [];
      if (!Array.isArray(events) || events.length === 0) {
        list.innerHTML = '<li class="loading">No events yet</li>';
        return;
      }
      list.innerHTML = events.slice(0, 20).map(e =>
        '<li class="event-item">' +
        '<span class="event-type">' + escapeHtml(e.type || 'unknown') + '</span> ' +
        '<span class="event-source">' + escapeHtml(e.source || '') + '</span><br>' +
        '<span class="event-time">' + escapeHtml(e.receivedAt || e.timestamp || '') + '</span><br>' +
        '<span class="event-data">' + escapeHtml(JSON.stringify(e.data || {}).substring(0, 120)) + '</span>' +
        '</li>'
      ).join('');
    } catch {
      list.innerHTML = '<li class="error">Failed to load events</li>';
    }
  }

  async function loadSourceStats(metrics) {
    const tbody = document.getElementById('statsBody');
    const bySource = {};
    for (const [key, val] of Object.entries(metrics)) {
      const m = key.match(/^webhook_received_total\\{source="(.+?)"\\}$/);
      if (m) bySource[m[1]] = Number(val);
    }
    const entries = Object.entries(bySource).sort((a, b) => (b[1] as number) - (a[1] as number));
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td class="loading">No source breakdown available</td><td></td></tr>';
      return;
    }
    tbody.innerHTML = entries.map(([s, c]) =>
      '<tr><td>' + escapeHtml(s) + '</td><td>' + c + '</td></tr>'
    ).join('');

    const sourceList = document.getElementById('sourceList');
    document.getElementById('sourceCount').textContent = entries.length;
    sourceList.innerHTML = entries.map(([s]) =>
      '<li class="source-item"><span class="dot green"></span>' + escapeHtml(s) + '</li>'
    ).join('');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  loadData();
  setInterval(loadData, 30000);
</script>
</body>
</html>`;
}

export function setupDashboard(app: Application): void {
  app.get('/', (_req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderDashboard());
  });
}
