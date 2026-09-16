import * as vscode from 'vscode';
import { NexusClient } from './nexusClient';
import { ContextEngine } from './contextEngine';
import { GitBridge } from './gitBridge';
import { ToolGateway } from './toolGateway';
import { TaskManager, DiagnosticsWatcher } from './taskManager';

import { ChatViewProvider } from './views/chatViewProvider';
import { ClusterViewProvider } from './views/clusterViewProvider';
import { ContextViewProvider } from './views/contextViewProvider';
import { AgentViewProvider } from './views/agentViewProvider';
import { TaskViewProvider } from './views/taskViewProvider';
import { InfrastructureViewProvider } from './views/infrastructureViewProvider';
import { MemoryViewProvider } from './views/memoryViewProvider';
import { FilesViewProvider } from './views/filesViewProvider';

import { NexusCodeLensProvider, showInlineMenu } from './inlineActions';
import { NexusTask } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// NEXUS Extension — activation entry point
// ─────────────────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
    console.log('[NEXUS] Extension activating…');

    // ── Core services ────────────────────────────────────────────────────────
    const config = vscode.workspace.getConfiguration('nexus');
    const hostUrl = config.get<string>('hostUrl') ?? 'http://localhost:8090';

    const gitBridge    = new GitBridge();
    const nexusClient  = new NexusClient(hostUrl);
    const contextEng   = new ContextEngine(gitBridge);
    const toolGateway  = new ToolGateway(context);
    const taskManager  = new TaskManager(nexusClient, toolGateway);
    const diagWatcher  = new DiagnosticsWatcher(nexusClient, contextEng);
    context.subscriptions.push(taskManager, diagWatcher, toolGateway);

    // ── 8 native view providers ──────────────────────────────────────────────
    const chatProvider    = new ChatViewProvider(context.extensionUri, nexusClient, contextEng);
    const clusterProvider = new ClusterViewProvider(context.extensionUri, nexusClient);
    const ctxProvider     = new ContextViewProvider(context.extensionUri, nexusClient, contextEng);
    const agentProvider   = new AgentViewProvider(context.extensionUri, taskManager);
    const taskProvider    = new TaskViewProvider(context.extensionUri, taskManager);
    const infraProvider   = new InfrastructureViewProvider(context.extensionUri, nexusClient);
    const memoryProvider  = new MemoryViewProvider(context.extensionUri, nexusClient);
    const filesProvider   = new FilesViewProvider(context.extensionUri, nexusClient, contextEng);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId,          chatProvider,    { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(ClusterViewProvider.viewId,       clusterProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(ContextViewProvider.viewId,       ctxProvider,     { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(AgentViewProvider.viewId,         agentProvider,   { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(TaskViewProvider.viewId,          taskProvider,    { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(InfrastructureViewProvider.viewId, infraProvider,  { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(MemoryViewProvider.viewId,        memoryProvider,  { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(FilesViewProvider.viewId,         filesProvider,   { webviewOptions: { retainContextWhenHidden: true } }),
    );

    // ── CodeLens ─────────────────────────────────────────────────────────────
    context.subscriptions.push(NexusCodeLensProvider.register(context));

    // ── Configuration change handler ─────────────────────────────────────────
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('nexus.hostUrl')) {
                const newUrl = vscode.workspace.getConfiguration('nexus').get<string>('hostUrl') ?? 'http://localhost:8090';
                nexusClient.setHostUrl(newUrl);
                clusterProvider.refresh();
                infraProvider.refresh();
            }
        })
    );

    // ── Diff proposal events → task view ─────────────────────────────────────
    context.subscriptions.push(
        toolGateway.onDiffProposed.event((proposal) => {
            vscode.window.showInformationMessage(
                `NEXUS proposed edit: ${proposal.path.split('/').pop()}`,
                'Accept', 'Reject'
            ).then((choice) => {
                if (choice === 'Accept') { toolGateway.acceptDiff(proposal.id); }
                else if (choice === 'Reject') { toolGateway.rejectDiff(proposal.id); }
            });
        })
    );

    // ── Command: nexus.ask ────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.ask', async () => {
            const text = await vscode.window.showInputBox({
                prompt: 'Ask NEXUS anything',
                placeHolder: 'e.g. "Explain the authentication flow"',
            });
            if (text) { await chatProvider.sendMessage(text); }
        })
    );

    // ── Command: nexus.sendToChat (used by inline actions) ────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.sendToChat', async (text: string, consensus = false) => {
            await chatProvider.sendMessage(text, true);
        })
    );

    // ── Command: nexus.explainSelection ──────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.explainSelection', async () => {
            const sel = getSelection();
            if (sel) { await chatProvider.sendMessage(`Explain the following code:\n\`\`\`\n${sel}\n\`\`\``); }
        })
    );

    // ── Command: nexus.fixSelection ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.fixSelection', async () => {
            const sel = getSelection();
            if (sel) { await chatProvider.sendMessage(`Fix any issues in the following code:\n\`\`\`\n${sel}\n\`\`\``); }
        })
    );

    // ── Command: nexus.refactor ───────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.refactor', async () => {
            const sel = getSelection();
            if (sel) { await chatProvider.sendMessage(`Refactor the following code for clarity and performance:\n\`\`\`\n${sel}\n\`\`\``); }
        })
    );

    // ── Command: nexus.generateTests ──────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.generateTests', async () => {
            const sel = getSelection();
            if (sel) { await chatProvider.sendMessage(`Generate comprehensive unit tests for:\n\`\`\`\n${sel}\n\`\`\``); }
        })
    );

    // ── Command: nexus.reviewFile ─────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.reviewFile', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }
            const text = editor.document.getText();
            const file = editor.document.fileName;
            await chatProvider.sendMessage(`Review this file for bugs, issues, and improvements:\n\nFile: ${file}\n\`\`\`\n${text.slice(0, 5000)}\n\`\`\``);
        })
    );

    // ── Command: nexus.reviewWorkspace ────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.reviewWorkspace', async () => {
            const ctx = await contextEng.buildContext();
            await chatProvider.sendMessage(
                `Review the workspace "${ctx.workspace}" for overall code quality, architecture, and issues. ` +
                `Active file: ${ctx.activeFile}. Modified files: ${ctx.modifiedFiles.join(', ')}.`
            );
        })
    );

    // ── Command: nexus.runConsensus ───────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.runConsensus', async () => {
            const goal = await vscode.window.showInputBox({
                prompt: 'Goal for NEXUS Team consensus',
                placeHolder: 'e.g. "Design a JWT authentication system"',
            });
            if (!goal) { return; }

            const ctx = await contextEng.buildContext();
            const task: NexusTask = {
                id: `consensus-${Date.now()}`,
                type: 'consensus',
                goal,
                workspace: ctx.workspace,
                files: [ctx.activeFile, ...ctx.relatedFiles].filter(Boolean),
                agents: [],
                approvalRequired: true,
                context: ctx,
            };
            await taskManager.submitTask(task);
            vscode.window.showInformationMessage('NEXUS: Consensus task submitted. Check the Agents & Tasks panels.');
        })
    );

    // ── Command: nexus.submitTask ─────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.submitTask', async () => {
            const goal = await vscode.window.showInputBox({ prompt: 'Task goal', placeHolder: 'Describe what to implement…' });
            if (!goal) { return; }
            const typeChoice = await vscode.window.showQuickPick(
                ['implement', 'fix', 'refactor', 'explain', 'review', 'generate_tests', 'security_review', 'consensus'],
                { placeHolder: 'Task type' }
            );
            if (!typeChoice) { return; }
            const ctx = await contextEng.buildContext();
            const task: NexusTask = {
                id: `task-${Date.now()}`,
                type: typeChoice as NexusTask['type'],
                goal,
                workspace: ctx.workspace,
                files: [ctx.activeFile].filter(Boolean),
                agents: [],
                approvalRequired: true,
                context: ctx,
            };
            await taskManager.submitTask(task);
        })
    );

    // ── Command: nexus.fixDiagnostic (from code action) ───────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.fixDiagnostic', async (uri: vscode.Uri, diag: vscode.Diagnostic) => {
            const doc = await vscode.workspace.openTextDocument(uri);
            const lineText = doc.lineAt(diag.range.start.line).text;
            await chatProvider.sendMessage(
                `Fix this diagnostic error in ${uri.fsPath}:\n\n` +
                `Line ${diag.range.start.line + 1}: ${diag.message}\n\n` +
                `Code: \`${lineText.trim()}\``,
                true
            );
        })
    );

    // ── Command: nexus.showCluster ────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.showCluster', () => {
            vscode.commands.executeCommand('nexus.clusterView.focus');
        })
    );

    // ── Command: nexus.showInfrastructure ─────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.showInfrastructure', () => {
            vscode.commands.executeCommand('nexus.infrastructureView.focus');
        })
    );

    // ── Command: nexus.showMemory ─────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.showMemory', () => {
            vscode.commands.executeCommand('nexus.memoryView.focus');
        })
    );

    // ── Command: nexus.showActiveModels ───────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.showActiveModels', async () => {
            try {
                const topology = await nexusClient.getTopology();
                const items = topology.nodes.map((n) => ({
                    label: `$(vm) ${n.role_description || n.hostname}`,
                    description: n.model_name,
                    detail: `${n.api_host}:${n.api_port} — VRAM: ${n.vram_gb}GB, RAM: ${n.ram_gb}GB`,
                }));
                vscode.window.showQuickPick(items, { placeHolder: 'Active NEXUS Models', title: 'NEXUS Cluster' });
            } catch (e: any) {
                vscode.window.showErrorMessage(`NEXUS offline: ${e.message}`);
            }
        })
    );

    // ── Command: nexus.ingestContext ──────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.ingestContext', async () => {
            await ctxProvider.refresh();
            vscode.window.showInformationMessage('NEXUS: Context refreshed and ingested.');
        })
    );

    // ── Command: nexus.acceptDiff ─────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.acceptDiff', async (diffId: string) => {
            await toolGateway.acceptDiff(diffId);
        })
    );

    // ── Command: nexus.rejectDiff ─────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.rejectDiff', (diffId: string) => {
            toolGateway.rejectDiff(diffId);
        })
    );

    // ── Command: nexus.showInlineMenu (CodeLens click) ────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('nexus.showInlineMenu', (uri: vscode.Uri, range: vscode.Range, name: string) => {
            showInlineMenu(uri, range, name, nexusClient, contextEng);
        })
    );

    // ── Status bar item ───────────────────────────────────────────────────────
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'nexus.showActiveModels';
    statusBar.text = '$(hubot) NEXUS';
    statusBar.tooltip = 'NEXUS AI Backend — click to show active models';
    statusBar.show();
    context.subscriptions.push(statusBar);

    // Ping the backend and update status bar
    nexusClient.ping().then((online) => {
        statusBar.text = online ? '$(hubot) NEXUS ●' : '$(hubot) NEXUS ○';
        statusBar.tooltip = online ? 'NEXUS Online' : 'NEXUS Offline — check nexus.hostUrl';
    });

    // Ping every 30 seconds
    const pingInterval = setInterval(async () => {
        const online = await nexusClient.ping();
        statusBar.text = online ? '$(hubot) NEXUS ●' : '$(hubot) NEXUS ○';
    }, 30000);
    context.subscriptions.push({ dispose: () => clearInterval(pingInterval) });

    console.log('[NEXUS] Extension activated successfully.');
}

export function deactivate() {}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSelection(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('NEXUS: No active editor.');
        return undefined;
    }
    const sel = editor.document.getText(editor.selection);
    if (!sel.trim()) {
        vscode.window.showWarningMessage('NEXUS: No text selected. Select code first.');
        return undefined;
    }
    return sel;
}
