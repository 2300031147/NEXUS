/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { SWARM_HOST_CONTRACT, describeNode, formatScopeSummary, isSwarmTopology, nodeReachability } from '../../common/swarmCluster.js';

suite('SwarmCluster', () => {

	test('describeNode falls back to node id without hostname', () => {
		assert.strictEqual(
			describeNode({ node_id: 'n1', api_host: '127.0.0.1', api_port: 8090, model_name: 'M', role_description: 'coder' }),
			'n1 · M · coder'
		);
		assert.strictEqual(
			describeNode({ node_id: 'n1', hostname: 'laptop', api_host: '127.0.0.1', api_port: 8090, model_name: 'M', role_description: 'coder' }),
			'laptop · M · coder'
		);
	});

	test('nodeReachability prefers backend status, then liveness', () => {
		const base = { node_id: 'n1', api_host: 'h', api_port: 1, model_name: 'M', role_description: 'r' };
		assert.strictEqual(nodeReachability({ ...base, backend: { reachable: true, model_name: 'M', model_path: null, n_ctx: null, backend_url: 'u' } }), 'reachable');
		assert.strictEqual(nodeReachability({ ...base, backend: { reachable: false, model_name: 'M', model_path: null, n_ctx: null, backend_url: 'u' } }), 'unreachable');
		assert.strictEqual(nodeReachability({ ...base, is_alive: false }), 'unreachable');
		assert.strictEqual(nodeReachability(base), 'unknown');
	});

	test('formatScopeSummary distinguishes unrestricted scopes', () => {
		assert.strictEqual(formatScopeSummary({ roots: [], restricted: false }), 'Unrestricted');
		assert.strictEqual(formatScopeSummary({ roots: ['/a', '/b'], restricted: true }), '/a, /b');
	});

	test('isSwarmTopology guards the host contract', () => {
		const valid = {
			cluster_id: 'swarm-default',
			contract: SWARM_HOST_CONTRACT,
			local_node: { node_id: 'n1' },
			nodes: [],
			scope: { roots: [], restricted: false }
		};
		assert.strictEqual(isSwarmTopology(valid), true);
		assert.strictEqual(isSwarmTopology({ ...valid, contract: 'other/9' }), false);
		assert.strictEqual(isSwarmTopology(null), false);
		assert.strictEqual(isSwarmTopology({}), false);
	});
});
