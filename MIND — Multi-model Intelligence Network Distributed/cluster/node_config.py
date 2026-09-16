"""
Per-node configuration for the heterogeneous swarm cluster.

Unlike exo (which shards ONE large model across nodes), every machine here
runs its OWN (different) model. This module figures out, at startup, which
model the local backend actually serves, so the node can advertise it
truthfully to the swarm. It also owns the workspace file scopes: the folders
and files the user explicitly grants to the models.
"""

import json
import os
import socket
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional


def get_local_ip() -> str:
    """Detect non-loopback local network IP so peers can call back."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # No packets are sent; this only resolves the outbound route.
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def _http_get_json(url: str, timeout: float = 5.0) -> Optional[Any]:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def detect_backend_model(
    backend_url: str,
    fallback_name: Optional[str] = None,
    timeout: float = 5.0,
) -> Dict[str, Any]:
    """Probe a llama.cpp-compatible server and identify the model it serves.

    Returns a dict with:
      - reachable (bool)
      - model_name (str): detected name, or fallback_name / "Unknown-Model"
      - model_path (str): backend-reported model path, if any
      - n_ctx (int|None): backend context size, if reported
      - backend_url (str)
    Never raises: an unreachable backend yields reachable=False.
    """
    backend_url = backend_url.rstrip("/")
    result: Dict[str, Any] = {
        "reachable": False,
        "model_name": fallback_name or os.getenv("SWARM_MODEL", "Unknown-Model"),
        "model_path": None,
        "n_ctx": None,
        "backend_url": backend_url,
    }

    health = _http_get_json(f"{backend_url}/health", timeout=timeout)
    props = _http_get_json(f"{backend_url}/props", timeout=timeout)
    models = _http_get_json(f"{backend_url}/v1/models", timeout=timeout)

    if health is None and props is None and models is None:
        return result

    result["reachable"] = True

    if isinstance(props, dict):
        path = props.get("model_path") or props.get("model")
        if path:
            result["model_path"] = path
            base = os.path.basename(path)
            for ext in (".gguf", ".ggml", ".bin", ".safetensors"):
                if base.lower().endswith(ext):
                    base = base[: -len(ext)]
                    break
            result["model_name"] = base
        n_ctx = props.get("n_ctx") or props.get("n_ctx_train")
        if isinstance(n_ctx, bool):
            pass
        elif isinstance(n_ctx, int):
            result["n_ctx"] = n_ctx
        elif isinstance(n_ctx, str) and n_ctx.strip().isdigit():
            result["n_ctx"] = int(n_ctx.strip())

    if isinstance(models, dict):
        data = models.get("data")
        if isinstance(data, list) and data:
            # A single registry entry is authoritative; with several, the
            # first is an arbitrary pick, so keep the /props-derived name.
            if len(data) == 1:
                model_id = data[0].get("id")
                if model_id:
                    result["model_name"] = model_id

    return result


class WorkspaceScope:
    """Folders/files the user grants to the models.

    Empty roots means unrestricted (single-user local default). Once the user
    sets roots (absolute paths), ingested files must live under one of them.
    """

    def __init__(self, roots: Optional[List[str]] = None):
        self.roots: List[str] = []
        if roots:
            self.set_roots(roots)

    def set_roots(self, roots: List[str]) -> List[str]:
        if isinstance(roots, str):
            roots = [roots]
        normalized = []
        for r in roots or []:
            if not isinstance(r, str) or not r:
                continue
            normalized.append(os.path.realpath(os.path.abspath(os.path.expanduser(r))))
        self.roots = normalized
        return self.roots

    def clear(self) -> None:
        self.roots = []

    def is_allowed(self, path: str) -> bool:
        if not self.roots:
            return True
        candidate = os.path.realpath(os.path.abspath(os.path.expanduser(path)))
        return any(
            candidate == root or candidate.startswith(root + os.sep)
            for root in self.roots
        )

    def check_files(self, files: List[Any]) -> List[str]:
        """Return rejection messages for out-of-scope entries."""
        rejected = []
        for entry in files or []:
            path = entry.get("path") if isinstance(entry, dict) else entry
            if not path:
                rejected.append("entry without path")
            elif not self.is_allowed(str(path)):
                rejected.append(f"out of scope: {path}")
        return rejected

    def to_dict(self) -> Dict[str, Any]:
        return {"roots": list(self.roots), "restricted": bool(self.roots)}
