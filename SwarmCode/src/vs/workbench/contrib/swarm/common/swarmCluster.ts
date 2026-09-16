/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Types mirroring the cluster host contract (`swarm-host/1`, see
// SSD-and-Ram-as-context-window-for-ai-model-main/cluster/HOST_API.md).
// This module is dependency-free so it stays unit-testable.

export const SWARM_HOST_CONTRACT = 'swarm-host/1';

export const DEFAULT_CLUSTER_URL = 'http://127.0.0.1:8090';

export interface SwarmNodeMemory {
	readonly vram_gb: number;
	readonly ram_gb: number;
	readonly ssd_swap_gb: number;
	readonly max_context: number;
}

export interface SwarmBackendInfo {
	readonly reachable: boolean;
	readonly model_name: string;
	readonly model_path: string | null;
	readonly n_ctx: number | null;
	readonly backend_url: string;
}

export interface SwarmNode {
	readonly node_id: string;
	readonly hostname?: string;
	readonly api_url?: string;
	readonly api_host: string;
	readonly api_port: number;
	readonly model_name: string;
	readonly role_description: string;
	readonly memory?: SwarmNodeMemory;
	readonly backend?: SwarmBackendInfo;
	readonly is_alive?: boolean;
	readonly last_seen?: number;
}

export interface SwarmScope {
	readonly roots: string[];
	readonly restricted: boolean;
}

export interface SwarmTopology {
	readonly cluster_id: string;
	readonly contract: string;
	readonly local_node: SwarmNode;
	readonly nodes: SwarmNode[];
	readonly scope: SwarmScope;
}

export interface SwarmDiscussionTask {
	readonly id: string;
	readonly assigned_node?: string;
	readonly assigned_model?: string;
	readonly title: string;
	readonly description: string;
	readonly status: string;
}

export interface SwarmDiscussionPlan {
	readonly title: string;
	readonly status: string;
	readonly consensus_score: number;
	readonly summary: string;
	readonly rounds_to_zero_error: number | null;
	readonly tasks: SwarmDiscussionTask[];
}

export function isSwarmTopology(value: unknown): value is SwarmTopology {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return candidate['contract'] === SWARM_HOST_CONTRACT
		&& typeof candidate['local_node'] === 'object'
		&& Array.isArray(candidate['nodes'])
		&& typeof candidate['scope'] === 'object';
}

export function describeNode(node: SwarmNode): string {
	const name = node.hostname || node.node_id;
	return `${name} · ${node.model_name} · ${node.role_description}`;
}

export type SwarmNodeReachability = 'reachable' | 'unreachable' | 'unknown';

export function nodeReachability(node: SwarmNode): SwarmNodeReachability {
	if (node.backend) {
		return node.backend.reachable ? 'reachable' : 'unreachable';
	}
	if (node.is_alive === false) {
		return 'unreachable';
	}
	return 'unknown';
}

export function formatScopeSummary(scope: SwarmScope): string {
	if (!scope.restricted || scope.roots.length === 0) {
		return 'Unrestricted';
	}
	return scope.roots.join(', ');
}
