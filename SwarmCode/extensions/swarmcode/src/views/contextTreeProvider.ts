import * as vscode from 'vscode';
import { ContextEngine } from '../contextEngine';

export class ContextTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'file' | 'status',
        public readonly path?: string,
        public readonly size?: string
    ) {
        super(label, collapsibleState);
        
        if (type === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
            this.description = size;
            this.tooltip = path;
            
            // Open file command
            if (path) {
                this.command = {
                    command: 'vscode.open',
                    title: 'Open File',
                    arguments: [vscode.Uri.file(path)]
                };
            }
        } else if (type === 'status') {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}

export class ContextTreeProvider implements vscode.TreeDataProvider<ContextTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ContextTreeItem | undefined | null | void> = new vscode.EventEmitter<ContextTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ContextTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _selectedNodeId?: string;

    constructor(private contextEng: ContextEngine) {
        // We can listen to contextEng events if it has any, otherwise manual refresh
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setSelectedNode(nodeId?: string): void {
        this._selectedNodeId = nodeId;
        this.refresh();
    }

    getTreeItem(element: ContextTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ContextTreeItem): Promise<ContextTreeItem[]> {
        if (!element) {
            try {
                // If a node is selected, we could theoretically fetch only its context.
                // For now, we show the global IDE context or node-filtered context.
                const ctx = await this.contextEng.buildContext();
                
                const items: ContextTreeItem[] = [];
                
                if (this._selectedNodeId) {
                    items.push(new ContextTreeItem(`Filtered for Node: ${this._selectedNodeId}`, vscode.TreeItemCollapsibleState.None, 'status'));
                } else {
                    items.push(new ContextTreeItem(`Global Workspace Context`, vscode.TreeItemCollapsibleState.None, 'status'));
                }

                if (ctx.activeFile) {
                    items.push(new ContextTreeItem(
                        ctx.activeFile.split('/').pop() || ctx.activeFile,
                        vscode.TreeItemCollapsibleState.None,
                        'file',
                        ctx.activeFile,
                        'Active'
                    ));
                }

                for (const f of ctx.modifiedFiles) {
                    if (f !== ctx.activeFile) {
                        items.push(new ContextTreeItem(
                            f.split('/').pop() || f,
                            vscode.TreeItemCollapsibleState.None,
                            'file',
                            f,
                            'Modified'
                        ));
                    }
                }

                if (items.length === 1) { // Only status
                    items.push(new ContextTreeItem('No context loaded', vscode.TreeItemCollapsibleState.None, 'status'));
                }

                return items;
            } catch (err: any) {
                return [new ContextTreeItem('Error building context.', vscode.TreeItemCollapsibleState.None, 'status')];
            }
        }
        
        return [];
    }
}
