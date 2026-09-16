import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export class WorkspaceIngestor {
    public async scanWorkspace(): Promise<string> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return "No workspace folder found.";
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        let summary = `Workspace Root: ${rootPath}\n\n`;

        // Simplified scanner that only grabs top level files/directories
        try {
            const files = await fs.readdir(rootPath, { withFileTypes: true });
            for (const file of files) {
                if (file.isDirectory()) {
                    summary += `Directory: ${file.name}/\n`;
                } else {
                    summary += `File: ${file.name}\n`;
                }
            }
        } catch (e: any) {
            summary += `Error reading workspace: ${e.message}\n`;
        }

        return summary;
    }
}
