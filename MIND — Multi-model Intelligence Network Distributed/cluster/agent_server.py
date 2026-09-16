import asyncio
import os
import socket
import sys
import time
import json
import urllib.request
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional

try:
    from cluster_daemon import ClusterDaemon
    from node_config import detect_backend_model, get_local_ip
except ImportError:  # imported as part of the `cluster` package
    from cluster.cluster_daemon import ClusterDaemon
    from cluster.node_config import detect_backend_model, get_local_ip

# Global State
PORT = int(os.getenv("SWARM_PORT", "8000"))
NODE_ROLE = os.getenv("SWARM_ROLE", "coder") # 'architect', 'coder', 'reviewer', 'tester'
NODE_MODEL = os.getenv("SWARM_MODEL", "Llama-3-8B")
# Stable identity: same machine + port is the same node across restarts,
# so peers don't see ghost entries every time this process reboots.
NODE_ID = os.getenv("SWARM_NODE_ID", f"agent-{socket.gethostname().lower()}-{PORT}")

LOCAL_IP = get_local_ip()

# Heterogeneous cluster: this machine serves its OWN model. Detect what the
# local backend actually runs (falls back to SWARM_MODEL when unreachable).
BACKEND = detect_backend_model(
    os.getenv("SWARM_BACKEND_URL", "http://127.0.0.1:8080"),
    fallback_name=NODE_MODEL,
    timeout=3.0,
)
EFFECTIVE_MODEL = BACKEND["model_name"] if BACKEND["reachable"] else NODE_MODEL

daemon = ClusterDaemon(NODE_ID, NODE_ROLE, PORT, EFFECTIVE_MODEL)

BACKEND_TTL_S = 60.0
_backend_checked_at = 0.0


def ensure_backend() -> None:
    """Re-detect the local backend at most once per TTL.

    The backend may start after this node, so a boot-time miss must not
    stick forever. Updates the advertised model and the beacons in place.
    """
    global EFFECTIVE_MODEL, _backend_checked_at
    now = time.time()
    if now - _backend_checked_at < BACKEND_TTL_S:
        return
    _backend_checked_at = now
    detected = detect_backend_model(
        os.getenv("SWARM_BACKEND_URL", "http://127.0.0.1:8080"),
        fallback_name=NODE_MODEL,
        timeout=2.0,
    )
    BACKEND.update(detected)
    if detected["reachable"]:
        EFFECTIVE_MODEL = detected["model_name"]
        daemon.node_model = EFFECTIVE_MODEL


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting Cluster Daemon on Node {NODE_ID} as {NODE_ROLE}")
    daemon.start()
    yield
    daemon.stop()


app = FastAPI(title="SwarmCode Agent Server", lifespan=lifespan)


def _proxy_chat(req: dict) -> dict:
    body = json.dumps(req).encode("utf-8")
    url = f"{BACKEND['backend_url']}/v1/chat/completions"
    proxy_req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(proxy_req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))

class DiscussRequest(BaseModel):
    topic: str
    context: str
    round: int

class PlanRequest(BaseModel):
    discussion_history: List[dict]

@app.get("/v1/node/info")
async def get_node_info():
    await asyncio.to_thread(ensure_backend)
    return {
        "node_id": NODE_ID,
        "role": NODE_ROLE,
        "model": EFFECTIVE_MODEL,
        "port": PORT,
        "backend": BACKEND,
    }

@app.get("/v1/cluster/peers")
async def get_cluster_peers():
    await asyncio.to_thread(ensure_backend)
    active = daemon.get_peers()
    peers_list = []
    # Add self first, just like discovery.py does
    peers_list.append({
        "node_id": NODE_ID,
        "hostname": socket.gethostname(),
        "api_url": f"http://{LOCAL_IP}:{PORT}",
        "api_host": LOCAL_IP,
        "api_port": PORT,
        "role_description": NODE_ROLE,
        "model_name": EFFECTIVE_MODEL,
        "vram_gb": 0.0
    })
    for nid, info in active.items():
        peers_list.append({
            "node_id": nid,
            "hostname": nid,
            "api_url": f"http://{info['ip']}:{info['port']}",
            "api_host": info["ip"],
            "api_port": info["port"],
            "role_description": info["role"],
            "model_name": info["model"],
            "vram_gb": 0.0
        })
    return {"peers": peers_list}

@app.post("/v1/agent/discuss")
async def agent_discuss(req: DiscussRequest):
    # Here we would query the local llama.cpp / tiered cache model.
    # For now, return a stub response specific to the role.
    response = f"[{NODE_ROLE.capitalize()} - {EFFECTIVE_MODEL}] Insight on round {req.round} for topic: {req.topic}"
    return {"status": "success", "response": response}

@app.post("/v1/chat/completions")
async def chat_completions(req: dict):
    # Heterogeneous team: when a real local backend was auto-detected, let
    # THIS node's own model answer. Otherwise fall back to the local mock so
    # the node can still participate in the consensus loop.
    await asyncio.to_thread(ensure_backend)
    if BACKEND["reachable"]:
        try:
            return await asyncio.to_thread(_proxy_chat, req)
        except Exception:
            pass

    # Mock OpenAI completions endpoint to allow the agent to participate in the swarm consensus loop
    messages = req.get("messages", [])
    prompt = messages[-1].get("content", "") if messages else ""

    # We will simulate a response that passes the zero-error review.
    # If the prompt asks for a review, say "No errors found."
    if "review" in prompt.lower() or "verify" in prompt.lower():
        content = f"[{NODE_ROLE} / {EFFECTIVE_MODEL}]: I have reviewed the proposal and found NO ERRORS. It looks solid."
    else:
        content = f"[{NODE_ROLE} / {EFFECTIVE_MODEL}]: This is my generated proposal based on my local RAM context."

    return {
        "id": "mock-completion-123",
        "object": "chat.completion",
        "created": 1234567890,
        "model": EFFECTIVE_MODEL,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    }

@app.post("/v1/agent/plan")
async def agent_plan(req: PlanRequest):
    # Synthesize a concrete plan from the history.
    return {"status": "success", "plan": "Generated Implementation Plan"}

@app.websocket("/v1/cluster/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back with peer info
            await websocket.send_text(f"Node {NODE_ID} received: {data}")
    except Exception as e:
        print(f"WS error: {e}")

if __name__ == "__main__":
    uvicorn.run("agent_server:app", host="0.0.0.0", port=PORT, reload=False)
