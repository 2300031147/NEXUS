import * as vscode from 'vscode';
import { NexusClient } from '../nexusClient';
import { ContextEngine } from '../contextEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Files View Provider — workspace files granted to NEXUS scope, ingest selection
// ─────────────────────────────────────────────────────────────────────────────

export class FilesViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'nexus.filesView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly client: NexusClient,
        private readonly contextEngine: ContextEngine,
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'refresh': await this.refresh(); break;
                case 'addFiles': await this.addFiles(); break;
                case 'ingestFiles':
                    await this.ingestFiles(msg.paths);
                    break;
            }
        });

        this.refresh();
    }

    public async refresh() {
        try {
            const scope = await this.client.getScope().catch(() => ({ roots: [], restricted: false }));
            const openFiles = (vscode.window.tabGroups.all
                .flatMap((g) => g.tabs)
                .filter((t) => t.input instanceof vscode.TabInputText)
                .map((t) => (t.input as vscode.TabInputText).uri.fsPath));
            this._view?.webview.postMessage({ command: 'update', scope, openFiles });
        } catch (e: any) {
            this._view?.webview.postMessage({ command: 'error', message: e.message });
        }
    }

    private async addFiles() {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: 'Add to NEXUS',
        });
        if (!uris?.length) { return; }
        const entries = await this.contextEngine.buildFileEntries(uris.map((u) => u.fsPath));
        const summary = `Files added by user: ${uris.map((u) => u.fsPath).join(', ')}`;
        await this.client.ingestContext(summary, entries);
        vscode.window.showInformationMessage(`NEXUS: ${entries.length} file(s) ingested.`);
        await this.refresh();
    }

    private async ingestFiles(paths: string[]) {
        if (!paths.length) { return; }
        try {
            const entries = await this.contextEngine.buildFileEntries(paths);
            const summary = `Files: ${paths.join(', ')}`;
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `NEXUS: Ingesting ${entries.length} file(s)…` },
                async () => {
                    await this.client.ingestContext(summary, entries);
                }
            );
            vscode.window.showInformationMessage(`NEXUS: ${entries.length} file(s) sent to NEXUS memory.`);
        } catch (e: any) {
            vscode.window.showErrorMessage(`NEXUS: Failed to ingest files: ${e.message}`);
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
.file-row {
  display: flex; align-items: center; gap: 4px;
  font-size: 0.82em; padding: 3px 4px; border-radius: 4px;
  cursor: pointer;
}
.file-row:hover { background: var(--vscode-list-hoverBackground); }
.file-row input[type=checkbox] { flex-shrink: 0; cursor: pointer; }
.file-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.9; }
.btn-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
.btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 0.78em; }
.btn:hover { background: var(--vscode-button-hoverBackground); }
.btn.sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.empty { opacity: 0.45; font-size: 0.85em; font-style: italic; padding: 8px 0; }
</style>
</head>
<body>
<h3>Open Files</h3>
<div id="openFiles"><div class="empty">No open files.</div></div>

<div class="btn-row">
  <button class="btn" onclick="ingestSelected()">⬆ Ingest Selected</button>
  <button class="btn sec" onclick="addFiles()">+ Add Files</button>
  <button class="btn sec" onclick="refresh()">⟳ Refresh</button>
</div>

<script>
const vscode = acquireVsCodeApi();
let allOpenFiles = [];

function refresh() { vscode.postMessage({ command: 'refresh' }); }
function addFiles() { vscode.postMessage({ command: 'addFiles' }); }
function ingestSelected() {
  const checked = Array.from(document.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
  if (!checked.length) { return; }
  vscode.postMessage({ command: 'ingestFiles', paths: checked });
}

function shorten(p) {
  if (!p) return '';
  return p.replace(/\\\\/g, '/').split('/').slice(-2).join('/');
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.command === 'error') { document.getElementById('openFiles').innerHTML = '<div class="empty">⚠ ' + escape(msg.message) + '</div>'; return; }
  if (msg.command !== 'update') return;
  const { openFiles } = msg;
  allOpenFiles = openFiles;

  const el = document.getElementById('openFiles');
  if (!openFiles.length) { el.innerHTML = '<div class="empty">No open files.</div>'; return; }
  el.innerHTML = '';
  openFiles.forEach(fp => {
    const row = document.createElement('div');
    row.className = 'file-row';
    // Use DOM APIs to set the checkbox value safely (avoids XSS via file paths with quotes/angle brackets)
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = fp;
    const label = document.createElement('span');
    label.className = 'file-name';
    label.textContent = '📄 ' + shorten(fp);
    row.appendChild(cb);
    row.appendChild(label);
    el.appendChild(row);
  });
});
</script>
</body>
</html>`;
    }
}
