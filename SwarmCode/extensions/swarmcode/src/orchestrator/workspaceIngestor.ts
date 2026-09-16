import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export class WorkspaceIngestor {
    private static readonly IGNORED_DIRS = new Set([
        'node_modules', '.git', 'build', 'out', 'dist', '__pycache__',
        '.vscode-test', '.cache', 'coverage', 'target',
    ]);
    private static readonly MAX_DEPTH = 4;
    private static readonly MAX_FILES = 500;
    private static readonly MAX_DIRS = 100;

    public async scanWorkspace(): Promise<string> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return "No workspace folder found.";
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        let summary = `Workspace Root: ${rootPath}\n\n`;

        try {
            const lines: string[] = [];
            const counts = { files: 0, dirs: 0 };
            await this.walk(rootPath, rootPath, 0, lines, counts);
            summary += lines.join('\n');
            if (counts.files >= WorkspaceIngestor.MAX_FILES) {
                summary += `\n…(truncated at ${WorkspaceIngestor.MAX_FILES} files)`;
            }
        } catch (e: any) {
            summary += `Error reading workspace: ${e.message}\n`;
        }

        return summary;
    }

    private async walk(base: string, dir: string, depth: number, lines: string[], counts: { files: number; dirs: number }): Promise<void> {
        if (depth > WorkspaceIngestor.MAX_DEPTH
            || counts.files >= WorkspaceIngestor.MAX_FILES
            || counts.dirs >= WorkspaceIngestor.MAX_DIRS) {
            return;
        }
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            const rel = path.relative(base, full);
            if (entry.isDirectory()) {
                if (WorkspaceIngestor.IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) { continue; }
                counts.dirs++;
                lines.push(`Directory: ${rel}/`);
                await this.walk(base, full, depth + 1, lines, counts);
            } else if (entry.isFile()) {
                counts.files++;
                lines.push(`File: ${rel}`);
            }
            if (counts.files >= WorkspaceIngestor.MAX_FILES || counts.dirs >= WorkspaceIngestor.MAX_DIRS) { return; }
        }
    }
}
