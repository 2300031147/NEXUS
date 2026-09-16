import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// Git Bridge — interfaces with the built-in vscode.git extension API
// ─────────────────────────────────────────────────────────────────────────────

export class GitBridge {
    private git: ReturnType<typeof this.getGitExtension> | undefined;

    private getGitExtension() {
        const ext = vscode.extensions.getExtension<{
            getAPI(version: 1): {
                repositories: Array<{
                    diff(cached: boolean): Promise<string>;
                    state: {
                        HEAD?: { name?: string };
                        workingTreeChanges: Array<{ uri: vscode.Uri }>;
                        indexChanges: Array<{ uri: vscode.Uri }>;
                    };
                }>;
            };
        }>('vscode.git');
        return ext?.exports?.getAPI(1);
    }

    private getRepo() {
        if (!this.git) {
            this.git = this.getGitExtension();
        }
        return this.git?.repositories[0];
    }

    /** Returns the full working-tree diff. */
    public async getDiff(): Promise<string> {
        try {
            const repo = this.getRepo();
            return repo ? await repo.diff(false) : '';
        } catch {
            return '';
        }
    }

    /** Returns the staged diff. */
    public async getStagedChanges(): Promise<string> {
        try {
            const repo = this.getRepo();
            return repo ? await repo.diff(true) : '';
        } catch {
            return '';
        }
    }

    /** Returns the current branch name. */
    public async getBranch(): Promise<string> {
        try {
            const repo = this.getRepo();
            return repo?.state.HEAD?.name ?? '';
        } catch {
            return '';
        }
    }

    /** Returns absolute paths of all modified (working-tree) files. */
    public async getModifiedFiles(): Promise<string[]> {
        try {
            const repo = this.getRepo();
            if (!repo) { return []; }
            return [
                ...repo.state.workingTreeChanges.map((c) => c.uri.fsPath),
                ...repo.state.indexChanges.map((c) => c.uri.fsPath),
            ];
        } catch {
            return [];
        }
    }
}
