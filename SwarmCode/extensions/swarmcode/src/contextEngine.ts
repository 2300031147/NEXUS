import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceContext, DiagnosticEntry, FileEntry } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Context Engine — automatically builds structured workspace context
// for sending to the NEXUS cluster.
// ─────────────────────────────────────────────────────────────────────────────

const WORDS_PER_TOKEN = 0.75; // rough approximation

export class ContextEngine {
    constructor(private readonly gitBridge?: { getDiff(): Promise<string>; getBranch(): Promise<string>; getModifiedFiles(): Promise<string[]> }) {}

    /** Build a full WorkspaceContext snapshot from the current IDE state. */
    public async buildContext(): Promise<WorkspaceContext> {
        const editor = vscode.window.activeTextEditor;

        const activeFile = editor?.document.uri.fsPath ?? '';
        const selection = editor ? editor.document.getText(editor.selection) : '';
        const openFiles = this.getOpenFiles();
        const diagnostics = this.collectDiagnostics(editor?.document.uri);
        const relatedFiles = editor ? await this.getRelatedFiles(editor.document.uri) : [];
        const projectContext = this.buildProjectSummary();

        let gitDiff = '';
        let gitBranch = '';
        let modifiedFiles: string[] = [];
        if (this.gitBridge) {
            try {
                [gitDiff, gitBranch, modifiedFiles] = await Promise.all([
                    this.gitBridge.getDiff(),
                    this.gitBridge.getBranch(),
                    this.gitBridge.getModifiedFiles(),
                ]);
            } catch { /* git not available */ }
        }

        const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const sent = this.estimateTokens(selection + gitDiff + projectContext);
        const project = this.estimateTokens(projectContext);
        const selected = this.estimateTokens(selection);

        return {
            workspace,
            activeFile,
            selection,
            openFiles,
            gitDiff,
            gitBranch,
            modifiedFiles,
            diagnostics,
            terminal: [],
            projectContext,
            relatedFiles,
            tokenCounts: { project, selected, sent },
        };
    }

    /** Collect diagnostics for the given URI (or all files if undefined). */
    public collectDiagnostics(uri?: vscode.Uri): DiagnosticEntry[] {
        const results: DiagnosticEntry[] = [];
        const all = uri
            ? [[uri, vscode.languages.getDiagnostics(uri)] as [vscode.Uri, vscode.Diagnostic[]]]
            : vscode.languages.getDiagnostics();

        for (const [fileUri, diags] of all) {
            for (const d of diags) {
                results.push({
                    file: fileUri.fsPath,
                    line: d.range.start.line + 1,
                    column: d.range.start.character + 1,
                    severity: this.mapSeverity(d.severity),
                    message: d.message,
                    source: d.source,
                });
            }
        }
        return results;
    }

    /** Find files related to the active file via imports and workspace symbols. */
    public async getRelatedFiles(uri: vscode.Uri): Promise<string[]> {
        const related: Set<string> = new Set();

        // Method 1: scan import statements in the active document
        const doc = await vscode.workspace.openTextDocument(uri);
        const text = doc.getText();
        const importRegex = /(?:import|require|from)\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(text)) !== null) {
            const importPath = match[1];
            if (!importPath.startsWith('.')) { continue; }
            const dir = path.dirname(uri.fsPath);
            const abs = path.resolve(dir, importPath);
            const candidatePaths = [abs, ...['.ts', '.tsx', '.js', '.jsx', '.py', '.cpp', '.h'].map(ext => abs + ext)];
            let found = false;
            for (const candidate of candidatePaths) {
                try {
                    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
                    if (stat.type === vscode.FileType.File) {
                        related.add(candidate);
                        found = true;
                        break;
                    } else if (stat.type === vscode.FileType.Directory) {
                        for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.py']) {
                            const idx = path.join(candidate, 'index' + ext);
                            try {
                                const idxStat = await vscode.workspace.fs.stat(vscode.Uri.file(idx));
                                if (idxStat.type === vscode.FileType.File) {
                                    related.add(idx);
                                    found = true;
                                    break;
                                }
                            } catch { /* skip */ }
                        }
                        if (found) break;
                    }
                } catch { /* not found */ }
            }
        }

        // Method 2: workspace symbol search using the filename stem
        const stem = path.basename(uri.fsPath, path.extname(uri.fsPath));
        try {
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider', stem
            );
            if (symbols) {
                for (const sym of symbols.slice(0, 5)) {
                    const symPath = sym.location.uri.fsPath;
                    if (symPath !== uri.fsPath) { related.add(symPath); }
                }
            }
        } catch { /* not available */ }

        return Array.from(related).slice(0, 10);
    }

    /** Convert open editor tabs to file paths. */
    private getOpenFiles(): string[] {
        const paths: string[] = [];
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input instanceof vscode.TabInputText) {
                    paths.push(tab.input.uri.fsPath);
                }
            }
        }
        return [...new Set(paths)];
    }

    /** Build a brief project context string from workspace structure. */
    private buildProjectSummary(): string {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) { return ''; }
        const names = folders.map((f) => f.name).join(', ');
        const editor = vscode.window.activeTextEditor;
        const lang = editor?.document.languageId ?? 'unknown';
        return `Workspace: ${names}. Active language: ${lang}.`;
    }

    /** Build FileEntry list from the open files (content included). */
    public async buildFileEntries(filePaths: string[]): Promise<FileEntry[]> {
        const entries: FileEntry[] = [];
        for (const fp of filePaths) {
            try {
                const uri = vscode.Uri.file(fp);
                const doc = await vscode.workspace.openTextDocument(uri);
                entries.push({
                    path: fp,
                    content: doc.getText(),
                    language: doc.languageId,
                    size: doc.getText().length,
                });
            } catch { /* skip unreadable files */ }
        }
        return entries;
    }

    private mapSeverity(s: vscode.DiagnosticSeverity): DiagnosticEntry['severity'] {
        switch (s) {
            case vscode.DiagnosticSeverity.Error: return 'error';
            case vscode.DiagnosticSeverity.Warning: return 'warning';
            case vscode.DiagnosticSeverity.Information: return 'info';
            case vscode.DiagnosticSeverity.Hint: return 'hint';
        }
    }

    private estimateTokens(text: string): number {
        const words = text.trim().split(/\s+/).filter(Boolean).length;
        return Math.ceil(words / WORDS_PER_TOKEN);
    }
}
