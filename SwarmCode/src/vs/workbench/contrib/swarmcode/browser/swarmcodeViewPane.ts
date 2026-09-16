/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SwarmCode Contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISwarmCodeService, ISwarmNode, ISwarmPlan } from '../common/swarmcode.js';

export class SwarmCodeViewPane extends ViewPane {
	static readonly ID = 'workbench.view.swarmcode';
	static readonly TITLE = 'SwarmCode Cluster';

	private _rootContainer!: HTMLElement;
	private _clusterCardsContainer!: HTMLElement;
	private _deliberationContainer!: HTMLElement;
	private _planContainer!: HTMLElement;
	private _goalInput!: HTMLTextAreaElement;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ISwarmCodeService private readonly swarmCodeService: ISwarmCodeService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService);

		this._register(this.swarmCodeService.onDidUpdateCluster(() => this._renderClusterState()));
		this._register(this.swarmCodeService.onDidUpdateTranscript(() => this._renderDeliberationState()));
		this._register(this.swarmCodeService.onDidGeneratePlan((plan) => this._renderPlanState(plan)));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._rootContainer = append(container, $('.swarmcode-container'));
		this._rootContainer.style.padding = '12px';
		this._rootContainer.style.display = 'flex';
		this._rootContainer.style.flexDirection = 'column';
		this._rootContainer.style.gap = '14px';
		this._rootContainer.style.fontFamily = 'var(--vscode-font-family)';
		this._rootContainer.style.fontSize = '12px';

		// 1. Cluster Status & Controls Header
		const headerSection = append(this._rootContainer, $('.swarmcode-section'));
		const headerTitle = append(headerSection, $('h3'));
		headerTitle.textContent = '⚡ Heterogeneous Laptop Swarm';
		headerTitle.style.margin = '0 0 8px 0';
		headerTitle.style.fontSize = '13px';
		headerTitle.style.color = 'var(--vscode-foreground)';

		const actionBtnContainer = append(headerSection, $('.action-btn-container'));
		actionBtnContainer.style.display = 'flex';
		actionBtnContainer.style.gap = '8px';
		actionBtnContainer.style.marginBottom = '8px';

		const refreshBtn = new Button(actionBtnContainer, defaultButtonStyles);
		refreshBtn.label = 'Scan Nodes';
		this._register(refreshBtn.onDidClick(() => this.swarmCodeService.refreshPeers()));

		const ingestBtn = new Button(actionBtnContainer, defaultButtonStyles);
		ingestBtn.label = 'Ingest Project';
		this._register(ingestBtn.onDidClick(() => this.swarmCodeService.ingestActiveWorkspace()));

		// 2. Discovered Nodes List
		this._clusterCardsContainer = append(this._rootContainer, $('.cluster-cards'));
		this._clusterCardsContainer.style.display = 'flex';
		this._clusterCardsContainer.style.flexDirection = 'column';
		this._clusterCardsContainer.style.gap = '8px';

		// 3. Goal & Multi-Model Deliberation Input
		const inputSection = append(this._rootContainer, $('.goal-section'));
		inputSection.style.display = 'flex';
		inputSection.style.flexDirection = 'column';
		inputSection.style.gap = '6px';

		const goalLabel = append(inputSection, $('label'));
		goalLabel.textContent = '🎯 Multi-Model Team Objective:';
		goalLabel.style.fontWeight = 'bold';

		this._goalInput = append(inputSection, $('textarea')) as HTMLTextAreaElement;
		this._goalInput.placeholder = 'e.g. Read workspace, architect solution, review code, and verify 0 errors...';
		this._goalInput.rows = 3;
		this._goalInput.style.backgroundColor = 'var(--vscode-input-background)';
		this._goalInput.style.color = 'var(--vscode-input-foreground)';
		this._goalInput.style.border = '1px solid var(--vscode-input-border)';
		this._goalInput.style.borderRadius = '4px';
		this._goalInput.style.padding = '6px';
		this._goalInput.style.resize = 'vertical';

		const deliberateBtn = new Button(inputSection, defaultButtonStyles);
		deliberateBtn.label = '🚀 Start Multi-Model Deliberation & Verification';
		this._register(deliberateBtn.onDidClick(() => {
			const goal = this._goalInput.value.trim() || 'Analyze repository and develop zero-defect plan';
			this.swarmCodeService.startCollaborativeDiscussion(goal);
		}));

		// 4. Live Deliberation Transcript
		const deliberationHeader = append(this._rootContainer, $('h4'));
		deliberationHeader.textContent = '💬 Live Multi-Model Team Deliberation & Review';
		deliberationHeader.style.margin = '4px 0 0 0';

		this._deliberationContainer = append(this._rootContainer, $('.deliberation-stream'));
		this._deliberationContainer.style.maxHeight = '200px';
		this._deliberationContainer.style.overflowY = 'auto';
		this._deliberationContainer.style.display = 'flex';
		this._deliberationContainer.style.flexDirection = 'column';
		this._deliberationContainer.style.gap = '6px';
		this._deliberationContainer.style.padding = '6px';
		this._deliberationContainer.style.border = '1px solid var(--vscode-widget-border)';
		this._deliberationContainer.style.borderRadius = '4px';
		this._deliberationContainer.style.backgroundColor = 'var(--vscode-editor-background)';

		// 5. Finalized Plan Container
		this._planContainer = append(this._rootContainer, $('.plan-container'));

		this._renderClusterState();
	}

	private _renderClusterState(): void {
		if (!this._clusterCardsContainer) return;
		clearNode(this._clusterCardsContainer);

		const nodes = this.swarmCodeService.getDiscoveredNodes();
		const status = this.swarmCodeService.getClusterStatus();

		const summaryBadge = append(this._clusterCardsContainer, $('.summary-badge'));
		summaryBadge.style.fontSize = '11px';
		summaryBadge.style.color = 'var(--vscode-descriptionForeground)';
		summaryBadge.style.marginBottom = '4px';
		summaryBadge.textContent = `🟢 ${status.active_nodes} Active Laptops | ${status.total_ram_gb}GB RAM + ${status.total_ssd_swap_gb}GB SSD Tiered Memory`;

		for (const node of nodes) {
			const card = append(this._clusterCardsContainer, $('.node-card'));
			card.style.padding = '8px';
			card.style.borderRadius = '6px';
			card.style.border = '1px solid var(--vscode-editorWidget-border)';
			card.style.backgroundColor = 'var(--vscode-editorWidget-background)';
			card.style.display = 'flex';
			card.style.flexDirection = 'column';
			card.style.gap = '3px';

			const topRow = append(card, $('.node-top-row'));
			topRow.style.display = 'flex';
			topRow.style.justifyContent = 'space-between';

			const name = append(topRow, $('strong'));
			name.textContent = `💻 ${node.hostname}`;

			const badge = append(topRow, $('span'));
			badge.textContent = `${node.api_host}:${node.api_port}`;
			badge.style.fontSize = '10px';
			badge.style.opacity = '0.8';

			const modelRow = append(card, $('.node-model-row'));
			modelRow.textContent = `🧠 Model: ${node.model_name}`;
			modelRow.style.color = 'var(--vscode-textLink-foreground)';

			const memRow = append(card, $('.node-mem-row'));
			memRow.style.fontSize = '10px';
			memRow.style.color = 'var(--vscode-descriptionForeground)';
			memRow.textContent = `💾 ${node.memory?.ram_gb || 0}GB RAM | ${node.memory?.ssd_swap_gb || 0}GB SSD Swap (${node.memory?.max_context || 32768} ctx)`;
		}
	}

	private _renderDeliberationState(): void {
		if (!this._deliberationContainer) return;
		clearNode(this._deliberationContainer);

		const transcript = this.swarmCodeService.getTranscript();
		for (const entry of transcript) {
			const item = append(this._deliberationContainer, $('.transcript-item'));
			item.style.padding = '4px 6px';
			item.style.borderRadius = '4px';
			item.style.fontSize = '11px';

			if (entry.type === 'proposal') {
				item.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
				item.textContent = `[Round ${entry.round}] 💡 ${entry.hostname} (${entry.model_name}): ${entry.content.slice(0, 160)}...`;
			} else if (entry.type === 'verification_pass') {
				if (entry.approved) {
					item.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
					item.textContent = `[Round ${entry.round}] 🛡️ ${entry.hostname} (Reviewer): Verified zero errors. ${entry.content.slice(0, 140)}...`;
				} else {
					item.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'; // Red for failure
					const issuesList = entry.issues?.length ? entry.issues.join(', ') : 'Unknown issues';
					item.textContent = `[Round ${entry.round}] ⚠️ ${entry.hostname} (Reviewer): Found issues: ${issuesList}`;
				}
			}
		}
	}

	private _renderPlanState(plan: ISwarmPlan): void {
		if (!this._planContainer) return;
		clearNode(this._planContainer);

		const planBox = append(this._planContainer, $('.plan-box'));
		planBox.style.marginTop = '10px';
		planBox.style.padding = '10px';
		planBox.style.borderRadius = '6px';
		planBox.style.border = '1px solid rgba(34, 197, 94, 0.4)';
		planBox.style.backgroundColor = 'rgba(34, 197, 94, 0.05)';

		const title = append(planBox, $('strong'));
		title.textContent = `🏆 ${plan.title}`;
		title.style.display = 'block';
		title.style.marginBottom = '4px';

		const verdict = append(planBox, $('div'));
		verdict.textContent = `✨ Unanimous Consensus Score: ${(plan.consensus_score * 100).toFixed(0)}% (Zero Defects)`;
		verdict.style.fontSize = '11px';
		verdict.style.color = '#22c55e';
		verdict.style.marginBottom = '6px';

		const tasksList = append(planBox, $('ul'));
		tasksList.style.paddingLeft = '18px';
		tasksList.style.margin = '4px 0 8px 0';
		tasksList.style.fontSize = '11px';

		for (const task of plan.tasks) {
			const li = append(tasksList, $('li'));
			li.textContent = `${task.title} [Assigned: ${task.assigned_node}]`;
		}

		const executeBtn = new Button(planBox, defaultButtonStyles);
		executeBtn.label = '⚡ Apply Swarm Code Changes to Workspace';
		this._register(executeBtn.onDidClick(() => this.swarmCodeService.executePlan('plan-active')));
	}
}
