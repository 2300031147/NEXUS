import * as vscode from 'vscode';
import { PeerInfo } from '../discovery/clusterClient';

export class SwarmWebviewPanel {
    public static currentPanel: SwarmWebviewPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SwarmWebviewPanel.currentPanel) {
            SwarmWebviewPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'swarmcode.discussionPanel',
            'SwarmCode Discussion',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        SwarmWebviewPanel.currentPanel = new SwarmWebviewPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this.update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        SwarmWebviewPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    public updateClusterState(peers: PeerInfo[]) {
        this._panel.webview.postMessage({ command: 'updatePeers', peers: peers });
    }

    private update() {
        this._panel.webview.html = this.getHtmlForWebview();
    }

    private getHtmlForWebview() {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>SwarmCode Discussion</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-editor-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                    }
                    h1 {
                        color: var(--vscode-editor-foreground);
                    }
                    .peer-list {
                        display: flex;
                        gap: 10px;
                        flex-wrap: wrap;
                    }
                    .peer-card {
                        background: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-editorWidget-border);
                        padding: 10px;
                        border-radius: 5px;
                        min-width: 150px;
                    }
                    .role {
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                    }
                </style>
            </head>
            <body>
                <h1>SwarmCode Cluster Topology</h1>
                <div class="peer-list" id="peerList">
                    Waiting for agents...
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'updatePeers') {
                            const peerList = document.getElementById('peerList');
                            if (message.peers.length === 0) {
                                peerList.innerHTML = 'No agents found.';
                                return;
                            }
                            peerList.innerHTML = '';
                            message.peers.forEach(peer => {
                                const card = document.createElement('div');
                                card.className = 'peer-card';
                                card.innerHTML = \`
                                    <div class="role">\${peer.role.toUpperCase()}</div>
                                    <div>\${peer.model}</div>
                                    <div style="font-size: 0.8em; opacity: 0.7;">\${peer.ip}:\${peer.port}</div>
                                \`;
                                peerList.appendChild(card);
                            });
                        }
                    });
                </script>
            </body>
            </html>`;
    }
}
