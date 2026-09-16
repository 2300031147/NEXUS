/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { ISwarmClusterService } from '../common/swarmClusterService.js';
import { SwarmNode, SwarmTopology, describeNode, formatScopeSummary, nodeReachability } from '../common/swarmCluster.js';

export const SWARM_CLUSTER_VIEW_ID = 'workbench.view.swarm.cluster';

const POLL_INTERVAL_MS = 15000;

export class SwarmClusterViewPane extends ViewPane {

	private bodyContainer: HTMLElement | undefined;

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
		@IHoverService hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@ISwarmClusterService private readonly swarmService: ISwarmClusterService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('swarm-view');

		const toolbar = dom.append(container, dom.$('.swarm-toolbar'));
		this.addCommandButton(toolbar, localize('swarm.refresh', "Refresh"), 'swarm.refreshTopology');
		this.addCommandButton(toolbar, localize('swarm.setScope', "Set Scope..."), 'swarm.setScope');
		this.addCommandButton(toolbar, localize('swarm.shareActiveFile', "Share Active File"), 'swarm.shareActiveFile');
		this.addCommandButton(toolbar, localize('swarm.startDiscussion', "Start Discussion..."), 'swarm.startDiscussion');

		this.bodyContainer = dom.append(container, dom.$('.swarm-body'));

		this._register(this.swarmService.onDidChangeTopology(() => this.render()));
		this.render();
		void this.swarmService.refresh();

		const interval = setInterval(() => { void this.swarmService.refresh(); }, POLL_INTERVAL_MS);
		this._register(toDisposable(() => clearInterval(interval)));
	}

	private addCommandButton(parent: HTMLElement, label: string, commandId: string): void {
		const button = this._register(new Button(parent, {
			title: label,
			...defaultButtonStyles
		}));
		button.label = label;
		this._register(button.onDidClick(() => {
			void this.commandService.executeCommand(commandId);
		}));
	}

	private render(): void {
		if (!this.bodyContainer) {
			return;
		}
		dom.clearNode(this.bodyContainer);
		const topology = this.swarmService.topology;
		this.renderStatus(this.bodyContainer, topology);
		if (topology) {
			this.renderNodes(this.bodyContainer, topology);
			this.renderScope(this.bodyContainer, topology);
			this.renderPlan(this.bodyContainer);
		}
	}

	private renderStatus(parent: HTMLElement, topology: SwarmTopology | undefined): void {
		const line = dom.append(parent, dom.$('.swarm-status'));
		if (topology) {
			const count = topology.nodes.length;
			dom.append(line, dom.$(`span${ThemeIcon.asCSSSelector(Codicon.check)}`));
			line.append(localize('swarm.status.connected', "Connected: {0} node(s) in {1}", count, topology.cluster_id));
		} else {
			dom.append(line, dom.$(`span${ThemeIcon.asCSSSelector(Codicon.error)}`));
			const reason = this.swarmService.lastError ?? localize('swarm.status.notConnected', "Not connected to a cluster");
			const error = dom.append(line, dom.$('span.swarm-error'));
			error.textContent = reason;
		}
	}

	private renderNodes(parent: HTMLElement, topology: SwarmTopology): void {
		dom.append(parent, dom.$('.swarm-section-title')).textContent =
			localize('swarm.nodes.title', "Cluster Nodes");
		for (const node of topology.nodes) {
			const row = dom.append(parent, dom.$('.swarm-node'));
			row.tabIndex = 0;
			row.setAttribute('role', 'button');
			dom.append(row, dom.$(`span.swarm-node-icon${ThemeIcon.asCSSSelector(Codicon.server)}`));
			const label = dom.append(row, dom.$('span.swarm-node-label'));
			label.textContent = describeNode(node);
			const reachability = dom.append(row, dom.$('span.swarm-node-reachability'));
			reachability.textContent = nodeReachability(node);
			const details = dom.append(parent, dom.$('.swarm-node-details.hide'));
			this.renderNodeDetails(details, node);
			const toggle = () => details.classList.toggle('hide');
			row.addEventListener('click', toggle);
			row.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggle();
				}
			});
		}
	}

	private renderNodeDetails(parent: HTMLElement, node: SwarmNode): void {
		const lines: string[] = [
			localize('swarm.node.api', "API: {0}", node.api_url ?? `http://${node.api_host}:${node.api_port}`),
		];
		if (node.backend?.model_path) {
			lines.push(localize('swarm.node.modelPath', "Model path: {0}", node.backend.model_path));
		}
		if (node.memory) {
			lines.push(localize('swarm.node.memory', "Memory: {0} GB VRAM, {1} GB RAM, {2} GB SSD swap, {3} ctx",
				node.memory.vram_gb, node.memory.ram_gb, node.memory.ssd_swap_gb, node.memory.max_context));
		}
		for (const text of lines) {
			dom.append(parent, dom.$('div')).textContent = text;
		}
	}

	private renderScope(parent: HTMLElement, topology: SwarmTopology): void {
		dom.append(parent, dom.$('.swarm-section-title')).textContent =
			localize('swarm.scope.title', "Shared With Models");
		const line = dom.append(parent, dom.$('.swarm-scope'));
		dom.append(line, dom.$(`span${ThemeIcon.asCSSSelector(Codicon.folder)}`));
		line.append(formatScopeSummary(topology.scope));
	}

	private renderPlan(parent: HTMLElement): void {
		dom.append(parent, dom.$('.swarm-section-title')).textContent =
			localize('swarm.plan.title', "Last Team Discussion");
		const plan = this.swarmService.lastPlan;
		const line = dom.append(parent, dom.$('.swarm-plan'));
		if (!plan) {
			line.textContent = localize('swarm.plan.none', "No discussion yet.");
			return;
		}
		line.textContent = localize('swarm.plan.summary', "{0}: {1} (score {2})",
			plan.status, plan.summary, plan.consensus_score);
	}
}
