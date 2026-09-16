/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SwarmCode Contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';

export const ISwarmCodeService = createDecorator<ISwarmCodeService>('swarmCodeService');

export interface ISwarmMemoryStats {
	readonly vram_gb: number;
	readonly ram_gb: number;
	readonly ssd_swap_gb: number;
	readonly max_context: number;
}

export interface ISwarmNode {
	readonly node_id: string;
	readonly hostname: string;
	readonly api_url: string;
	readonly api_host: string;
	readonly api_port: number;
	readonly model_name: string;
	readonly role_description: string;
	readonly memory: ISwarmMemoryStats;
	readonly tags: readonly string[];
	readonly is_alive: boolean;
	readonly last_seen: number;
}

export interface ISwarmClusterStatus {
	readonly total_nodes: number;
	readonly active_nodes: number;
	readonly total_vram_gb: number;
	readonly total_ram_gb: number;
	readonly total_ssd_swap_gb: number;
	readonly active_project?: string;
}

export interface ISwarmTranscriptEntry {
	readonly round: number;
	readonly node_id: string;
	readonly hostname: string;
	readonly model_name: string;
	readonly type: 'proposal' | 'verification_pass' | 'consensus';
	readonly approved?: boolean;
	readonly issues?: readonly string[];
	readonly content: string;
	readonly timestamp: number;
}

export interface ISwarmTask {
	readonly id: string;
	readonly assigned_node: string;
	readonly assigned_model: string;
	readonly title: string;
	readonly description: string;
	readonly status: 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR';
}

export interface ISwarmPlan {
	readonly title: string;
	readonly status: string;
	readonly consensus_score: number;
	readonly rounds_to_zero_error: number;
	readonly participating_nodes: readonly any[];
	readonly summary: string;
	readonly tasks: readonly ISwarmTask[];
	readonly discussion_transcript: readonly ISwarmTranscriptEntry[];
}

export interface ISwarmIngestResult {
	readonly status: string;
	readonly message: string;
	readonly file_count: number;
}

export interface ISwarmCodeService {
	readonly _serviceBrand: undefined;

	readonly onDidDiscoverNode: Event<ISwarmNode>;
	readonly onDidUpdateCluster: Event<ISwarmClusterStatus>;
	readonly onDidUpdateTranscript: Event<ISwarmTranscriptEntry>;
	readonly onDidGeneratePlan: Event<ISwarmPlan>;

	getDiscoveredNodes(): readonly ISwarmNode[];
	getClusterStatus(): ISwarmClusterStatus;
	getLatestPlan(): ISwarmPlan | undefined;
	getTranscript(): readonly ISwarmTranscriptEntry[];

	refreshPeers(): Promise<readonly ISwarmNode[]>;
	ingestActiveWorkspace(workspaceUri?: URI): Promise<ISwarmIngestResult>;
	startCollaborativeDiscussion(userGoal: string): Promise<ISwarmPlan>;
	executePlan(planId: string): Promise<void>;
}
