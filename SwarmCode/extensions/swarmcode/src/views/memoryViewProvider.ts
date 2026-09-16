import * as vscode from 'vscode';
import { NexusClient } from '../nexusClient';
import { IngestedContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Memory View Provider — ingested context summary, per-file tokens, clear/re-ingest
// ─────────────────────────────────────────────────────────────────────────────

export class MemoryViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'nexus.memoryView';
    private _view?: vscode.WebviewView;

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
            if (msg.command === 'clear') {
                await this.client.clearScope();
                vscode.window.showInformationMessage('NEXUS: Context memory cleared.');
                await this.refresh();
            }
        });

        this.refresh();
    }

    public async refresh() {
        try {
            const ctx = await this.client.getCurrentContext();
            this._view?.webview.postMessage({ command: 'update', ctx });
        } catch (e: any) {
            this._view?.webview.postMessage({ command: 'error', message: e.message });
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
.summary { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; font-size: 0.85em; }
.meta { font-size: 0.78em; opacity: 0.6; margin-top: 4px; }
.file-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.8em; padding: 3px 0; border-bottom: 1px solid var(--vscode-editorWidget-border); }
.file-row:last-child { border-bottom: none; }
.file-name { opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.file-size { opacity: 0.55; flex-shrink: 0; margin-left: 8px; }
.btn-row { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
.btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 0.78em; }
.btn:hover { background: var(--vscode-button-hoverBackground); }
.btn.sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.total-bar { margin-bottom: 8px; }
.gauge { height: 8px; background: var(--vscode-editor-background); border-radius: 4px; overflow: hidden; margin-top: 3px; }
.gauge-fill { height: 100%; background: linear-gradient(90deg, #569cd6, #4ec9b0); border-radius: 4px; }
.empty { opacity: 0.45; font-size: 0.85em; font-style: italic; padding: 8px 0; }
</style>
</head>
<body>
<h3>NEXUS Memory</h3>
<div id="root"><div class="empty">Loading…</div></div>
<div class="btn-row">
  <button class="btn sec" onclick="refresh()">⟳ Refresh</button>
  <button class="btn sec" onclick="clearMemory()">✕ Clear Memory</button>
</div>
<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }
function clearMemory() { vscode.postMessage({ command: 'clear' }); }

function shorten(p) {
  if (!p) return '';
  return p.replace(/\\\\/g, '/').split('/').slice(-2).join('/');
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  const root = document.getElementById('root');

  if (msg.command === 'error') {
    root.innerHTML = '<div class="empty">⚠ ' + msg.message + '</div>';
    return;
  }
  if (msg.command !== 'update') return;
  const ctx = msg.ctx;
  if (!ctx) { root.innerHTML = '<div class="empty">No context ingested yet.</div>'; return; }

  const totalKB = Math.round((ctx.total_tokens || 0) / 1000 * 0.75);
  let html = '<div class="summary">' +
    '<div>' + (ctx.summary || 'No summary') + '</div>' +
    '<div class="meta">Ingested: ' + (ctx.ingested_at ? new Date(ctx.ingested_at).toLocaleString() : 'Unknown') + ' · ~' + (ctx.total_tokens || 0).toLocaleString() + ' tokens</div>' +
  '</div>';

  if (ctx.files && ctx.files.length) {
    html += '<h3>Files in Memory (' + ctx.files.length + ')</h3>';
    ctx.files.forEach(f => {
      const kb = f.size ? Math.round(f.size / 1024) + ' KB' : (f.content ? Math.round(f.content.length / 1024) + ' KB' : '');
      html += '<div class="file-row">' +
        '<span class="file-name">📄 ' + shorten(f.path) + '</span>' +
        '<span class="file-size">' + kb + '</span>' +
      '</div>';
    });
  } else {
    html += '<div class="empty">No files in memory.</div>';
  }

  root.innerHTML = html;
});
</script>
</body>
</html>`;
    }
}
