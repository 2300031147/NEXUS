import * as vscode from 'vscode';
import { NexusClient } from './nexusClient';
import { ContextEngine } from './contextEngine';
import { ToolGateway } from './toolGateway';
import { DiffProposal, NexusEvent, TaskSession, TaskStatus, NexusTask } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostics Watcher — watches IDE diagnostics and surfaces "Fix with NEXUS"
// ─────────────────────────────────────────────────────────────────────────────

export class DiagnosticsWatcher implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];
    private disposables: vscode.Disposable[] = [];

    constructor(private readonly client: NexusClient, private readonly context: ContextEngine) {
        this.disposables.push(
            vscode.languages.registerCodeActionsProvider(
                { scheme: 'file' },
                this,
                { providedCodeActionKinds: DiagnosticsWatcher.providedCodeActionKinds }
            )
        );
    }

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        return context.diagnostics
            .filter((d) => d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning)
            .map((d) => {
                const action = new vscode.CodeAction(`NEXUS: Fix — ${d.message.split('\n')[0].slice(0, 60)}`, vscode.CodeActionKind.QuickFix);
                action.command = {
                    command: 'nexus.fixDiagnostic',
                    title: 'Fix with NEXUS',
                    arguments: [document.uri, d],
                };
                action.diagnostics = [d];
                action.isPreferred = false;
                return action;
            });
    }

    public dispose() { this.disposables.forEach((d) => d.dispose()); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Manager — tracks active NexusTask sessions and their event timelines
// ─────────────────────────────────────────────────────────────────────────────

export class TaskManager {
    private sessions: Map<string, TaskSession> = new Map();
    public readonly onTaskUpdated: vscode.EventEmitter<TaskSession> = new vscode.EventEmitter<TaskSession>();

    constructor(
        private readonly client: NexusClient,
        private readonly gateway: ToolGateway
    ) {}

    public async submitTask(task: NexusTask): Promise<TaskSession> {
        const session: TaskSession = {
            sessionId: `session-${Date.now()}`,
            taskId: task.id,
            status: 'planning',
            events: [],
            startedAt: Date.now(),
        };
        this.sessions.set(session.sessionId, session);
        this.onTaskUpdated.fire(session);

        this.runTask(session, task).catch((e) => {
            session.status = 'failed';
            session.events.push({
                type: 'TASK_FAILED',
                nodeId: 'local',
                timestamp: Date.now(),
                payload: { error: e.message },
            });
            this.onTaskUpdated.fire(session);
        });

        return session;
    }

    private async runTask(session: TaskSession, task: NexusTask): Promise<void> {
        const updateStatus = (status: TaskStatus) => {
            session.status = status;
            this.onTaskUpdated.fire(session);
        };

        const addEvent = (event: NexusEvent) => {
            session.events.push(event);
            this.onTaskUpdated.fire(session);
        };

        updateStatus('planning');
        addEvent({ type: 'NODE_STARTED', nodeId: 'orchestrator', timestamp: Date.now(), payload: { goal: task.goal } });

        updateStatus('implementation');
        const result = await this.client.submitTask(task);

        addEvent({
            type: 'NODE_RESPONSE',
            nodeId: 'consensus',
            timestamp: Date.now(),
            payload: {
                nodes: result.participating_nodes,
                rounds: result.rounds_to_zero_error,
            },
        });

        session.result = result.approved_plan;

        if (task.approvalRequired) {
            updateStatus('awaiting_approval');
            addEvent({ type: 'NODE_APPROVED', nodeId: 'consensus', timestamp: Date.now(), payload: {} });
        } else {
            session.completedAt = Date.now();
            updateStatus('applied');
            addEvent({ type: 'TASK_COMPLETED', nodeId: 'orchestrator', timestamp: Date.now(), payload: {} });
        }
    }

    public acceptTask(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (!session || session.status !== 'awaiting_approval') { return; }
        session.status = 'applied';
        session.completedAt = Date.now();
        session.events.push({ type: 'TASK_COMPLETED', nodeId: 'orchestrator', timestamp: Date.now(), payload: {} });
        this.onTaskUpdated.fire(session);
    }

    public rejectTask(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) { return; }
        session.status = 'rejected';
        session.completedAt = Date.now();
        session.events.push({ type: 'NODE_REJECTED', nodeId: 'orchestrator', timestamp: Date.now(), payload: {} });
        this.onTaskUpdated.fire(session);
    }

    public getSessions(): TaskSession[] {
        return Array.from(this.sessions.values()).sort((a, b) => b.startedAt - a.startedAt);
    }

    public getSession(id: string): TaskSession | undefined {
        return this.sessions.get(id);
    }

    public dispose() { this.onTaskUpdated.dispose(); }
}
