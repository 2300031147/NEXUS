import * as vscode from 'vscode';
import { NexusClient } from '../nexusClient';

// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure View Provider — VRAM/RAM/SSD usage gauges per node
// ─────────────────────────────────────────────────────────────────────────────

export class InfrastructureViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'nexus.infrastructureView';
    private _view?: vscode.WebviewView;
    private _poll?: NodeJS.Timeout;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly client: NexusClient,
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.command === 'refresh') { await this.refresh(); }
        });

        if (this._poll) { clearInterval(this._poll); }
        this._poll = setInterval(() => this.refresh(), 15000);
        webviewView.onDidDispose(() => { if (this._poll) { clearInterval(this._poll); this._poll = undefined; } });

        this.refresh();
    }

    public async refresh() {
        try {
            const topology = await this.client.getTopology();
            this._view?.webview.postMessage({ command: 'topology', data: topology });
        } catch (e: any) {
            this._view?.webview.postMessage({ command: 'offline', message: e.message });
        }
    }

    private getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-editor-foreground); background: var(--vscode-sideBar-background); padding: 8px; }
h3 { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.55; margin: 10px 0 4px; }
.node-section { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 10px; margin-bottom: 8px; }
.node-title { font-weight: 600; font-size: 0.88em; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.local-tag { background: #4ec9b0; color: #000; border-radius: 4px; padding: 1px 6px; font-size: 0.72em; }
.gauge-row { margin-bottom: 6px; }
.gauge-label { display: flex; justify-content: space-between; font-size: 0.78em; margin-bottom: 3px; }
.gauge-label .name { opacity: 0.7; }
.gauge-label .value { font-weight: 600; }
.gauge { height: 10px; background: var(--vscode-editor-background); border-radius: 5px; overflow: hidden; }
.gauge-fill { height: 100%; border-radius: 5px; transition: width 0.4s; }
.fill-vram { background: linear-gradient(90deg, #4ec9b0, #3ab99e); }
.fill-ram  { background: linear-gradient(90deg, #569cd6, #4080b0); }
.fill-ssd  { background: linear-gradient(90deg, #ce9178, #b87050); }
.fill-kv   { background: linear-gradient(90deg, #dcdcaa, #c0a040); }
.kv-section { margin-top: 8px; }
.kv-label { font-size: 0.75em; opacity: 0.6; margin-bottom: 4px; }
.badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 10px; padding: 2px 8px; font-size: 0.72em; }
.badge.unified { background: #4ec9b0; color: #000; }
.offline-msg { padding: 12px; opacity: 0.6; font-size: 0.9em; }
.btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 0.78em; margin-bottom: 8px; }
.btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
</head>
<body>
<button class="btn" onclick="refresh()">⟳ Refresh</button>
<div id="root"><div class="offline-msg">Connecting…</div></div>
<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }

function gauge(name, usedGb, totalGb, fillClass) {
  const pct = totalGb > 0 ? Math.min(100, Math.round(usedGb / totalGb * 100)) : 0;
  const usedStr = usedGb != null ? usedGb.toFixed(1) + ' / ' + totalGb.toFixed(1) + ' GB' : totalGb.toFixed(1) + ' GB total';
  return \`<div class="gauge-row">
    <div class="gauge-label"><span class="name">\${name}</span><span class="value">\${usedStr}</span></div>
    <div class="gauge"><div class="gauge-fill \${fillClass}" style="width:\${pct}%"></div></div>
  </div>\`;
}

function escape(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function renderNode(node, isLocal) {
  let html = \`<div class="node-section">
    <div class="node-title">\${isLocal ? '★ Local Node' : '⬡ '+escape(node.hostname)}\${isLocal ? ' <span class="local-tag">LOCAL</span>' : ''}</div>
    <div style="font-size:0.8em;opacity:0.65;margin-bottom:8px;">\${escape(node.model_name || 'Unknown model')} · \${escape(node.role_description || '')}</div>\`;

  html += gauge('VRAM', node.vram_used_gb ?? null, node.vram_gb || 0, 'fill-vram');
  html += gauge('RAM',  node.ram_used_gb ?? null, node.ram_gb  || 0, 'fill-ram');
  html += gauge('SSD Swap', node.ssd_swap_used_gb ?? null, node.ssd_swap_gb || 0, 'fill-ssd');

  // KV Cache section
  if (node.vram_gb || node.ram_gb || node.ssd_swap_gb) {
    html += \`<div class="kv-section"><div class="kv-label">KV Cache Tiers</div>\`;
    html += gauge('KV · VRAM', node.kv_vram_used_gb ?? null, node.vram_gb * 0.3 || 0, 'fill-kv');
    html += gauge('KV · RAM',  node.kv_ram_used_gb ?? null, node.ram_gb  * 0.4 || 0, 'fill-kv');
    html += gauge('KV · SSD',  node.kv_ssd_used_gb ?? null, node.ssd_swap_gb * 0.6 || 0, 'fill-kv');
    html += '</div>';
  }

  // Tags / badges
  if (node.tags && node.tags.length) {
    html += '<div class="badges">';
    node.tags.forEach(t => { html += '<span class="badge'+( t==='unified_memory'?' unified':'')+'">'+escape(t)+'</span>'; });
    html += '</div>';
  }

  html += \`<div class="badges" style="margin-top:4px;">
    <span class="badge">ctx \${(node.max_context||0).toLocaleString()}</span>
    <span class="badge">\${escape(node.api_host)}:\${node.api_port}</span>
  </div>\`;

  html += '</div>';
  return html;
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  const root = document.getElementById('root');
  if (msg.command === 'offline') {
    root.innerHTML = '<div class="offline-msg">⚡ Offline: ' + escape(String(msg.message || '').slice(0,60)) + '</div>';
    return;
  }
  if (msg.command !== 'topology') return;
  const t = msg.data;
  let html = '';
  html += renderNode(t.local_node, true);
  (t.nodes || []).forEach(n => {
    if (n.node_id !== t.local_node.node_id) html += renderNode(n, false);
  });
  root.innerHTML = html || '<div class="offline-msg">No nodes found.</div>';
});
</script>
</body>
</html>`;
    }
}
