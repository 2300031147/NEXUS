import { ClusterClient } from '../discovery/clusterClient';
import { WorkspaceIngestor } from './workspaceIngestor';
import * as http from 'http';

export class SwarmOrchestrator {
    constructor(
        private clusterClient: ClusterClient,
        private workspaceIngestor: WorkspaceIngestor
    ) {}

    public async synthesizePlan(topic: string): Promise<string> {
        const peers = this.clusterClient.getPeers();
        if (peers.length === 0) {
            return "No active SwarmCode agents found on the local network.";
        }

        const workspaceContext = await this.workspaceIngestor.scanWorkspace();
        let plan = `Synthesizing plan for topic: ${topic}\n`;
        plan += `Workspace Context provided: ${workspaceContext.substring(0, 100)}...\n\n`;

        for (const peer of peers) {
            try {
                const response = await this.queryAgent(peer.ip, peer.port, '/v1/agent/discuss', {
                    topic: topic,
                    context: workspaceContext,
                    round: 1
                });
                plan += `[${peer.role.toUpperCase()}] at ${peer.ip}:${peer.port}:\n${response}\n\n`;
            } catch (e: any) {
                plan += `[${peer.role.toUpperCase()}] failed to respond: ${e.message}\n\n`;
            }
        }

        return plan;
    }

    private queryAgent(ip: string, port: number, path: string, payload: any): Promise<string> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);
            const options = {
                hostname: ip,
                port: port,
                path: path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                },
                timeout: 5000
            };

            const req = http.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => { responseData += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(responseData);
                        resolve(json.response || json.plan || responseData);
                    } catch (e) {
                        resolve(responseData);
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error("Request timed out"));
            });
            req.write(data);
            req.end();
        });
    }
}
