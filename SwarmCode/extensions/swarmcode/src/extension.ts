import * as vscode from 'vscode';
import { ClusterClient } from './discovery/clusterClient';
import { WorkspaceIngestor } from './orchestrator/workspaceIngestor';
import { SwarmOrchestrator } from './orchestrator/swarmOrchestrator';
import { SwarmWebviewPanel } from './views/swarmWebviewPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('SwarmCode extension is now active!');

    const clusterClient = new ClusterClient();
    const workspaceIngestor = new WorkspaceIngestor();
    const orchestrator = new SwarmOrchestrator(clusterClient, workspaceIngestor);

    clusterClient.startDiscovery();

    context.subscriptions.push(
        vscode.commands.registerCommand('swarmcode.startDiscussion', () => {
            SwarmWebviewPanel.createOrShow(context.extensionUri);
            SwarmWebviewPanel.currentPanel?.updateClusterState(clusterClient.getPeers());
        })
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('swarmcode.clusterView', {
            resolveWebviewView: (webviewView) => {
                webviewView.webview.options = { enableScripts: true };
                webviewView.webview.html = '<html><body><h1>Cluster Nodes</h1><p>Active Laptops: ' + clusterClient.getPeers().length + '</p></body></html>';
            }
        })
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('swarmcode.planView', {
            resolveWebviewView: (webviewView) => {
                webviewView.webview.options = { enableScripts: true };
                webviewView.webview.html = '<html><body><h1>Implementation Plan</h1><p>Awaiting discussion synthesis...</p></body></html>';
            }
        })
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('swarmcode.discussionView', {
            resolveWebviewView: (webviewView) => {
                webviewView.webview.options = { enableScripts: true };
                webviewView.webview.html = '<html><body><h1>Live Discussion</h1><button>Start Debate</button></body></html>';
            }
        })
    );
}

export function deactivate() {}
