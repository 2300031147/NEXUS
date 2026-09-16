import * as vscode from 'vscode';
import { NexusClient } from '../nexusClient';
import { NodeInfo, ClusterTopology } from '../types';

export class ClusterTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'node' | 'setting' | 'status',
        public readonly data?: any,
        public readonly parentNodeId?: string
    ) {
        super(label, collapsibleState);
        
        if (type === 'node') {
            const isLocal = data.isLocal === true;
            const isOnline = data.last_seen > (Date.now() / 1000) - 30;
            this.iconPath = new vscode.ThemeIcon('server', isOnline ? new vscode.ThemeColor('testing.iconPassed') : new vscode.ThemeColor('testing.iconFailed'));
            this.description = (isLocal ? '★ local · ' : '') + (data.model_name || 'Unknown model');
            this.tooltip = `Hostname: ${data.hostname}\nRole: ${data.role_description}\nRAM: ${data.ram_gb} GB`;
            
            // Add command to select node
            this.command = {
                command: 'nexus.selectNode',
                title: 'Select Node',
                arguments: [data.node_id]
            };
        } else if (type === 'setting') {
            this.iconPath = new vscode.ThemeIcon('settings-gear');
            this.contextValue = 'settingItem'; // enables view/item/context menus
            this.tooltip = `Right-click or click edit icon to change`;
        } else if (type === 'status') {
            this.iconPath = new vscode.ThemeIcon('pulse');
        }
    }
}

export class ClusterTreeProvider implements vscode.TreeDataProvider<ClusterTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ClusterTreeItem | undefined | null | void> = new vscode.EventEmitter<ClusterTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ClusterTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _poll?: NodeJS.Timeout;

    constructor(private nexusClient: NexusClient) {
        // Auto-refresh every 5 seconds
        this._poll = setInterval(() => {
            this.refresh();
        }, 5000);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ClusterTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ClusterTreeItem): Promise<ClusterTreeItem[]> {
        if (!element) {
            // Root elements: The nodes
            try {
                const topology = await this.nexusClient.getTopology();
                if (!topology || topology.total_nodes === 0) {
                    return [new ClusterTreeItem('No nodes found. Cluster offline.', vscode.TreeItemCollapsibleState.None, 'status')];
                }

                const localId = (topology as ClusterTopology & { local_node?: NodeInfo }).local_node?.node_id;
                const items: ClusterTreeItem[] = [];
                for (const node of topology.nodes) {
                    const isLocal = node.node_id === localId;
                    const label = (isLocal ? '★ ' : '') + (node.role_description || node.hostname);
                    items.push(new ClusterTreeItem(
                        label,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'node',
                        { ...node, isLocal },
                        node.node_id
                    ));
                }
                return items;
            } catch (err: any) {
                return [new ClusterTreeItem('Error connecting to NEXUS host.', vscode.TreeItemCollapsibleState.None, 'status')];
            }
        } else if (element.type === 'node' && element.data) {
            // Child elements: Node settings
            const node = element.data;
            return [
                new ClusterTreeItem(`Role: ${node.role_description}`, vscode.TreeItemCollapsibleState.None, 'setting', { key: 'role_description', value: node.role_description, nodeId: node.node_id }, element.parentNodeId),
                new ClusterTreeItem(`Model: ${node.model_name}`, vscode.TreeItemCollapsibleState.None, 'setting', { key: 'model_name', value: node.model_name, nodeId: node.node_id }, element.parentNodeId),
                new ClusterTreeItem(`VRAM limit: ${node.vram_gb} GB`, vscode.TreeItemCollapsibleState.None, 'setting', { key: 'vram_gb', value: node.vram_gb, nodeId: node.node_id }, element.parentNodeId),
                new ClusterTreeItem(`RAM limit: ${node.ram_gb} GB`, vscode.TreeItemCollapsibleState.None, 'setting', { key: 'ram_gb', value: node.ram_gb, nodeId: node.node_id }, element.parentNodeId)
            ];
        }
        
        return [];
    }

    dispose() {
        if (this._poll) clearInterval(this._poll);
    }
}
