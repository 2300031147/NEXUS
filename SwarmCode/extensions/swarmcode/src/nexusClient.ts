import * as http from 'http';
import {
    NodeInfo, ClusterTopology, WorkspaceScope, FileEntry,
    IngestedContext, CollaborationResult, ChatMessage, NexusEvent, NexusTask
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// NEXUS Client SDK — wraps the MIND Host API (cluster_server.py)
// Base URL: http://<nexus-host>:<port>  (default http://localhost:8090)
// ─────────────────────────────────────────────────────────────────────────────

export class NexusClient {
    private baseUrl: string;

    constructor(hostUrl: string = 'http://localhost:8090') {
        this.baseUrl = hostUrl.replace(/\/$/, '');
    }

    public setHostUrl(url: string) {
        this.baseUrl = url.replace(/\/$/, '');
    }

    // ── Low-level helpers ─────────────────────────────────────────────────────

    private async get<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const url = new URL(this.baseUrl + path);
            const options = {
                hostname: url.hostname,
                port: parseInt(url.port || '8090', 10),
                path: url.pathname + url.search,
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                timeout: 10000,
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                        return;
                    }
                    try { resolve(JSON.parse(data) as T); }
                    catch (e) { reject(new Error(`JSON parse error: ${data}`)); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
            req.end();
        });
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(body);
            const url = new URL(this.baseUrl + path);
            const options = {
                hostname: url.hostname,
                port: parseInt(url.port || '8090', 10),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'Accept': 'application/json',
                },
                timeout: 120000,
            };
            const req = http.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => { responseData += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                        return;
                    }
                    try { resolve(JSON.parse(responseData) as T); }
                    catch (e) { reject(new Error(`JSON parse error: ${responseData}`)); }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
            req.write(data);
            req.end();
        });
    }

    /** Streaming POST — yields lines of text as they arrive (SSE or newline-delimited JSON). */
    public async *postStream(path: string, body: unknown): AsyncIterableIterator<string> {
        const data = JSON.stringify(body);
        const url = new URL(this.baseUrl + path);

        yield* await new Promise<AsyncIterableIterator<string>>((resolve, reject) => {
            const options = {
                hostname: url.hostname,
                port: parseInt(url.port || '8090', 10),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'Accept': 'text/event-stream',
                },
                timeout: 300000,
            };

            const chunks: string[] = [];
            let resolveNext: ((value: IteratorResult<string>) => void) | null = null;
            let done = false;

            async function* gen(): AsyncIterableIterator<string> {
                while (true) {
                    if (chunks.length > 0) {
                        yield chunks.shift()!;
                    } else if (done) {
                        return;
                    } else {
                        await new Promise<void>((r) => {
                            resolveNext = (result) => {
                                resolveNext = null;
                                r();
                            };
                        });
                    }
                }
            }

            const req = http.request(options, (res) => {
                let buffer = '';
                res.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString('utf-8');
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) {
                        const trimmed = line.replace(/^data:\s*/, '').trim();
                        if (trimmed && trimmed !== '[DONE]') {
                            chunks.push(trimmed);
                            if (resolveNext) { resolveNext({ value: trimmed, done: false }); }
                        }
                    }
                });
                res.on('end', () => {
                    done = true;
                    if (resolveNext) { resolveNext({ value: undefined as any, done: true }); }
                });
                resolve(gen());
            });
            req.on('error', (e) => { done = true; reject(e); });
            req.write(data);
            req.end();
        });
    }

    // ── Node & Cluster ────────────────────────────────────────────────────────

    /** GET /v1/node/info — local node identity. */
    public async getNodeInfo(): Promise<NodeInfo> {
        return this.get<NodeInfo>('/v1/node/info');
    }

    /** GET /v1/cluster/peers — all discovered nodes. */
    public async getPeers(): Promise<{ cluster_id: string; total_nodes: number; nodes: NodeInfo[] }> {
        return this.get('/v1/cluster/peers');
    }

    /** GET /v1/cluster/topology — full snapshot (local node + all peers + scope). */
    public async getTopology(): Promise<ClusterTopology> {
        return this.get<ClusterTopology>('/v1/cluster/topology');
    }

    /** Ping reachability — returns true if the host responds. */
    public async ping(): Promise<boolean> {
        try {
            await this.get<unknown>('/v1/node/info');
            return true;
        } catch {
            return false;
        }
    }

    // ── Workspace Scope & Context ─────────────────────────────────────────────

    /** GET /v1/cluster/scope */
    public async getScope(): Promise<WorkspaceScope> {
        return this.get<WorkspaceScope>('/v1/cluster/scope');
    }

    /** POST /v1/cluster/scope — grant roots or clear all restrictions. */
    public async setScope(roots: string[]): Promise<void> {
        await this.post('/v1/cluster/scope', { roots });
    }

    /** POST /v1/cluster/scope — clear all workspace restrictions. */
    public async clearScope(): Promise<void> {
        await this.post('/v1/cluster/scope', { clear: true });
    }

    /** POST /v1/cluster/ingest — send context to the cluster. */
    public async ingestContext(summary: string, files: FileEntry[]): Promise<{ ok: boolean; rejected?: string[] }> {
        return this.post('/v1/cluster/ingest', { summary, files });
    }

    /** GET /v1/cluster/context — currently ingested context. */
    public async getCurrentContext(): Promise<IngestedContext> {
        return this.get<IngestedContext>('/v1/cluster/context');
    }

    // ── Consensus / Collaboration ─────────────────────────────────────────────

    /**
     * POST /v1/cluster/collaborate
     * Runs propose → cross-review → revise across all nodes.
     * Returns the approved plan with full discussion transcript.
     */
    public async collaborate(goal: string): Promise<CollaborationResult> {
        return this.post<CollaborationResult>('/v1/cluster/collaborate', { goal });
    }

    // ── Chat (OpenAI-compatible) ──────────────────────────────────────────────

    /** POST /v1/chat/completions — streaming chat through the local llama backend. */
    public async *chat(
        messages: ChatMessage[],
        model?: string,
        temperature: number = 0.7
    ): AsyncIterableIterator<string> {
        const body = {
            model: model ?? 'default',
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: true,
            temperature,
        };
        for await (const line of this.postStream('/v1/chat/completions', body)) {
            try {
                const parsed = JSON.parse(line);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (delta) { yield delta; }
            } catch {
                // Non-JSON SSE line — skip
            }
        }
    }

    // ── Task Abstraction ──────────────────────────────────────────────────────

    /**
     * Submit a NexusTask to the cluster.
     * Internally maps to /v1/cluster/collaborate with a structured prompt.
     */
    public async submitTask(task: NexusTask): Promise<CollaborationResult> {
        const goal = [
            `TASK [${task.type.toUpperCase()}]: ${task.goal}`,
            task.files.length ? `Files in scope: ${task.files.join(', ')}` : '',
            task.agents.length ? `Requested agents: ${task.agents.join(', ')}` : '',
        ].filter(Boolean).join('\n');
        return this.collaborate(goal);
    }
}
