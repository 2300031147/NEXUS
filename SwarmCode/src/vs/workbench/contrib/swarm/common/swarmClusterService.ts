/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { DEFAULT_CLUSTER_URL, SwarmDiscussionPlan, SwarmScope, SwarmTopology, isSwarmTopology } from './swarmCluster.js';

export const ISwarmClusterService = createDecorator<ISwarmClusterService>('swarmClusterService');

export interface ISwarmClusterService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeTopology: Event<void>;
	readonly lastError: string | undefined;
	readonly lastPlan: SwarmDiscussionPlan | undefined;
	refresh(): Promise<void>;
	getScope(): Promise<SwarmScope | undefined>;
	setScope(roots: string[]): Promise<SwarmScope>;
	clearScope(): Promise<SwarmScope>;
	ingest(summary: string, files: { path: string }[]): Promise<{ file_count: number }>;
	collaborate(goal: string): Promise<SwarmDiscussionPlan>;
}

export class SwarmClusterService extends Disposable implements ISwarmClusterService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeTopology = this._register(new Emitter<void>());
	readonly onDidChangeTopology: Event<void> = this._onDidChangeTopology.event;

	private _lastError: string | undefined;
	get lastError(): string | undefined { return this._lastError; }

	private _lastPlan: SwarmDiscussionPlan | undefined;
	get lastPlan(): SwarmDiscussionPlan | undefined { return this._lastPlan; }

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	private get baseUrl(): string {
		const configured = this.configurationService.getValue<string>('swarm.clusterUrl');
		return (configured || DEFAULT_CLUSTER_URL).replace(/\/+$/, '');
	}

	private async get<T>(path: string): Promise<T | undefined> {
		try {
			const response = await fetch(`${this.baseUrl}${path}`);
			if (!response.ok) {
				throw new Error(`GET ${path} failed with status ${response.status}`);
			}
			return await response.json() as T;
		} catch (error) {
			this._lastError = error instanceof Error ? error.message : String(error);
			this.logService.warn('[swarm] cluster request failed:', this._lastError);
			return undefined;
		}
	}

	private async post<T>(path: string, body: unknown): Promise<T> {
		const response = await fetch(`${this.baseUrl}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			const message = typeof (data as { message?: unknown }).message === 'string'
				? (data as { message: string }).message
				: `POST ${path} failed with status ${response.status}`;
			throw new Error(message);
		}
		return data as T;
	}

	async refresh(): Promise<void> {
		const topology = await this.get<SwarmTopology>('/v1/cluster/topology');
		if (topology && isSwarmTopology(topology)) {
			this._lastError = undefined;
			this._topology = topology;
			this._onDidChangeTopology.fire();
		}
	}

	private _topology: SwarmTopology | undefined;
	get topology(): SwarmTopology | undefined { return this._topology; }

	async getScope(): Promise<SwarmScope | undefined> {
		return this.get<SwarmScope>('/v1/cluster/scope');
	}

	async setScope(roots: string[]): Promise<SwarmScope> {
		const scope = await this.post<SwarmScope>('/v1/cluster/scope', { roots });
		await this.refresh();
		return scope;
	}

	async clearScope(): Promise<SwarmScope> {
		const scope = await this.post<SwarmScope>('/v1/cluster/scope', { clear: true });
		await this.refresh();
		return scope;
	}

	async ingest(summary: string, files: { path: string }[]): Promise<{ file_count: number }> {
		return this.post<{ file_count: number }>('/v1/cluster/ingest', { summary, files });
	}

	async collaborate(goal: string): Promise<SwarmDiscussionPlan> {
		const plan = await this.post<SwarmDiscussionPlan>('/v1/cluster/collaborate', { goal });
		this._lastPlan = plan;
		this._onDidChangeTopology.fire();
		return plan;
	}
}
