import * as vscode from 'vscode';
import { TaskManager } from '../taskManager';
import { TaskSession } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Agent View Provider — NEXUS TEAM: per-node status cards with live events
// ─────────────────────────────────────────────────────────────────────────────

export class AgentViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'nexus.agentView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly taskManager: TaskManager,
    ) {
        taskManager.onTaskUpdated.event((_session) => {
            // Send ALL sessions on every update so the webview maintains full state
            this._view?.webview.postMessage({
                command: 'sessions',
                sessions: taskManager.getSessions(),
            });
        });
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage((msg) => {
            switch (msg.command) {
                case 'accept': this.taskManager.acceptTask(msg.sessionId); break;
                case 'reject': this.taskManager.rejectTask(msg.sessionId); break;
            }
        });

        // Send current sessions on open
        const sessions = this.taskManager.getSessions();
        if (sessions.length) {
            webviewView.webview.postMessage({ command: 'sessions', sessions });
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
h3 { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.55; margin: 10px 0 5px; }
.agent-card {
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;
  display: flex; align-items: center; gap: 8px;
}
.emoji { font-size: 1.4em; flex-shrink: 0; }
.agent-info { flex: 1; min-width: 0; }
.agent-role { font-weight: 600; font-size: 0.9em; }
.agent-model { font-size: 0.78em; opacity: 0.65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-badge {
  font-size: 0.72em; padding: 2px 7px; border-radius: 10px; flex-shrink: 0;
}
.status-working  { background: #4ec9b0; color: #000; }
.status-waiting  { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.status-reviewing { background: #ce9178; color: #000; }
.status-approved { background: #6a9955; color: #fff; }
.status-rejected { background: var(--vscode-errorForeground); color: #fff; }

.timeline { margin-top: 8px; border-top: 1px solid var(--vscode-editorWidget-border); padding-top: 6px; }
.tl-item { display: flex; gap: 6px; font-size: 0.78em; padding: 2px 0; opacity: 0.85; }
.tl-time { opacity: 0.5; flex-shrink: 0; }
.tl-node { font-weight: 600; flex-shrink: 0; }
.tl-msg { opacity: 0.8; }

.approval-row { display: flex; gap: 6px; margin-top: 8px; }
.btn { border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 0.82em; }
.btn.accept { background: #6a9955; color: #fff; }
.btn.reject  { background: var(--vscode-errorForeground); color: #fff; }
.btn:hover { opacity: 0.85; }

.task-header { margin-bottom: 6px; }
.task-title { font-size: 0.9em; font-weight: 600; }
.task-status { font-size: 0.78em; opacity: 0.65; }
.empty { opacity: 0.45; font-size: 0.85em; font-style: italic; padding: 8px 0; }
</style>
</head>
<body>
<h3>NEXUS Team</h3>
<div id="root"><div class="empty">No active tasks. Start a task from Chat or Command Palette.</div></div>
<script>
const vscode = acquireVsCodeApi();

function escape(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const eventLabels = {
  NODE_STARTED: 'started',
  NODE_THINKING: 'thinking…',
  NODE_TOOL_CALL: 'tool call',
  NODE_FILE_READ: 'reading file',
  NODE_FILE_WRITE: 'writing file',
  NODE_RESPONSE: 'responded',
  NODE_REVIEW: 'reviewing',
  NODE_APPROVED: '✓ approved',
  NODE_REJECTED: '✗ rejected',
  TASK_COMPLETED: '✓ task complete',
  TASK_FAILED: '✗ task failed',
  DIFF_PROPOSED: 'diff proposed',
};

function statusClass(s) {
  const m = { planning:'waiting', architecture:'working', implementation:'working', testing:'reviewing', security_review:'reviewing', consensus:'reviewing', awaiting_approval:'reviewing', applied:'approved', rejected:'rejected', failed:'rejected', pending:'waiting' };
  return 'status-' + (m[s] || 'waiting');
}
function statusLabel(s) {
  return { planning:'Planning', architecture:'Architecture', implementation:'Implementing', testing:'Testing', security_review:'Security', consensus:'Consensus', awaiting_approval:'⚠ Awaiting Approval', applied:'✓ Applied', rejected:'✗ Rejected', failed:'✗ Failed', pending:'Pending' }[s] || s;
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function renderSessions(sessions) {
  const root = document.getElementById('root');
  if (!sessions.length) {
    root.innerHTML = '<div class="empty">No active tasks.</div>';
    return;
  }
  root.innerHTML = '';
  sessions.forEach(s => {
    const div = document.createElement('div');
    div.style.marginBottom = '12px';

    const header = '<div class="task-header"><div class="task-title">Task: ' + escape(s.taskId) + '</div>' +
      '<div class="task-status">' + escape(statusLabel(s.status)) + '</div></div>';

    // Group events by nodeId
    const nodeMap = {};
    s.events.forEach(ev => {
      if (!nodeMap[ev.nodeId]) nodeMap[ev.nodeId] = { role: ev.nodeRole || ev.nodeId, lastEvent: ev };
      nodeMap[ev.nodeId].lastEvent = ev;
    });

    let agents = '';
    Object.entries(nodeMap).forEach(([nodeId, info]) => {
      const ev = info.lastEvent;
      let badge = 'waiting';
      if (ev.type === 'NODE_THINKING' || ev.type === 'NODE_TOOL_CALL' || ev.type === 'NODE_FILE_READ' || ev.type === 'NODE_FILE_WRITE') badge = 'working';
      else if (ev.type === 'NODE_REVIEW' || ev.type === 'NODE_RESPONSE') badge = 'reviewing';
      else if (ev.type === 'NODE_APPROVED' || ev.type === 'TASK_COMPLETED') badge = 'approved';
      else if (ev.type === 'NODE_REJECTED' || ev.type === 'TASK_FAILED') badge = 'rejected';

      agents += '<div class="agent-card">' +
        '<span class="emoji">🤖</span>' +
        '<div class="agent-info">' +
          '<div class="agent-role">' + escape(info.role || nodeId) + '</div>' +
          '<div class="agent-model">' + escape(nodeId) + '</div>' +
        '</div>' +
        '<span class="status-badge status-' + badge + '">' + escape(eventLabels[ev.type] || ev.type) + '</span>' +
      '</div>';
    });

    // Timeline (last 8 events)
    let timeline = '<div class="timeline">';
    s.events.slice(-8).forEach(ev => {
      timeline += '<div class="tl-item">' +
        '<span class="tl-time">' + fmtTime(ev.timestamp) + '</span>' +
        '<span class="tl-node">' + escape(ev.nodeId) + '</span>' +
        '<span class="tl-msg">' + escape(eventLabels[ev.type] || ev.type) + '</span>' +
      '</div>';
    });
    timeline += '</div>';

    let approval = '';
    if (s.status === 'awaiting_approval') {
      // Use data attribute + event listener instead of inline onclick to avoid sessionId injection
      approval = '<div class="approval-row">' +
        '<button class="btn accept" data-id="' + escape(s.sessionId) + '">✓ Accept</button>' +
        '<button class="btn reject" data-id="' + escape(s.sessionId) + '">✗ Reject</button>' +
      '</div>';
    }

    div.innerHTML = header + agents + timeline + approval;
    // Attach event listeners after setting innerHTML (avoids inline onclick injection)
    div.querySelectorAll('.btn.accept').forEach(btn => btn.addEventListener('click', () => accept(btn.dataset.id)));
    div.querySelectorAll('.btn.reject').forEach(btn => btn.addEventListener('click', () => reject(btn.dataset.id)));
    root.appendChild(div);
  });
}

function accept(id) { vscode.postMessage({ command: 'accept', sessionId: id }); }
function reject(id) { vscode.postMessage({ command: 'reject', sessionId: id }); }

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.command === 'taskUpdate') renderSessions([msg.session]);
  if (msg.command === 'sessions') renderSessions(msg.sessions);
});
</script>
</body>
</html>`;
    }
}
