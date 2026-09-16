import * as vscode from 'vscode';
import { NexusClient } from '../nexusClient';
import { ContextEngine } from '../contextEngine';
import { WorkspaceContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Context View Provider — workspace context map: files, tokens, scope, git
// ─────────────────────────────────────────────────────────────────────────────

export class ContextViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'nexus.contextView';
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
                case 'ingest': await this.ingestWorkspace(); break;
                case 'clearScope': await this.client.clearScope(); await this.refresh(); break;
                case 'grantScope':
                    const uris = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectMany: true, openLabel: 'Grant to NEXUS' });
                    if (uris?.length) {
                        await this.client.setScope(uris.map((u) => u.fsPath));
                        await this.refresh();
                    }
                    break;
            }
        });

        // Refresh when editor changes
        const editorSub = vscode.window.onDidChangeActiveTextEditor(() => this.refresh());
        webviewView.onDidDispose(() => editorSub.dispose());

        this.refresh();
    }

    public async refresh() {
        try {
            const [ctx, scope, ingested] = await Promise.all([
                this.contextEngine.buildContext(),
                this.client.getScope().catch(() => ({ roots: [], restricted: false })),
                this.client.getCurrentContext().catch(() => null),
            ]);
            this._view?.webview.postMessage({ command: 'update', ctx, scope, ingested });
        } catch (e: any) {
            this._view?.webview.postMessage({ command: 'error', message: e.message });
        }
    }

    private async ingestWorkspace() {
        const ctx = await this.contextEngine.buildContext();
        const filesToIngest = [ctx.activeFile, ...ctx.relatedFiles].filter(Boolean);
        const entries = await this.contextEngine.buildFileEntries(filesToIngest);
        const summary = `Workspace: ${ctx.workspace}. Active: ${ctx.activeFile}.`;

        vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'NEXUS: Ingesting context…' },
            async () => {
                await this.client.ingestContext(summary, entries);
                await this.refresh();
            }
        );
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
h3 { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.55; margin: 10px 0 5px; }
.section { margin-bottom: 10px; }
.file-item { font-size: 0.82em; padding: 2px 0; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-item.active { color: #4ec9b0; font-weight: 600; }
.token-bar { background: var(--vscode-editorWidget-background); border-radius: 4px; height: 8px; margin: 2px 0; overflow: hidden; }
.token-fill { height: 100%; background: var(--vscode-focusBorder); border-radius: 4px; transition: width 0.3s; }
.token-row { display: flex; justify-content: space-between; font-size: 0.75em; opacity: 0.65; margin-bottom: 2px; }
.diag { font-size: 0.8em; padding: 2px 0; }
.diag.error { color: var(--vscode-errorForeground); }
.diag.warning { color: var(--vscode-editorWarning-foreground); }
.scope-root { font-size: 0.78em; opacity: 0.7; word-break: break-all; margin: 2px 0; }
.btn-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 0.78em; }
.btn:hover { background: var(--vscode-button-hoverBackground); }
.btn.sec { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.empty { opacity: 0.45; font-size: 0.82em; font-style: italic; }
</style>
</head>
<body>
<div id="root"><div class="empty">Loading context…</div></div>
<script>
const vscode = acquireVsCodeApi();
function refresh() { vscode.postMessage({ command: 'refresh' }); }
function ingest() { vscode.postMessage({ command: 'ingest' }); }
function clearScope() { vscode.postMessage({ command: 'clearScope' }); }
function grantScope() { vscode.postMessage({ command: 'grantScope' }); }

function shorten(p) {
  if (!p) return '';
  const parts = p.replace(/\\\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.command === 'error') {
    document.getElementById('root').innerHTML = '<div class="empty">⚠ ' + msg.message + '</div>';
    return;
  }
  if (msg.command !== 'update') return;
  const { ctx, scope, ingested } = msg;

  const maxTok = Math.max(ctx.tokenCounts.project, 1);
  const pct = (v) => Math.min(100, Math.round(v / maxTok * 100)) + '%';

  let html = '';

  // Current file
  html += '<h3>Current</h3><div class="section">';
  if (ctx.activeFile) html += '<div class="file-item active">› ' + shorten(ctx.activeFile) + '</div>';
  else html += '<div class="empty">No active file</div>';
  html += '</div>';

  // Related files
  html += '<h3>Related</h3><div class="section">';
  if (ctx.relatedFiles.length) {
    ctx.relatedFiles.forEach(f => { html += '<div class="file-item">  ' + shorten(f) + '</div>'; });
  } else { html += '<div class="empty">None detected</div>'; }
  html += '</div>';

  // Diagnostics
  const errs = ctx.diagnostics.filter(d => d.severity === 'error');
  const warns = ctx.diagnostics.filter(d => d.severity === 'warning');
  html += '<h3>Diagnostics</h3><div class="section">';
  if (!errs.length && !warns.length) { html += '<div class="empty">No issues</div>'; }
  errs.slice(0, 3).forEach(d => { html += '<div class="diag error">✗ ' + shorten(d.file) + ':' + d.line + ' ' + d.message.slice(0,50) + '</div>'; });
  warns.slice(0, 3).forEach(d => { html += '<div class="diag warning">⚠ ' + shorten(d.file) + ':' + d.line + ' ' + d.message.slice(0,50) + '</div>'; });
  html += '</div>';

  // Git
  html += '<h3>Git</h3><div class="section">';
  if (ctx.gitBranch) html += '<div class="file-item">Branch: ' + ctx.gitBranch + '</div>';
  if (ctx.modifiedFiles.length) html += '<div class="file-item">' + ctx.modifiedFiles.length + ' modified file' + (ctx.modifiedFiles.length===1?'':'s') + '</div>';
  else html += '<div class="empty">No changes</div>';
  html += '</div>';

  // Tokens
  html += '<h3>Tokens</h3><div class="section">';
  ['project','selected','sent'].forEach(k => {
    const v = ctx.tokenCounts[k];
    html += '<div class="token-row"><span>'+k+'</span><span>'+v.toLocaleString()+'</span></div>';
    html += '<div class="token-bar"><div class="token-fill" style="width:'+pct(v)+'"></div></div>';
  });
  html += '</div>';

  // Scope
  html += '<h3>NEXUS Scope</h3><div class="section">';
  if (scope.roots.length) {
    scope.roots.forEach(r => { html += '<div class="scope-root">📁 ' + r + '</div>'; });
  } else { html += '<div class="empty">No workspace roots granted</div>'; }
  html += '</div>';

  // Actions
  html += '<div class="btn-row">';
  html += '<button class="btn" onclick="ingest()">⬆ Ingest Context</button>';
  html += '<button class="btn sec" onclick="grantScope()">Grant Folder</button>';
  html += '<button class="btn sec" onclick="clearScope()">Clear Scope</button>';
  html += '<button class="btn sec" onclick="refresh()">⟳ Refresh</button>';
  html += '</div>';

  document.getElementById('root').innerHTML = html;
});
</script>
</body>
</html>`;
    }
}
