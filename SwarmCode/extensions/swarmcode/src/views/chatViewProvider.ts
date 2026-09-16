import * as vscode from 'vscode';
import { NexusClient } from '../nexusClient';
import { ContextEngine } from '../contextEngine';
import { ChatMessage } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Chat View Provider — streaming chat connected to NEXUS backend
// ─────────────────────────────────────────────────────────────────────────────

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'nexus.chatView';
    private _view?: vscode.WebviewView;
    private history: ChatMessage[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly client: NexusClient,
        private readonly context: ContextEngine,
    ) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'send': await this.handleSend(msg.text, msg.includeContext); break;
                case 'runConsensus': await this.handleConsensus(msg.text); break;
                case 'applyCode': await this.handleApplyCode(msg.code, msg.path); break;
                case 'clearHistory': this.history = []; this.post('cleared', {}); break;
            }
        });
    }

    public async sendMessage(text: string, includeContext = true) {
        if (this._view) {
            this._view.show(true);
            await this.handleSend(text, includeContext);
        }
    }

    private async handleSend(text: string, includeContext: boolean) {
        // Build context prefix
        let systemContent = 'You are NEXUS, an expert AI coding assistant integrated into SwarmCode IDE.';
        if (includeContext) {
            try {
                const ctx = await this.context.buildContext();
                if (ctx.activeFile) {
                    systemContent += `\n\nActive file: ${ctx.activeFile}`;
                }
                if (ctx.selection) {
                    systemContent += `\n\nSelected code:\n\`\`\`\n${ctx.selection}\n\`\`\``;
                }
                if (ctx.diagnostics.length) {
                    const errors = ctx.diagnostics.filter((d) => d.severity === 'error');
                    if (errors.length) {
                        systemContent += `\n\nDiagnostic errors: ${errors.map((d) => `${d.file}:${d.line} ${d.message}`).join('; ')}`;
                    }
                }
                if (ctx.gitDiff) {
                    systemContent += `\n\nGit diff (partial):\n${ctx.gitDiff.slice(0, 1500)}`;
                }
            } catch { /* context not available */ }
        }

        const messages: ChatMessage[] = [
            { role: 'system', content: systemContent },
            ...this.history,
            { role: 'user', content: text, timestamp: Date.now() },
        ];

        this.history.push({ role: 'user', content: text, timestamp: Date.now() });
        this.post('userMessage', { text, timestamp: Date.now() });

        try {
            let full = '';
            this.post('streamStart', {});
            for await (const chunk of this.client.chat(messages)) {
                full += chunk;
                this.post('streamChunk', { chunk });
            }
            this.post('streamEnd', { text: full });
            this.history.push({ role: 'assistant', content: full, timestamp: Date.now() });
        } catch (e: any) {
            this.post('error', { message: e.message });
        }
    }

    private async handleConsensus(goal: string) {
        this.post('consensusStart', { goal });
        try {
            const result = await this.client.collaborate(goal);
            this.post('consensusResult', {
                plan: result.approved_plan,
                nodes: result.participating_nodes,
                rounds: result.rounds_to_zero_error,
            });
            this.history.push({ role: 'assistant', content: result.approved_plan, timestamp: Date.now() });
        } catch (e: any) {
            this.post('error', { message: e.message });
        }
    }

    private async handleApplyCode(code: string, filePath?: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor && !filePath) {
            vscode.window.showWarningMessage('NEXUS: No active editor to apply code to.');
            return;
        }
        const targetUri = filePath ? vscode.Uri.file(filePath) : editor!.document.uri;
        const edit = new vscode.WorkspaceEdit();
        const doc = filePath
            ? await vscode.workspace.openTextDocument(targetUri)
            : editor!.document;
        edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), code);
        await vscode.workspace.applyEdit(edit);
    }

    private post(command: string, payload: Record<string, unknown>) {
        this._view?.webview.postMessage({ command, ...payload });
    }

    private getHtml(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>NEXUS Chat</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-sideBar-background);
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .msg {
    max-width: 100%;
    padding: 8px 10px;
    border-radius: 6px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg.user {
    background: var(--vscode-inputOption-activeBackground);
    border-left: 3px solid var(--vscode-focusBorder);
    font-size: 0.9em;
  }
  .msg.assistant {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-editorWidget-border);
  }
  .msg.consensus {
    border-left: 3px solid #4ec9b0;
    background: var(--vscode-editorWidget-background);
  }
  .msg-meta {
    font-size: 0.75em;
    opacity: 0.6;
    margin-bottom: 4px;
  }
  code { font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
  pre {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    padding: 8px;
    overflow-x: auto;
    position: relative;
  }
  .apply-btn {
    position: absolute;
    top: 4px; right: 4px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 0.75em;
  }
  .apply-btn:hover { background: var(--vscode-button-hoverBackground); }
  .thinking {
    display: inline-block;
    color: #4ec9b0;
    animation: pulse 1s infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  #input-area {
    padding: 8px;
    border-top: 1px solid var(--vscode-editorWidget-border);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  #input-row { display: flex; gap: 4px; }
  #userInput {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 6px 8px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    resize: none;
    min-height: 52px;
    max-height: 120px;
  }
  #userInput:focus { outline: 1px solid var(--vscode-focusBorder); border-color: transparent; }
  .btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; border-radius: 4px;
    padding: 4px 10px; cursor: pointer;
    font-size: 0.85em; align-self: flex-end;
  }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  #actions { display: flex; gap: 4px; flex-wrap: wrap; }
  .chip {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 12px; padding: 2px 8px;
    font-size: 0.75em; cursor: pointer; border: none;
  }
  .chip:hover { opacity: 0.8; }
  #ctx-toggle { display: flex; align-items: center; gap: 4px; font-size: 0.75em; opacity: 0.8; }
  #ctx-toggle input { cursor: pointer; }
  .error-msg { color: var(--vscode-errorForeground); font-size: 0.85em; }
</style>
</head>
<body>
<div id="messages"></div>
<div id="input-area">
  <div id="actions">
    <button class="chip" onclick="quickAction('Explain the selected code.')">Explain</button>
    <button class="chip" onclick="quickAction('Fix any issues in the selected code.')">Fix</button>
    <button class="chip" onclick="quickAction('Refactor the selected code for clarity and performance.')">Refactor</button>
    <button class="chip" onclick="quickAction('Generate unit tests for the selected code.')">Tests</button>
    <button class="chip" onclick="quickAction('Review this code for security vulnerabilities.')">Security</button>
    <button class="chip" onclick="startConsensus()">🔀 Ask Team</button>
    <button class="chip" onclick="clearHistory()">✕ Clear</button>
  </div>
  <div id="input-row">
    <textarea id="userInput" placeholder="Ask NEXUS… (Shift+Enter for new line)" rows="2"></textarea>
    <button class="btn" onclick="sendMessage()">Send</button>
  </div>
  <div id="ctx-toggle">
    <input type="checkbox" id="includeContext" checked>
    <label for="includeContext">Include workspace context</label>
  </div>
</div>
<script>
const vscode = acquireVsCodeApi();
const msgs = document.getElementById('messages');
const input = document.getElementById('userInput');

let streamingEl = null;

function ts() {
  return new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function addMsg(role, text, meta = '') {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  if (meta) {
    const m = document.createElement('div');
    m.className = 'msg-meta';
    m.textContent = meta;
    div.appendChild(m);
  }
  div.appendChild(renderContent(text));
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function renderContent(text) {
  const frag = document.createDocumentFragment();
  const TICK3 = String.fromCharCode(96,96,96);
  const codeBlockRe = new RegExp(TICK3 + '[\\s\\S]*?' + TICK3, 'g');
  const splitRe = new RegExp('(' + TICK3 + '[\\s\\S]*?' + TICK3 + ')');
  const parts = text.split(splitRe);
  for (const part of parts) {
    if (part.startsWith(TICK3)) {
      const firstLine = part.indexOf('\\n');
      const code = firstLine > -1 ? part.slice(firstLine + 1).replace(new RegExp(TICK3 + '$'), '') : part.slice(3).replace(new RegExp(TICK3 + '$'), '');
      const pre = document.createElement('pre');
      const codeEl = document.createElement('code');
      codeEl.textContent = code;
      pre.appendChild(codeEl);
      const btn = document.createElement('button');
      btn.className = 'apply-btn';
      btn.textContent = 'Apply';
      btn.onclick = () => vscode.postMessage({ command: 'applyCode', code });
      pre.appendChild(btn);
      frag.appendChild(pre);
    } else {
      const span = document.createElement('span');
      span.textContent = part;
      frag.appendChild(span);
    }
  }
  return frag;
}

function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  const includeContext = document.getElementById('includeContext').checked;
  vscode.postMessage({ command: 'send', text, includeContext });
  input.value = '';
}

function quickAction(text) {
  const includeContext = true;
  vscode.postMessage({ command: 'send', text, includeContext });
}

function startConsensus() {
  const text = input.value.trim() || 'Review and improve the current code.';
  vscode.postMessage({ command: 'runConsensus', text });
  input.value = '';
}

function clearHistory() {
  vscode.postMessage({ command: 'clearHistory' });
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.command) {
    case 'userMessage':
      addMsg('user', msg.text, '🧑 You  ' + ts());
      break;
    case 'streamStart':
      streamingEl = addMsg('assistant', '', '🤖 NEXUS  ' + ts());
      const thinking = document.createElement('span');
      thinking.className = 'thinking';
      thinking.textContent = '▋';
      streamingEl.appendChild(thinking);
      break;
    case 'streamChunk':
      if (streamingEl) {
        // Remove thinking cursor and re-render
        streamingEl.innerHTML = '';
        const m = document.createElement('div');
        m.className = 'msg-meta';
        m.textContent = '🤖 NEXUS  ' + ts();
        streamingEl.appendChild(m);
        streamingEl.appendChild(renderContent(streamingEl._fullText = (streamingEl._fullText ?? '') + msg.chunk));
        const c = document.createElement('span');
        c.className = 'thinking'; c.textContent = '▋';
        streamingEl.appendChild(c);
      }
      break;
    case 'streamEnd':
      if (streamingEl) {
        streamingEl.innerHTML = '';
        const m2 = document.createElement('div');
        m2.className = 'msg-meta';
        m2.textContent = '🤖 NEXUS  ' + ts();
        streamingEl.appendChild(m2);
        streamingEl.appendChild(renderContent(msg.text));
        streamingEl = null;
      }
      msgs.scrollTop = msgs.scrollHeight;
      break;
    case 'consensusStart':
      addMsg('assistant', '🔀 Running NEXUS Team consensus…', '🤖 NEXUS Team  ' + ts());
      break;
    case 'consensusResult':
      addMsg('consensus',
        'Consensus reached ('+msg.rounds+' round'+(msg.rounds===1?'':'s')+')\nNodes: '+msg.nodes.join(', ')+'\n\n'+msg.plan,
        '✅ NEXUS Team  ' + ts());
      msgs.scrollTop = msgs.scrollHeight;
      break;
    case 'error':
      const errDiv = addMsg('assistant', '', '⚠ NEXUS  ' + ts());
      const e = document.createElement('span');
      e.className = 'error-msg';
      e.textContent = 'Error: ' + msg.message;
      errDiv.appendChild(e);
      break;
    case 'cleared':
      msgs.innerHTML = '';
      break;
  }
});
</script>
</body>
</html>`;
    }
}
