import socket
import struct
import json
import threading
import time
import uuid

# Multicast settings
MCAST_GRP = '224.0.0.111'
MCAST_PORT = 52415
MAGIC_HEADER = "SWARM"

class ClusterDaemon:
    def __init__(self, node_id, node_role, http_port, node_model):
        self.node_id = node_id
        self.node_role = node_role
        self.http_port = http_port
        self.node_model = node_model
        
        self.peers = {} # node_id -> { "ip": str, "port": int, "role": str, "model": str, "last_seen": float }
        self.lock = threading.Lock()
        self.running = False
        self.listen_thread = None
        self.broadcast_thread = None

    def start(self):
        if self.running:
            return
        self.running = True
        self.listen_thread = threading.Thread(target=self._listen, daemon=True)
        self.broadcast_thread = threading.Thread(target=self._broadcast, daemon=True)
        self.listen_thread.start()
        self.broadcast_thread.start()
        
    def stop(self):
        self.running = False
        
    def get_peers(self):
        # Filter out dead peers (not seen in 15 seconds)
        current_time = time.time()
        active_peers = {}
        with self.lock:
            for nid, info in list(self.peers.items()):
                if current_time - info["last_seen"] < 15.0:
                    active_peers[nid] = info
            self.peers = active_peers
        return active_peers

    def _listen(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        except (AttributeError, OSError):
            pass
        sock.bind(('', MCAST_PORT))
        try:
            mreq = struct.pack("4s4s", socket.inet_aton(MCAST_GRP), socket.inet_aton("0.0.0.0"))
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        except OSError:
            pass  # No multicast device (containers/VPNs): broadcast beacons still work
        
        sock.settimeout(1.0)
        
        while self.running:
            try:
                data, addr = sock.recvfrom(65535)
                self._handle_beacon(data, addr)
            except socket.timeout:
                continue
            except Exception as e:
                print(f"[Daemon] Listen error: {e}")

    def _broadcast(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)
        
        while self.running:
            payload = {
                "magic": MAGIC_HEADER,
                "node_id": self.node_id,
                "role": self.node_role,
                "port": self.http_port,
                "model": self.node_model
            }
            msg = json.dumps(payload).encode('utf-8')
            try:
                sock.sendto(msg, (MCAST_GRP, MCAST_PORT))
            except Exception:
                pass
                
            try:
                sock.sendto(msg, ("<broadcast>", MCAST_PORT))
            except Exception:
                pass
                
            try:
                sock.sendto(msg, ("127.255.255.255", MCAST_PORT))
            except Exception:
                pass

            time.sleep(3) # Broadcast every 3 seconds

    def _handle_beacon(self, data, addr):
        try:
            payload = json.loads(data.decode('utf-8'))
            if payload.get("magic") != MAGIC_HEADER:
                return
            
            nid = payload["node_id"]
            if nid == self.node_id:
                return # Ignore self

            with self.lock:
                self.peers[nid] = {
                    "ip": addr[0],
                    "port": payload["port"],
                    "role": payload["role"],
                    "model": payload["model"],
                    "last_seen": time.time()
                }
        except Exception:
            pass

if __name__ == "__main__":
    node_id = str(uuid.uuid4())
    daemon = ClusterDaemon(node_id, "architect", 8080, "Llama-3-8B")
    daemon.start()
    print(f"Cluster daemon started. Node ID: {node_id}")
    try:
        while True:
            time.sleep(5)
            print("Active peers:", len(daemon.get_peers()))
    except KeyboardInterrupt:
        daemon.stop()
