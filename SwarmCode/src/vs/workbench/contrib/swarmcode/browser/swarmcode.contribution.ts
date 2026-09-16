/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SwarmCode Contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import {
	ViewContainerLocation,
	IViewContainersRegistry,
	Extensions as ViewContainerExtensions,
	IViewsRegistry,
	IViewDescriptor
} from '../../../common/views.js';
import { ISwarmCodeService } from '../common/swarmcode.js';
import { SwarmCodeService } from './swarmcodeService.js';
import { SwarmCodeViewPane } from './swarmcodeViewPane.js';

// 1. Register SwarmCode Service Singleton
registerSingleton(ISwarmCodeService, SwarmCodeService, InstantiationType.Eager);

// 2. Register SwarmCode Activity Bar Icon & View Container
const swarmcodeIcon = registerIcon('swarmcode-view-icon', Codicon.organization, localize('swarmcodeViewIcon', 'View icon of the SwarmCode multi-model cluster.'));

export const SWARMCODE_VIEW_CONTAINER_ID = 'workbench.view.swarmcode';
const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: SWARMCODE_VIEW_CONTAINER_ID,
	title: { value: localize('swarmcode', "SwarmCode"), original: 'SwarmCode' },
	icon: swarmcodeIcon,
	ctorDescriptor: new SyncDescriptor(SwarmCodeViewPane),
	storageId: 'workbench.swarmcode.views.state',
	hideIfEmpty: false,
	order: 1,
}, ViewContainerLocation.Sidebar);

// 3. Register View Descriptor
const viewDescriptor: IViewDescriptor = {
	id: SwarmCodeViewPane.ID,
	name: { value: localize('swarmcodeCluster', "Swarm Cluster & Multi-Model Team"), original: 'Swarm Cluster & Multi-Model Team' },
	ctorDescriptor: new SyncDescriptor(SwarmCodeViewPane),
	canToggleVisibility: true,
	canMoveView: true,
	collapsed: false,
	order: 100,
};

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([viewDescriptor], viewContainer);

// 4. Register SwarmCode Global Actions & Commands
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'swarmcode.refreshNodes',
			title: { value: localize('swarmcode.refreshNodes', "SwarmCode: Scan Local Cluster Nodes"), original: 'SwarmCode: Scan Local Cluster Nodes' },
			category: { value: localize('swarmcodeCategory', "SwarmCode"), original: 'SwarmCode' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const swarmService = accessor.get(ISwarmCodeService);
		await swarmService.refreshPeers();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'swarmcode.ingestWorkspace',
			title: { value: localize('swarmcode.ingestWorkspace', "SwarmCode: Ingest Open Workspace to Cluster Memory"), original: 'SwarmCode: Ingest Open Workspace to Cluster Memory' },
			category: { value: localize('swarmcodeCategory', "SwarmCode"), original: 'SwarmCode' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const swarmService = accessor.get(ISwarmCodeService);
		await swarmService.ingestActiveWorkspace();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'swarmcode.startDeliberation',
			title: { value: localize('swarmcode.startDeliberation', "SwarmCode: Start Multi-Model Deliberation & Zero-Error Plan"), original: 'SwarmCode: Start Multi-Model Deliberation & Zero-Error Plan' },
			category: { value: localize('swarmcodeCategory', "SwarmCode"), original: 'SwarmCode' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const swarmService = accessor.get(ISwarmCodeService);
		await swarmService.startCollaborativeDiscussion('Analyze workspace codebase and synthesize zero-defect implementation plan');
	}
});
