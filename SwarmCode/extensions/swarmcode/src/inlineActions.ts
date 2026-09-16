import * as vscode from 'vscode';
import { NexusClient } from './nexusClient';
import { ContextEngine } from './contextEngine';
import { NexusTask } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Inline Actions — CodeLens above functions and right-click context menu
// ─────────────────────────────────────────────────────────────────────────────

export class NexusCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    /** Supported languages for CodeLens. */
    private static readonly LANGUAGES = [
        { language: 'typescript' }, { language: 'javascript' },
        { language: 'python' },     { language: 'java' },
        { language: 'cpp' },        { language: 'csharp' },
        { language: 'go' },         { language: 'rust' },
    ];

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new NexusCodeLensProvider();
        return vscode.languages.registerCodeLensProvider(
            NexusCodeLensProvider.LANGUAGES,
            provider
        );
    }

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];

        // Detect function/method/class declarations
        const funcRegex = /^(?:export\s+)?(?:async\s+)?(?:function|class|def|func|fn|pub fn|public|private|protected|static)\s+(\w+)/gm;
        const text = document.getText();
        let match: RegExpExecArray | null;

        while ((match = funcRegex.exec(text)) !== null) {
            const pos = document.positionAt(match.index);
            const range = new vscode.Range(pos, pos);

            lenses.push(new vscode.CodeLens(range, {
                title: '$(hubot) NEXUS: Explain | Fix | Refactor | Ask Team',
                command: 'nexus.showInlineMenu',
                arguments: [document.uri, range, match[1]],
            }));
        }

        return lenses;
    }
}

/** Show a quick pick menu for inline NEXUS actions on a function. */
export async function showInlineMenu(
    uri: vscode.Uri,
    range: vscode.Range,
    symbolName: string,
    client: NexusClient,
    contextEngine: ContextEngine,
): Promise<void> {
    const items = [
        { label: '$(info) Explain', description: 'Explain this symbol', action: 'explain' },
        { label: '$(wrench) Fix', description: 'Fix issues in this symbol', action: 'fix' },
        { label: '$(edit) Refactor', description: 'Refactor for clarity', action: 'refactor' },
        { label: '$(beaker) Generate Tests', description: 'Write unit tests', action: 'tests' },
        { label: '$(shield) Security Review', description: 'Check for vulnerabilities', action: 'security' },
        { label: '$(organization) Ask NEXUS Team', description: 'Run multi-model consensus', action: 'consensus' },
    ];

    const choice = await vscode.window.showQuickPick(items, {
        placeHolder: `NEXUS actions for: ${symbolName}`,
        title: 'NEXUS Inline Actions',
    });

    if (!choice) { return; }

    const doc = await vscode.workspace.openTextDocument(uri);
    const selection = doc.getText(); // full file for context

    const promptMap: Record<string, string> = {
        explain: `Explain the function/class "${symbolName}" in detail.`,
        fix: `Find and fix any bugs or issues in "${symbolName}".`,
        refactor: `Refactor "${symbolName}" for better clarity, performance, and maintainability.`,
        tests: `Generate comprehensive unit tests for "${symbolName}".`,
        security: `Perform a security review of "${symbolName}". Identify any vulnerabilities.`,
        consensus: `Review "${symbolName}" from multiple expert perspectives (architect, coder, security).`,
    };

    const goal = `File: ${uri.fsPath}\n\nCode:\n\`\`\`\n${selection.slice(0, 3000)}\n\`\`\`\n\n${promptMap[choice.action]}`;

    // Route to chat with context
    await vscode.commands.executeCommand('nexus.sendToChat', goal, choice.action === 'consensus');
}
