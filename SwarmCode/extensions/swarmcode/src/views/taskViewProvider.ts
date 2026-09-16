import * as vscode from 'vscode';
import { TaskManager } from '../taskManager';
import { TaskSession } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Task View Provider — task lifecycle pipeline with live event log
// ─────────────────────────────────────────────────────────────────────────────

export class TaskViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'nexus.taskView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly taskManager: TaskManager,
    ) {
        taskManager.onTaskUpdated.event((session) => {
            this._view?.webview.postMessage({ command: 'taskUpdate', session });
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
                case 'copyResult': vscode.env.clipboard.writeText(msg.text); break;
            }
        });

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
h3 { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.55; margin: 8px 0 5px; }
.task-card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 10px; margin-bottom: 10px; }
.task-goal { font-weight: 600; font-size: 0.9em; margin-bottom: 6px; }
.pipeline { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; margin-bottom: 8px; }
.step {
  font-size: 0.72em; padding: 2px 8px; border-radius: 10px;
  background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); opacity: 0.5;
}
.step.active { background: var(--vscode-focusBorder); color: #fff; opacity: 1; }
.step.done   { background: #6a9955; color: #fff; opacity: 1; }
.step.failed { background: var(--vscode-errorForeground); color: #fff; opacity: 1; }
.arrow { opacity: 0.3; font-size: 0.8em; }
.timeline { border-top: 1px solid var(--vscode-editorWidget-border); padding-top: 6px; }
.tl-item { display: grid; grid-template-columns: 80px 90px 1fr; gap: 4px; font-size: 0.78em; padding: 2px 0; }
.tl-time { opacity: 0.5; }
.tl-node { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-msg { opacity: 0.8; }
.result-box {
  margin-top: 8px; background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 4px; padding: 8px;
  font-size: 0.82em; max-height: 200px; overflow-y: auto;
  white-space: pre-wrap; word-break: break-word;
}
.approval-row { display: flex; gap: 6px; margin-top: 8px; }
.btn { border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 0.82em; }
.btn.accept { background: #6a9955; color: #fff; }
.btn.reject  { background: var(--vscode-errorForeground); color: #fff; }
.btn.copy { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
.btn:hover { opacity: 0.85; }
.empty { opacity: 0.45; font-size: 0.85em; font-style: italic; padding: 8px 0; }
</style>
</head>
<body>
<h3>NEXUS Tasks</h3>
<div id="root"><div class="empty">No tasks yet.</div></div>
<script>
const vscode = acquireVsCodeApi();

const PIPELINE = ['pending','planning','architecture','implementation','testing','security_review','consensus','awaiting_approval','applied'];
const PIPELINE_LABELS = { pending:'Pending', planning:'Planning', architecture:'Architecture', implementation:'Implementing', testing:'Testing', security_review:'Security', consensus:'Consensus', awaiting_approval:'Approval', applied:'✓ Applied' };

const eventLabels = {
  NODE_STARTED:'started', NODE_THINKING:'thinking', NODE_TOOL_CALL:'tool call',
  NODE_FILE_READ:'reading', NODE_FILE_WRITE:'writing', NODE_RESPONSE:'responded',
  NODE_REVIEW:'reviewing', NODE_APPROVED:'✓ approved', NODE_REJECTED:'✗ rejected',
  TASK_COMPLETED:'✓ complete', TASK_FAILED:'✗ failed', DIFF_PROPOSED:'diff proposed',
};

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function statusOfStep(step, currentStatus) {
  const idx = PIPELINE.indexOf(step);
  const cur = PIPELINE.indexOf(currentStatus);
  if (currentStatus === 'rejected' || currentStatus === 'failed') {
    return idx < cur ? 'done' : (idx === cur ? 'failed' : '');
  }
  if (idx < cur) return 'done';
  if (idx === cur) return 'active';
  return '';
}

function renderSession(s) {
  // Pipeline steps
  let pipeline = '<div class="pipeline">';
  PIPELINE.forEach((step, i) => {
    const cls = statusOfStep(step, s.status);
    pipeline += '<span class="step ' + cls + '">' + PIPELINE_LABELS[step] + '</span>';
    if (i < PIPELINE.length - 1) pipeline += '<span class="arrow">→</span>';
  });
  pipeline += '</div>';

  // Timeline
  let timeline = '<div class="timeline">';
  s.events.slice(-12).forEach(ev => {
    timeline += '<div class="tl-item">' +
      '<span class="tl-time">' + fmtTime(ev.timestamp) + '</span>' +
      '<span class="tl-node">' + ev.nodeId + '</span>' +
      '<span class="tl-msg">' + (eventLabels[ev.type] || ev.type) + '</span>' +
    '</div>';
  });
  timeline += '</div>';

  // Result
  let result = '';
  if (s.result) {
    result = '<div class="result-box">' + s.result.slice(0,800) + (s.result.length>800?'\n…':'') + '</div>' +
      '<div style="margin-top:4px"><button class="btn copy" onclick="copyResult(\'' + encodeURIComponent(s.result) + '\')">Copy Result</button></div>';
  }

  // Approval
  let approval = '';
  if (s.status === 'awaiting_approval') {
    approval = '<div class="approval-row">' +
      '<button class="btn accept" onclick="accept(\'' + s.sessionId + '\')">✓ Accept Task</button>' +
      '<button class="btn reject" onclick="reject(\'' + s.sessionId + '\')">✗ Reject</button>' +
    '</div>';
  }

  const div = document.createElement('div');
  div.className = 'task-card';
  div.id = 'task-' + s.sessionId;
  div.innerHTML =
    '<div class="task-goal">' + s.taskId + '</div>' +
    pipeline + timeline + result + approval;
  return div;
}

function refresh(sessions) {
  const root = document.getElementById('root');
  root.innerHTML = '';
  if (!sessions.length) { root.innerHTML = '<div class="empty">No tasks yet.</div>'; return; }
  sessions.forEach(s => root.appendChild(renderSession(s)));
}

function accept(id) { vscode.postMessage({ command: 'accept', sessionId: id }); }
function reject(id) { vscode.postMessage({ command: 'reject', sessionId: id }); }
function copyResult(enc) { vscode.postMessage({ command: 'copyResult', text: decodeURIComponent(enc) }); }

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.command === 'taskUpdate') {
    const existing = document.getElementById('task-' + msg.session.sessionId);
    const newCard = renderSession(msg.session);
    if (existing) existing.replaceWith(newCard);
    else { const root = document.getElementById('root'); root.innerHTML = ''; root.appendChild(newCard); }
  }
  if (msg.command === 'sessions') refresh(msg.sessions);
});
</script>
</body>
</html>`;
    }
}
