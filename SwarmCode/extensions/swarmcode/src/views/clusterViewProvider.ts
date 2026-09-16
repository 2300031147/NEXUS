import * as vscode from 'vscode';
import { NexusClient } from '../nexusClient';
import { NodeInfo, ClusterTopology } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Cluster View Provider — live cluster topology with per-node status cards
// ─────────────────────────────────────────────────────────────────────────────

export class ClusterViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'nexus.clusterView';
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
            switch (msg.command) {
                case 'refresh': await this.refresh(); break;
                case 'connect': await this.connect(msg.url); break;
            }
        });

        // Auto-refresh every 10 seconds
        this._poll = setInterval(() => this.refresh(), 10000);
        webviewView.onDidDispose(() => { if (this._poll) { clearInterval(this._poll); } });

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

    private async connect(url: string) {
        this.client.setHostUrl(url);
        const config = vscode.workspace.getConfiguration('nexus');
        await config.update('hostUrl', url, vscode.ConfigurationTarget.Workspace);
        await this.refresh();
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
h3 { font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.6; margin-bottom: 8px; }
.node-card {
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;
}
.node-card.local { border-left: 3px solid #4ec9b0; }
.node-card.peer  { border-left: 3px solid var(--vscode-focusBorder); }
.node-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dot.online { background: #4ec9b0; }
.dot.offline { background: #f48771; }
.node-role { font-weight: 600; font-size: 0.9em; }
.node-model { font-size: 0.8em; opacity: 0.7; }
.node-meta { font-size: 0.75em; opacity: 0.55; }
.memory-row { display: flex; gap: 8px; font-size: 0.75em; margin-top: 4px; flex-wrap: wrap; }
.badge {
  background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  border-radius: 10px; padding: 1px 7px; font-size: 0.75em;
}
.offline-msg { padding: 12px; opacity: 0.6; font-size: 0.9em; }
.refresh-row { display: flex; gap: 4px; margin-bottom: 8px; align-items: center; }
.btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 0.8em; }
.btn:hover { background: var(--vscode-button-hoverBackground); }
#statusBar { font-size: 0.75em; opacity: 0.6; flex: 1; }
</style>
</head>
<body>
<div class="refresh-row">
  <span id="statusBar">Connecting…</span>
  <button class="btn" onclick="refresh()">⟳ Refresh</button>
</div>
<h3>NEXUS Cluster</h3>
<div id="nodes"></div>
<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }

function vram(n) { return n ? n.toFixed(1) + ' GB VRAM' : ''; }
function ram(n)  { return n ? n.toFixed(1) + ' GB RAM' : ''; }
function ssd(n)  { return n ? n.toFixed(1) + ' GB SSD' : ''; }

window.addEventListener('message', (e) => {
  const msg = e.data;
  const nodesEl = document.getElementById('nodes');
  const status  = document.getElementById('statusBar');

  function escape(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  if (msg.command === 'offline') {
    status.textContent = '● Offline — ' + String(msg.message || '').slice(0, 50);
    nodesEl.innerHTML = '<div class="offline-msg">⚡ Cannot reach NEXUS host.<br>Check nexus.hostUrl in settings.</div>';
    return;
  }
  if (msg.command !== 'topology') return;

  const t = msg.data;
  status.textContent = '● Online — ' + t.total_nodes + ' node' + (t.total_nodes === 1 ? '' : 's');
  nodesEl.innerHTML = '';

  function makeCard(node, isLocal) {
    const card = document.createElement('div');
    card.className = 'node-card ' + (isLocal ? 'local' : 'peer');
    card.innerHTML =
      '<div class="node-header">' +
        '<span class="dot online"></span>' +
        '<div>' +
          '<div class="node-role">' + (isLocal ? '★ ' : '') + escape(node.role_description || node.hostname) + '</div>' +
          '<div class="node-model">' + escape(node.model_name || 'Unknown model') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="memory-row">' +
        (vram(node.vram_gb) ? '<span class="badge">VRAM ' + escape(vram(node.vram_gb)) + '</span>' : '') +
        (ram(node.ram_gb)   ? '<span class="badge">RAM ' + escape(ram(node.ram_gb)) + '</span>' : '') +
        (ssd(node.ssd_swap_gb) ? '<span class="badge">SSD ' + escape(ssd(node.ssd_swap_gb)) + '</span>' : '') +
        '<span class="badge">ctx ' + (node.max_context||0).toLocaleString() + '</span>' +
      '</div>' +
      '<div class="node-meta">' + escape(node.api_host) + ':' + node.api_port + ' · ' + escape(node.node_id) + '</div>';
    return card;
  }

  nodesEl.appendChild(makeCard(t.local_node, true));
  for (const n of (t.nodes || [])) {
    if (n.node_id !== t.local_node.node_id) {
      nodesEl.appendChild(makeCard(n, false));
    }
  }
});
</script>
</body>
</html>`;
    }
}
