import * as vscode from 'vscode';
import { ToolRequest, ToolResult, DiffProposal } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Tool Gateway — agents request IDE operations; the gateway executes them
// safely inside VS Code. write_file operations are staged as diff proposals
// rather than applied directly, giving the user Accept / Reject control.
// ─────────────────────────────────────────────────────────────────────────────

export class ToolGateway {
    /** Emitted when an agent proposes a file edit — UI should show diff. */
    public readonly onDiffProposed: vscode.EventEmitter<DiffProposal> = new vscode.EventEmitter<DiffProposal>();

    private pendingDiffs: Map<string, DiffProposal> = new Map();
    private virtualContentProvider: vscode.Disposable | undefined;
    private virtualContents: Map<string, string> = new Map();

    constructor(private readonly context: vscode.ExtensionContext) {
        // Register an in-memory document content provider for proposed diffs
        this.virtualContentProvider = vscode.workspace.registerTextDocumentContentProvider(
            'nexus-proposed',
            {
                provideTextDocumentContent: (uri: vscode.Uri) => {
                    return this.virtualContents.get(uri.path) ?? '';
                }
            }
        );
        context.subscriptions.push(this.virtualContentProvider);
    }

    /** Execute a tool request from an agent. */
    public async execute(request: ToolRequest): Promise<ToolResult> {
        try {
            switch (request.type) {
                case 'read_files': return await this.readFile(request.path ?? '');
                case 'write_files': return await this.proposeEdit(request.path ?? '', request.content ?? '');
                case 'search_files': return await this.searchWorkspace(request.query ?? '');
                case 'git_diff': return await this.getGitDiff();
                case 'run_command': return await this.runInTerminal(request.command ?? '');
                case 'get_diagnostics': return this.getDiagnostics(request.path);
                case 'open_file': return await this.openEditor(request.path ?? '');
                case 'run_tests': return await this.runTests();
                case 'security_analysis': return this.getDiagnostics(request.path);
                default:
                    return { success: false, error: `Unknown tool type: ${request.type}` };
            }
        } catch (e: any) {
            return { success: false, error: e.message ?? String(e) };
        }
    }

    // ── Tool Implementations ─────────────────────────────────────────────────

    private async readFile(filePath: string): Promise<ToolResult> {
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        return { success: true, data: doc.getText() };
    }

    private diffCounter = 0;

    /** Stage a file edit as a diff proposal rather than writing directly. */
    public async proposeEdit(filePath: string, proposedContent: string, description?: string): Promise<ToolResult> {
        const id = `diff-${Date.now()}-${(this.diffCounter++).toString(36)}-${Math.random().toString(36).slice(2)}`;
        let originalContent = '';
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            originalContent = doc.getText();
        } catch { /* new file */ }

        const proposal: DiffProposal = {
            id,
            path: filePath,
            originalContent,
            proposedContent,
            description: description ?? `NEXUS proposed edit to ${filePath}`,
            status: 'pending',
        };
        this.pendingDiffs.set(id, proposal);

        // Mount proposed content as a virtual document
        const virtualPath = `/${id}`;
        this.virtualContents.set(virtualPath, proposedContent);
        const proposedUri = vscode.Uri.parse(`nexus-proposed:${virtualPath}`);
        const originalUri = vscode.Uri.file(filePath);

        const label = `NEXUS ← ${filePath.split('/').pop()}`;
        await vscode.commands.executeCommand('vscode.diff', originalUri, proposedUri, label, {
            preview: true,
        });

        this.onDiffProposed.fire(proposal);
        return { success: true, data: { diffId: id, message: 'Diff proposed — awaiting user approval.' } };
    }

    /** Accept a pending diff proposal and apply the change to disk. */
    public async acceptDiff(diffId: string): Promise<boolean> {
        const proposal = this.pendingDiffs.get(diffId);
        if (!proposal) { return false; }

        const edit = new vscode.WorkspaceEdit();
        const uri = vscode.Uri.file(proposal.path);
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            // Refuse to overwrite edits made after the proposal was created.
            if (doc.getText() !== proposal.originalContent) { return false; }
            // Use the last line/char to avoid going past EOF
            const lastLine = doc.lineCount > 0 ? doc.lineCount - 1 : 0;
            const lastChar = doc.lineCount > 0 ? doc.lineAt(lastLine).text.length : 0;
            edit.replace(uri, new vscode.Range(0, 0, lastLine, lastChar), proposal.proposedContent);
        } catch {
            // New file — only create when nothing was there at proposal time.
            if (proposal.originalContent !== '') { return false; }
            edit.createFile(uri, { contents: Buffer.from(proposal.proposedContent, 'utf-8') });
        }
        const ok = await vscode.workspace.applyEdit(edit);
        if (ok) {
            proposal.status = 'accepted';
            this.pendingDiffs.delete(diffId);
        }
        return ok;
    }

    /** Reject a pending diff proposal. */
    public rejectDiff(diffId: string): boolean {
        const proposal = this.pendingDiffs.get(diffId);
        if (!proposal) { return false; }
        proposal.status = 'rejected';
        this.pendingDiffs.delete(diffId);
        return true;
    }

    public getPendingDiffs(): DiffProposal[] {
        return Array.from(this.pendingDiffs.values());
    }

    private async searchWorkspace(query: string): Promise<ToolResult> {
        const results = await vscode.workspace.findFiles(`**/*`, '**/node_modules/**', 1000);
        const matched: string[] = [];
        const MAX_MATCHES = 200;
        for (const uri of results) {
            if (matched.length >= MAX_MATCHES) { break; } // cap: never scan unboundedly
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                if (doc.getText().includes(query)) {
                    matched.push(uri.fsPath);
                }
            } catch { /* skip */ }
        }
        return { success: true, data: matched };
    }

    /** Run the workspace test suite (`npm test`) in a terminal. */
    private async runTests(): Promise<ToolResult> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return { success: false, error: 'No workspace folder open.' };
        }
        const pkgUri = vscode.Uri.joinPath(folders[0].uri, 'package.json');
        try {
            const raw = await vscode.workspace.fs.readFile(pkgUri);
            const pkg = JSON.parse(Buffer.from(raw).toString('utf-8'));
            if (!pkg?.scripts?.test) {
                return { success: false, error: 'No test script defined in package.json.' };
            }
        } catch {
            return { success: false, error: 'Cannot read package.json test script.' };
        }
        const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('NEXUS Tests');
        terminal.show(true);
        terminal.sendText('npm test');
        return { success: true, data: 'Test suite started in terminal: npm test' };
    }

    private async getGitDiff(): Promise<ToolResult> {
        try {
            const ext = vscode.extensions.getExtension<any>('vscode.git');
            const api = ext?.exports?.getAPI(1);
            const repo = api?.repositories?.[0];
            const diff = repo ? await repo.diff(false) : '';
            return { success: true, data: diff };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }

    private async runInTerminal(command: string): Promise<ToolResult> {
        const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('NEXUS');
        terminal.show(true);
        terminal.sendText(command);
        return { success: true, data: `Command sent to terminal: ${command}` };
    }

    private getDiagnostics(filePath?: string): ToolResult {
        const diagnostics = filePath
            ? vscode.languages.getDiagnostics(vscode.Uri.file(filePath))
            : vscode.languages.getDiagnostics().flatMap(([, d]) => d);

        return {
            success: true,
            data: diagnostics.map((d) => ({
                line: d.range.start.line + 1,
                severity: d.severity,
                message: d.message,
                source: d.source,
            })),
        };
    }

    private async openEditor(filePath: string): Promise<ToolResult> {
        const uri = vscode.Uri.file(filePath);
        await vscode.window.showTextDocument(uri, { preview: false });
        return { success: true, data: `Opened: ${filePath}` };
    }

    public dispose() {
        this.onDiffProposed.dispose();
    }
}
