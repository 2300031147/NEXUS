"""
Swarm Discovery Protocol for Heterogeneous Multi-Model Clusters.
Implements auto-detection via UDP Multicast and Broadcast (compatible with exo networking).
"""

import json
import socket
import struct
import threading
import time
import uuid
from typing import Dict, Any, Callable, List, Optional

SWARM_MULTICAST_GROUP_V4 = "224.0.0.111"
SWARM_DISCOVERY_PORT = 52415
SWARM_MAGIC = b"SWARM"
HEARTBEAT_INTERVAL = 2.0
PEER_TIMEOUT = 8.0


class SwarmNodeInfo:
    def __init__(
        self,
        node_id: str,
        hostname: str,
        api_host: str,
        api_port: int,
        model_name: str,
        role_description: str,
        vram_gb: float = 0.0,
        ram_gb: float = 0.0,
        ssd_swap_gb: float = 0.0,
        max_context: int = 32768,
        tags: Optional[List[str]] = None,
    ) -> None:
        self.node_id = node_id
        self.hostname = hostname
        self.api_host = api_host
        self.api_port = api_port
        self.model_name = model_name
        self.role_description = role_description
        self.vram_gb = vram_gb
        self.ram_gb = ram_gb
        self.ssd_swap_gb = ssd_swap_gb
        self.max_context = max_context
        self.tags = tags or ["llama.cpp", "ssd_tiered_kv", "swarm_agent"]
        self.last_seen = time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "hostname": self.hostname,
            "api_url": f"http://{self.api_host}:{self.api_port}",
            "api_host": self.api_host,
            "api_port": self.api_port,
            "model_name": self.model_name,
            "role_description": self.role_description,
            "memory": {
                "vram_gb": self.vram_gb,
                "ram_gb": self.ram_gb,
                "ssd_swap_gb": self.ssd_swap_gb,
                "max_context": self.max_context,
            },
            "vram_gb": self.vram_gb,
            "ram_gb": self.ram_gb,
            "ssd_swap_gb": self.ssd_swap_gb,
            "max_context": self.max_context,
            "tags": self.tags,
            "last_seen": self.last_seen,
            "is_alive": (time.time() - self.last_seen) < PEER_TIMEOUT,
        }


class SwarmDiscovery:
    def __init__(
        self,
        node_info: SwarmNodeInfo,
        discovery_port: int = SWARM_DISCOVERY_PORT,
        on_peer_discovered: Optional[Callable[[SwarmNodeInfo], None]] = None,
        on_peer_lost: Optional[Callable[[str], None]] = None,
    ) -> None:
        self.node_info = node_info
        self.discovery_port = discovery_port
        self.on_peer_discovered = on_peer_discovered
        self.on_peer_lost = on_peer_lost
        self.peers: Dict[str, SwarmNodeInfo] = {}
        self.running = False
        self.lock = threading.Lock()

        self._broadcast_sock: Optional[socket.socket] = None
        self._listen_sock: Optional[socket.socket] = None
        self._threads: List[threading.Thread] = []

    def _setup_sockets(self) -> None:
        # Broadcast/Multicast Sender socket
        self._broadcast_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        self._broadcast_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        self._broadcast_sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        self._broadcast_sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)

        # Receiver socket
        self._listen_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        self._listen_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            self._listen_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        except (AttributeError, OSError):
            pass

        self._listen_sock.bind(("", self.discovery_port))
        self._listen_sock.settimeout(1.0)

        # Join multicast group
        try:
            mreq = struct.pack("4s4s", socket.inet_aton(SWARM_MULTICAST_GROUP_V4), socket.inet_aton("0.0.0.0"))
            self._listen_sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        except Exception:
            pass

    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self._setup_sockets()

        t_beacon = threading.Thread(target=self._beacon_loop, daemon=True, name="SwarmBeacon")
        t_listen = threading.Thread(target=self._listen_loop, daemon=True, name="SwarmListen")
        t_reaper = threading.Thread(target=self._reaper_loop, daemon=True, name="SwarmReaper")

        self._threads = [t_beacon, t_listen, t_reaper]
        for t in self._threads:
            t.start()

    def stop(self) -> None:
        self.running = False
        if self._listen_sock:
            try:
                self._listen_sock.close()
            except Exception:
                pass
        if self._broadcast_sock:
            try:
                self._broadcast_sock.close()
            except Exception:
                pass

    def _beacon_loop(self) -> None:
        while self.running:
            try:
                payload = {
                    "magic": SWARM_MAGIC.decode(),
                    "node_id": self.node_info.node_id,
                    "role": self.node_info.role_description,
                    "port": self.node_info.api_port,
                    "model": self.node_info.model_name,
                    "node": self.node_info.to_dict(),
                    "timestamp": time.time(),
                }
                raw = json.dumps(payload).encode("utf-8")
                
                # Send to multicast group and subnet broadcast
                if self._broadcast_sock:
                    try:
                        self._broadcast_sock.sendto(raw, (SWARM_MULTICAST_GROUP_V4, self.discovery_port))
                    except Exception:
                        pass
                    try:
                        self._broadcast_sock.sendto(raw, ("<broadcast>", self.discovery_port))
                    except Exception:
                        pass
                    try:
                        self._broadcast_sock.sendto(raw, ("127.255.255.255", self.discovery_port))
                    except Exception:
                        pass
            except Exception:
                pass
            time.sleep(HEARTBEAT_INTERVAL)

    def _listen_loop(self) -> None:
        while self.running:
            try:
                if not self._listen_sock:
                    break
                try:
                    data, addr = self._listen_sock.recvfrom(65535)
                except socket.timeout:
                    continue
                if not data:
                    continue
                parsed = json.loads(data.decode("utf-8"))
                if parsed.get("magic") != SWARM_MAGIC.decode():
                    continue
                print(f"[Discovery] Received beacon from {addr}: {parsed}", flush=True)

                peer_data = parsed.get("node", {})
                peer_id = parsed.get("node_id") or peer_data.get("node_id")
                if not peer_id or peer_id == self.node_info.node_id:
                    continue

                # If peer sent 127.0.0.1 or 0.0.0.0, use actual remote sender IP
                peer_host = peer_data.get("api_host") or parsed.get("ip")
                if not peer_host or peer_host == "0.0.0.0" or (peer_host == "127.0.0.1" and addr[0] not in ("127.0.0.1", "::1")):
                    peer_host = addr[0]

                # Reconstruct info
                api_port = parsed.get("port") or peer_data.get("api_port", 8080)
                model_name = parsed.get("model") or peer_data.get("model_name", "Unknown-Model")
                role_desc = parsed.get("role") or peer_data.get("role_description", "Team Model")

                peer = SwarmNodeInfo(
                    node_id=peer_id,
                    hostname=peer_data.get("hostname", "Unknown-Laptop"),
                    api_host=peer_host,
                    api_port=api_port,
                    model_name=model_name,
                    role_description=role_desc,
                    vram_gb=peer_data.get("memory", {}).get("vram_gb", 0.0),
                    ram_gb=peer_data.get("memory", {}).get("ram_gb", 0.0),
                    ssd_swap_gb=peer_data.get("memory", {}).get("ssd_swap_gb", 0.0),
                    max_context=peer_data.get("memory", {}).get("max_context", 32768),
                    tags=peer_data.get("tags", []),
                )
                peer.last_seen = time.time()

                is_new = False
                with self.lock:
                    if peer_id not in self.peers:
                        is_new = True
                    self.peers[peer_id] = peer

                if is_new and self.on_peer_discovered:
                    self.on_peer_discovered(peer)

            except Exception:
                if not self.running:
                    break

    def _reaper_loop(self) -> None:
        while self.running:
            time.sleep(2.0)
            now = time.time()
            lost_peers = []
            with self.lock:
                for pid, peer in list(self.peers.items()):
                    if now - peer.last_seen > PEER_TIMEOUT:
                        lost_peers.append(pid)
                        del self.peers[pid]

            for pid in lost_peers:
                if self.on_peer_lost:
                    self.on_peer_lost(pid)

    def get_active_peers(self) -> List[Dict[str, Any]]:
        with self.lock:
            # Return own node first plus all active peer nodes
            nodes = [self.node_info.to_dict()]
            for p in self.peers.values():
                nodes.append(p.to_dict())
            return nodes
