import * as vscode from 'vscode';
import { ContextEngine } from '../contextEngine';
import { NexusClient } from '../nexusClient';

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

    constructor(private contextEng: ContextEngine, private nexusClient: NexusClient) {
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
                const items: ContextTreeItem[] = [];
                
                if (this._selectedNodeId) {
                    items.push(new ContextTreeItem(`Filtered for Node: ${this._selectedNodeId}`, vscode.TreeItemCollapsibleState.None, 'status'));
                    
                    try {
                        const nodeCtx = await this.nexusClient.getNodeContext(this._selectedNodeId);
                        if (nodeCtx && nodeCtx.files && nodeCtx.files.length > 0) {
                            for (const f of nodeCtx.files) {
                                items.push(new ContextTreeItem(
                                    f.path.split('/').pop() || f.path,
                                    vscode.TreeItemCollapsibleState.None,
                                    'file',
                                    f.path,
                                    `${f.size || 0} bytes`
                                ));
                            }
                        } else {
                            items.push(new ContextTreeItem('No context ingested in this node.', vscode.TreeItemCollapsibleState.None, 'status'));
                        }
                    } catch (e: any) {
                        items.push(new ContextTreeItem(`Error fetching node context: ${e.message}`, vscode.TreeItemCollapsibleState.None, 'status'));
                    }
                } else {
                    items.push(new ContextTreeItem(`Global Workspace Context`, vscode.TreeItemCollapsibleState.None, 'status'));
                    
                    const ctx = await this.contextEng.buildContext();
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
