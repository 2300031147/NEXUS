import * as dgram from 'dgram';

export interface PeerInfo {
    nodeId: string;
    ip: string;
    port: number;
    role: string;
    model: string;
    lastSeen: number;
}

export class ClusterClient {
    private peers: Map<string, PeerInfo> = new Map();
    private socket: dgram.Socket;
    private MCAST_GRP = '224.0.0.111';
    private MCAST_PORT = 52415;

    constructor() {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.setupSocket();
    }

    private setupSocket() {
        this.socket.on('message', (msg, rinfo) => {
            try {
                const payload = JSON.parse(msg.toString('utf-8'));
                if (payload.magic === 'SWARM') {
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

    public startDiscovery() {
        console.log('Started listening for Swarm cluster UDP discovery beacons.');
        setInterval(() => {
            const now = Date.now();
            for (const [id, peer] of this.peers.entries()) {
                if (now - peer.lastSeen > 15000) {
                    this.peers.delete(id); // Prune dead nodes
                }
            }
        }, 5000);
    }

    public getPeers(): PeerInfo[] {
        return Array.from(this.peers.values());
    }
}
