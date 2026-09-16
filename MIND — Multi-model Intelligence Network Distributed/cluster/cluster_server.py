"""
Swarm Cluster Server & Peer Node Service.
Automatically initializes UDP peer discovery and multi-model consensus endpoints.
When this service runs on a laptop, it joins the local swarm cluster and exposes
both local SSD+RAM inference and distributed multi-model collaboration.
"""

import argparse
import asyncio
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import json
import logging
import os
import socket
import sys
import threading
import time
import urllib.request
from typing import Dict, Any, List, Optional

try:
    from discovery import SwarmDiscovery, SwarmNodeInfo, SWARM_DISCOVERY_PORT # type: ignore
    from consensus_engine import MultiModelConsensusEngine # type: ignore
    from node_config import detect_backend_model, detect_node_topology, WorkspaceScope # type: ignore
except ImportError:  # imported as part of the `cluster` package
    from cluster.discovery import SwarmDiscovery, SwarmNodeInfo, SWARM_DISCOVERY_PORT # type: ignore
    from cluster.consensus_engine import MultiModelConsensusEngine # type: ignore
    from cluster.node_config import detect_backend_model, detect_node_topology, WorkspaceScope # type: ignore

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("SwarmNode")


def normalize_ingest(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce an ingest body into the IngestedContext shape hosts read.

    Hosts expect {summary, files[{path,...}], ingested_at, total_tokens};
    raw client payloads only carry {summary, files}. Never aliases input.
    """
    summary = str(payload.get("summary", ""))
    files = payload.get("files", []) or []
    norm_files: List[Dict[str, Any]] = []
    chars = len(summary)
    for entry in files:
        if isinstance(entry, dict):
            norm = dict(entry)
            norm["path"] = str(norm.get("path", ""))
            content = norm.get("content", "")
            chars += len(str(content)) if content else 0
            norm_files.append(norm)
        else:
            norm_files.append({"path": str(entry)})
            chars += len(str(entry))
    return {
        "summary": summary,
        "files": norm_files,
        "ingested_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_tokens": max(chars // 4, 0),
    }


def get_local_ip() -> str:
    """Detect non-loopback local network IP."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


class SwarmNodeService:
    def __init__(
        self,
        hostname: Optional[str] = None,
        api_port: int = 8090,
        llama_backend_url: str = "http://127.0.0.1:8080",
        model_name: str = "Default-Model",
        role_description: str = "Collaborative Multi-Model Peer",
        vram_gb: float = 6.0,
        ram_gb: float = 16.0,
        ssd_swap_gb: float = 64.0,
        max_context: int = 65536,
    ) -> None:
        self.hostname = hostname or socket.gethostname()
        self.api_host = get_local_ip()
        self.api_port = api_port
        self.llama_backend_url = llama_backend_url
        self.model_name = model_name
        self.role_description = role_description

        self.node_id = f"node-{self.hostname.lower()}-{self.api_port}"
        
        topo = detect_node_topology()
        eff_ram = ram_gb if ram_gb > 0.0 else topo.get("ram_gb", 0.0)
        eff_vram = vram_gb if vram_gb > 0.0 else topo.get("vram_gb", 0.0)

        self.node_info = SwarmNodeInfo(
            node_id=self.node_id,
            hostname=self.hostname,
            api_host=self.api_host,
            api_port=self.api_port,
            model_name=self.model_name,
            role_description=self.role_description,
            vram_gb=eff_vram,
            ram_gb=eff_ram,
            ssd_swap_gb=ssd_swap_gb,
            max_context=max_context,
            tags=["swarmcode", "ssd_tiered_kv", "multi_agent_consensus"],
            unified_memory=topo.get("unified_memory", False),
            architecture=topo.get("architecture", "unknown"),
            accelerator=topo.get("accelerator", "cpu"),
            profile_name=topo.get("profile_name", "cpu_only"),
            cache_tiers=topo.get("cache_tiers"),
        )

        # Heterogeneous cluster: every node serves its OWN model. Identify
        # what the local backend actually runs and advertise that truthfully.
        self.backend = detect_backend_model(
            llama_backend_url, fallback_name=model_name, timeout=3.0
        )
        if self.backend["reachable"]:
            self.node_info.model_name = self.backend["model_name"]
        self._backend_checked_at = time.time()

        # Folders/files the user grants to the models (empty = unrestricted).
        self.workspace_scope = WorkspaceScope()

        # One collaborative discussion at a time: each run fans out across
        # every node for up to 4 rounds, so concurrent runs would multiply
        # backend load without bound.
        self._collab_lock = threading.Lock()

        self.discovery = SwarmDiscovery(
            node_info=self.node_info,
            discovery_port=SWARM_DISCOVERY_PORT,
            on_peer_discovered=self._on_peer_discovered,
            on_peer_lost=self._on_peer_lost,
        )

        self.consensus_engine = MultiModelConsensusEngine(
            local_node_info=self.node_info.to_dict(),
            local_llama_url=self.llama_backend_url
        )

        self.project_context: Dict[str, Any] = {
            "summary": "No active project loaded.",
            "files": []
        }

    def _on_peer_discovered(self, peer: SwarmNodeInfo) -> None:
        logger.info(f"✨ Discovered Peer Laptop Node: {peer.hostname} ({peer.api_host}:{peer.api_port}) running '{peer.model_name}'")

    def _on_peer_lost(self, peer_id: str) -> None:
        logger.warning(f"⚠️ Lost connection to Peer Node: {peer_id}")

    def refresh_backend(self, timeout: float = 2.0, ttl: float = 60.0) -> None:
        """Re-detect the local backend at most once per TTL.

        The backend may start after this node, so a boot-time miss must not
        stick forever. Keeps the last known-good model name when unreachable.
        """
        now = time.time()
        if now - self._backend_checked_at < ttl:
            return
        self._backend_checked_at = now
        detected = detect_backend_model(
            self.llama_backend_url, fallback_name=self.model_name,
            timeout=timeout,
        )
        self.backend = detected
        if detected["reachable"]:
            self.node_info.model_name = detected["model_name"]

    def apply_settings(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Apply a /v1/node/settings body to the local node. Invalid values are ignored."""
        if "role_description" in payload:
            self.role_description = payload["role_description"]
            self.node_info.role_description = payload["role_description"]
        if "model_name" in payload:
            self.model_name = payload["model_name"]
            self.node_info.model_name = payload["model_name"]
        for key in ("vram_gb", "ram_gb", "ssd_swap_gb", "max_context"):
            if key in payload:
                try:
                    value = float(payload[key])
                except (TypeError, ValueError):
                    continue
                if value < 0:
                    continue
                setattr(self.node_info, key, int(value) if key == "max_context" else value)
        return self.node_info.to_dict()

    def get_topology(self) -> Dict[str, Any]:
        """Full cluster recognition snapshot for hosts (e.g. SwarmCode).

        `local_node` carries this machine's auto-detected model plus backend
        reachability; `nodes` lists every discovered node (self first).
        """
        self.refresh_backend()
        local = self.node_info.to_dict()
        local["backend"] = self.backend
        nodes = self.discovery.get_active_peers()
        return {
            "cluster_id": "swarm-default",
            "contract": "swarm-host/1",
            "local_node": local,
            "total_nodes": len(nodes),
            "nodes": nodes,
            "scope": self.workspace_scope.to_dict(),
        }

    def start(self) -> None:
        # 1. Start automatic UDP discovery beacon and listener
        logger.info(f"Starting Swarm UDP Discovery on port {SWARM_DISCOVERY_PORT} (Node: {self.hostname})...")
        self.discovery.start()

        # 2. Start HTTP API Server
        server_address = ("0.0.0.0", self.api_port)
        httpd = ThreadingHTTPServer(server_address, self._create_handler())
        logger.info(f"🚀 Swarm Node API running on http://{self.api_host}:{self.api_port} (Proxying to llama.cpp @ {self.llama_backend_url})")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("Shutting down Swarm Node...")
            self.discovery.stop()
            httpd.server_close()

    def _create_handler(self) -> Any:
        service = self

        class SwarmHTTPHandler(BaseHTTPRequestHandler):
            def _send_cors_headers(self) -> None:
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

            def do_OPTIONS(self) -> None:
                self.send_response(204)
                self._send_cors_headers()
                self.end_headers()

            def _send_json(self, status: int, data: Any) -> None:
                body = json.dumps(data).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self) -> None:
                base_path = self.path.split('?')[0]
                if base_path == "/v1/node/info" or base_path == "/v1/node/status":
                    service.refresh_backend()
                    self._send_json(200, service.node_info.to_dict())
                elif base_path == "/v1/cluster/peers":
                    peers = service.discovery.get_active_peers()
                    self._send_json(200, {
                        "cluster_id": "swarm-default",
                        "total_nodes": len(peers),
                        "nodes": peers
                    })
                elif base_path == "/v1/cluster/context":
                    self._send_json(200, service.project_context)
                elif base_path == "/v1/cluster/scope":
                    self._send_json(200, service.workspace_scope.to_dict())
                elif base_path == "/v1/cluster/topology":
                    self._send_json(200, service.get_topology())
                else:
                    # Proxy to llama-server
                    self._proxy_get(self.path)

            def do_POST(self) -> None:
                try:
                    content_length = int(self.headers.get("Content-Length", 0))
                except (ValueError, TypeError):
                    content_length = 0
                if content_length < 0:
                    content_length = 0
                if content_length > 32 * 1024 * 1024:
                    self._send_json(413, {
                        "status": "rejected",
                        "message": "Request body too large.",
                    })
                    return
                raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
                try:
                    payload = json.loads(raw_body.decode("utf-8"))
                    if not isinstance(payload, dict):
                        payload = {}
                except Exception:
                    payload = {}

                base_path = self.path.split('?')[0]

                if base_path == "/v1/cluster/ingest":
                    # Enforce the user-granted workspace scope first
                    rejected = service.workspace_scope.check_files(payload.get("files", []))
                    if rejected:
                        self._send_json(403, {
                            "status": "rejected",
                            "message": "Some files fall outside the user-granted workspace scope.",
                            "rejected": rejected,
                            "scope": service.workspace_scope.to_dict(),
                        })
                        return
                    # Ingest workspace project context (normalized copy: never alias the request dict)
                    service.project_context = normalize_ingest(payload)
                    logger.info(f"Ingested workspace context: {len(service.project_context['files'])} files.")
                    self._send_json(200, {
                        "status": "success",
                        "message": f"Context ingested successfully into node '{service.hostname}' SSD+RAM tiered memory.",
                        "file_count": len(service.project_context["files"])
                    })

                elif base_path == "/v1/cluster/scope":
                    # Grant (or clear) the folders/files the user gives to the models
                    if payload.get("clear"):
                        service.workspace_scope.clear()
                    else:
                        service.workspace_scope.set_roots(payload.get("roots", []))
                    self._send_json(200, service.workspace_scope.to_dict())

                elif base_path == "/v1/node/settings":
                    # Update local node configuration settings (e.g., from native UI)
                    node = service.apply_settings(payload)
                    self._send_json(200, {"status": "success", "node": node})

                elif base_path == "/v1/cluster/collaborate" or base_path == "/v1/cluster/discuss":
                    # Run multi-model deliberation & zero-error cross-verification loop
                    if not service._collab_lock.acquire(blocking=False):
                        self._send_json(409, {
                            "status": "busy",
                            "message": "A collaborative discussion is already running on this node.",
                        })
                        return
                    try:
                        user_goal = payload.get("goal", payload.get("prompt", "Analyze project and propose enhancements."))
                        active_peers = service.discovery.get_active_peers()

                        # Execute synchronous/async consensus safely
                        plan_result = asyncio.run(
                            service.consensus_engine.run_collaborative_discussion_and_plan(
                                project_context=service.project_context,
                                user_prompt=user_goal,
                                active_peers=active_peers,
                            )
                        )
                    except Exception as e:
                        logger.exception("Collaborative discussion failed")
                        self._send_json(502, {
                            "status": "error",
                            "message": f"Collaborative discussion failed: {e}",
                        })
                        return
                    finally:
                        service._collab_lock.release()
                    self._send_json(200, plan_result)

                elif base_path == "/v1/chat/completions":
                    # Proxy standard chat completions directly to llama backend
                    self._proxy_post(self.path, raw_body)
                else:
                    self._proxy_post(self.path, raw_body)

            def _proxy_get(self, path: str) -> None:
                target_url = f"{service.llama_backend_url}{path}"
                try:
                    req = urllib.request.Request(target_url, headers={"Accept": "application/json"})
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        self.send_response(resp.status)
                        for k, v in resp.headers.items():
                            if k.lower() not in ("transfer-encoding", "connection"):
                                self.send_header(k, v)
                        self.send_header("Connection", "close")
                        self._send_cors_headers()
                        self.end_headers()
                        while True:
                            chunk = resp.read(4096)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            self.wfile.flush()
                except Exception as e:
                    self._send_json(502, {"error": f"Upstream llama.cpp server error: {e}"})

            def _proxy_post(self, path: str, body: bytes) -> None:
                target_url = f"{service.llama_backend_url}{path}"
                try:
                    req = urllib.request.Request(
                        target_url,
                        data=body,
                        headers={"Content-Type": "application/json", "Accept": "application/json"}
                    )
                    with urllib.request.urlopen(req, timeout=120) as resp:
                        self.send_response(resp.status)
                        for k, v in resp.headers.items():
                            if k.lower() not in ("transfer-encoding", "connection"):
                                self.send_header(k, v)
                        self.send_header("Connection", "close")
                        self._send_cors_headers()
                        self.end_headers()
                        while True:
                            chunk = resp.read(4096)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            self.wfile.flush()
                except Exception as e:
                    self._send_json(502, {"error": f"Upstream llama.cpp server error: {e}"})

        return SwarmHTTPHandler


def main() -> None:
    parser = argparse.ArgumentParser(description="Swarm Heterogeneous Multi-Model Cluster Node")
    parser.add_argument("--port", type=int, default=8090, help="Port for the Swarm Node Cluster API")
    parser.add_argument("--backend-url", type=str, default="http://127.0.0.1:8080", help="URL of the local llama-server instance")
    parser.add_argument("--model-name", type=str, default="Qwen-2.5-Coder-Tiered", help="Model name running on this node")
    parser.add_argument("--role", type=str, default="Cluster AI Peer", help="Role / specialty of this node's model")
    parser.add_argument("--vram-gb", type=float, default=0.0, help="VRAM capacity in GB (0.0 to auto-detect)")
    parser.add_argument("--ram-gb", type=float, default=0.0, help="RAM capacity in GB (0.0 to auto-detect)")
    parser.add_argument("--ssd-swap-gb", type=float, default=64.0, help="NVMe SSD swap capacity in GB")
    parser.add_argument("--max-context", type=int, default=65536, help="Maximum context size with SSD swap")

    args = parser.parse_args()

    service = SwarmNodeService(
        api_port=args.port,
        llama_backend_url=args.backend_url,
        model_name=args.model_name,
        role_description=args.role,
        vram_gb=args.vram_gb,
        ram_gb=args.ram_gb,
        ssd_swap_gb=args.ssd_swap_gb,
        max_context=args.max_context,
    )
    service.start()


if __name__ == "__main__":
    main()
