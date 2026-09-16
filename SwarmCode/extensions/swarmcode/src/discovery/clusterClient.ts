import * as dgram from 'dgram';
import * as crypto from 'crypto';

export interface PeerInfo {
    nodeId: string;
    ip: string;
    port: number;
    role: string;
    model: string;
    lastSeen: number;
}

/** Max beacon age in seconds (mirrors BEACON_MAX_SKEW_S in node_config.py). */
export const BEACON_MAX_SKEW_S = 60;

function canonicalBeacon(payload: any): string {
    return [
        'SWARMv1',
        String(payload.magic ?? ''),
        String(payload.node_id ?? ''),
        String(payload.role ?? ''),
        String(payload.port ?? ''),
        String(payload.model ?? ''),
        String(payload.ts ?? ''),
    ].join('|');
}

/** Sign a beacon payload (adds fresh `ts`/`sig`). Pure — exported for tests. */
export function signBeacon(payload: any, key: string, nowSec?: number): any {
    const stamped = { ...payload, ts: Math.floor(nowSec ?? Date.now() / 1000) };
    stamped.sig = crypto.createHmac('sha256', key).update(canonicalBeacon(stamped)).digest('hex');
    return stamped;
}

/** Verify a received beacon. Empty key accepts everything (compat mode). */
export function verifyBeacon(payload: any, key: string, nowSec?: number): { ok: boolean; reason: string } {
    if (!key) { return { ok: true, reason: 'unsigned-compat' }; }
    if (!payload || typeof payload.sig !== 'string' || !Number.isInteger(payload.ts)) {
        return { ok: false, reason: 'missing-sig-or-ts' };
    }
    if (Math.abs(Math.floor(nowSec ?? Date.now() / 1000) - payload.ts) > BEACON_MAX_SKEW_S) {
        return { ok: false, reason: 'stale-beacon' };
    }
    const expected = crypto.createHmac('sha256', key).update(canonicalBeacon(payload)).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(payload.sig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { ok: false, reason: 'bad-signature' };
    }
    return { ok: true, reason: 'ok' };
}

export class ClusterClient {
    private peers: Map<string, PeerInfo> = new Map();
    private socket: dgram.Socket;
    private MCAST_GRP = '224.0.0.111';
    private MCAST_PORT = 52415;
    private readonly beaconKey: string;

    constructor(beaconKey?: string) {
        // Pre-shared beacon key (SWARM_BEACON_KEY env when omitted).
        // Set → drop beacons that fail verification.
        this.beaconKey = beaconKey ?? process.env.SWARM_BEACON_KEY ?? '';
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.setupSocket();
    }

    private setupSocket() {
        this.socket.on('message', (msg, rinfo) => {
            try {
                const payload = JSON.parse(msg.toString('utf-8'));
                if (payload.magic === 'SWARM') {
                    const v = verifyBeacon(payload, this.beaconKey);
                    if (!v.ok) { return; }
                    this.peers.set(payload.node_id, {
                        nodeId: payload.node_id,
                        ip: rinfo.address,
                        port: payload.port,
                        role: payload.role,
                        model: payload.model,
                        lastSeen: Date.now()
                    });
                }
            } catch (e) {
                // Ignore parse errors
            }
        });

        this.socket.bind(this.MCAST_PORT, () => {
            this.socket.addMembership(this.MCAST_GRP);
        });
    }

    private pruneTimer?: NodeJS.Timeout;
    private discoveryStarted = false;

    public startDiscovery() {
        if (this.discoveryStarted) { return; }
        this.discoveryStarted = true;
        console.log('Started listening for Swarm cluster UDP discovery beacons.');
        this.pruneTimer = setInterval(() => this.pruneDeadPeers(), 5000);
    }

    public dispose() {
        if (this.pruneTimer) { clearInterval(this.pruneTimer); this.pruneTimer = undefined; }
        this.discoveryStarted = false;
        try { this.socket.close(); } catch { /* already closed */ }
    }

    private pruneDeadPeers() {
        const now = Date.now();
        for (const [id, peer] of this.peers.entries()) {
            if (now - peer.lastSeen > 15000) {
                this.peers.delete(id); // Prune dead nodes
            }
        }
    }

    public getPeers(): PeerInfo[] {
        this.pruneDeadPeers();
        return Array.from(this.peers.values());
    }
}
