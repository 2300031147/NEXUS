/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { ViewContainer, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry, WindowEnablement } from '../../../common/views.js';
import { DEFAULT_CLUSTER_URL } from '../common/swarmCluster.js';
import { ISwarmClusterService, SwarmClusterService } from '../common/swarmClusterService.js';
import { SWARM_CLUSTER_VIEW_ID, SwarmClusterViewPane } from './swarmClusterView.js';

// Register Service
registerSingleton(ISwarmClusterService, SwarmClusterService, InstantiationType.Delayed);

// Register Configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.ConfigurationRegistry).registerConfiguration({
	id: 'swarm',
	title: localize2('swarmConfigurationTitle', "Swarm Cluster"),
	type: 'object',
	properties: {
		'swarm.clusterUrl': {
			type: 'string',
			default: DEFAULT_CLUSTER_URL,
			markdownDescription: localize('swarm.clusterUrl.description', "Base URL of the local swarm cluster node (cluster_server)."),
			scope: ConfigurationScope.MACHINE
		}
	}
});

// Register Swarm container in the side bar
const swarmViewIcon = registerIcon('swarm-view-icon', Codicon.server, localize('swarmViewIcon', 'View icon of the Swarm view.'));
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'workbench.view.swarm',
	title: localize2('swarm', "Swarm"),
	icon: swarmViewIcon,
	order: 4,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['workbench.view.swarm', { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'workbench.view.swarm',
	hideIfEmpty: false,
	windowEnablement: WindowEnablement.Both
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: SWARM_CLUSTER_VIEW_ID,
	name: localize2('swarmCluster', "Cluster"),
	containerIcon: swarmViewIcon,
	canMoveView: true,
	canToggleVisibility: true,
	ctorDescriptor: new SyncDescriptor(SwarmClusterViewPane),
	windowEnablement: WindowEnablement.Both
}], VIEW_CONTAINER);

const swarmCategory = localize2('swarm', "Swarm");

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'swarm.refreshTopology',
			title: localize2('swarm.refreshTopology', "Refresh Cluster"),
			category: swarmCategory,
			f1: true,
			icon: Codicon.refresh,
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.equals('view', SWARM_CLUSTER_VIEW_ID),
				group: 'navigation',
				order: 1
			}]
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(ISwarmClusterService).refresh();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'swarm.setScope',
			title: localize2('swarm.setScope', "Set Shared Folder..."),
			category: swarmCategory,
			f1: true
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);
		const swarmService = accessor.get(ISwarmClusterService);
		const notificationService = accessor.get(INotificationService);
		const uris = await fileDialogService.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			title: localize('swarm.setScope.title', "Choose a folder to share with the models")
		});
		if (!uris || uris.length === 0) {
			return;
		}
		try {
			const scope = await swarmService.setScope([uris[0].fsPath]);
			notificationService.info(localize('swarm.setScope.done', "Sharing {0} with the models.", scope.roots.join(', ')));
		} catch (error) {
			notificationService.error(localize('swarm.setScope.failed', "Could not set the shared folder: {0}", String(error)));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'swarm.shareActiveFile',
			title: localize2('swarm.shareActiveFile', "Share Active File With Models"),
			category: swarmCategory,
			f1: true
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const swarmService = accessor.get(ISwarmClusterService);
		const notificationService = accessor.get(INotificationService);
		const resource = editorService.activeEditor?.resource;
		if (!resource || resource.scheme !== 'file') {
			notificationService.info(localize('swarm.shareActiveFile.none', "Open a file first, then share it with the models."));
			return;
		}
		try {
			const result = await swarmService.ingest(`Shared file ${resource.fsPath}`, [{ path: resource.fsPath }]);
			notificationService.info(localize('swarm.shareActiveFile.done', "Shared with the models ({0} file(s) in context).", result.file_count));
		} catch (error) {
			notificationService.error(localize('swarm.shareActiveFile.failed', "Could not share the file: {0}", String(error)));
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'swarm.startDiscussion',
			title: localize2('swarm.startDiscussion', "Start Team Discussion..."),
			category: swarmCategory,
			f1: true
		});
	}
	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const swarmService = accessor.get(ISwarmClusterService);
		const notificationService = accessor.get(INotificationService);
		const goal = await quickInputService.input({
			prompt: localize('swarm.startDiscussion.prompt', "What should the model team discuss and plan?"),
			placeHolder: localize('swarm.startDiscussion.placeholder', "e.g. Add a calculator module with tests")
		});
		if (!goal) {
			return;
		}
		try {
			notificationService.info(localize('swarm.startDiscussion.running', "The model team is discussing..."));
			const plan = await swarmService.collaborate(goal);
			notificationService.info(localize('swarm.startDiscussion.done', "{0}: {1}", plan.status, plan.summary));
		} catch (error) {
			notificationService.error(localize('swarm.startDiscussion.failed', "Team discussion failed: {0}", String(error)));
		}
	}
});
