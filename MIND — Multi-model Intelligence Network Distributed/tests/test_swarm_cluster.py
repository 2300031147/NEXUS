"""
Validation and Test Suite for Swarm Multi-Model Cluster.
Tests:
1. UDP Multicast/Broadcast auto-discovery between heterogeneous laptop nodes
2. Multi-model workspace ingestion
3. Cross-model code review and zero-error iterative consensus
4. Plan formulation and task partitioning
"""

import asyncio
import os
import sys
import time
import unittest

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from cluster.discovery import SwarmDiscovery, SwarmNodeInfo
from cluster.consensus_engine import MultiModelConsensusEngine


class TestSwarmCluster(unittest.TestCase):
    def test_udp_discovery_and_peer_registration(self):
        """Test that multiple laptop nodes discover each other automatically via UDP."""
        # Node 1 (Laptop A - Coder)
        node1_info = SwarmNodeInfo(
            node_id="laptop-alpha",
            hostname="MacBook-Pro-M3",
            api_host="192.168.1.101",
            api_port=8091,
            model_name="Qwen-2.5-Coder-32B",
            role_description="Lead Architecture & Core Implementation",
            vram_gb=18.0,
            ram_gb=36.0,
            ssd_swap_gb=128.0,
            max_context=131072
        )

        # Node 2 (Laptop B - Reviewer & QA)
        node2_info = SwarmNodeInfo(
            node_id="laptop-beta",
            hostname="ThinkPad-X1-Linux",
            api_host="192.168.1.102",
            api_port=8092,
            model_name="DeepSeek-R1-Distill-70B",
            role_description="Logic Reviewer & Security Verifier",
            vram_gb=8.0,
            ram_gb=32.0,
            ssd_swap_gb=256.0,
            max_context=65536
        )

        discovered_by_1 = []
        discovered_by_2 = []

        disc1 = SwarmDiscovery(node1_info, discovery_port=52419, on_peer_discovered=lambda p: discovered_by_1.append(p))
        disc2 = SwarmDiscovery(node2_info, discovery_port=52419, on_peer_discovered=lambda p: discovered_by_2.append(p))

        try:
            disc1.start()
            disc2.start()

            # Wait for beacons to exchange
            time.sleep(3.0)

            peers_of_1 = disc1.get_active_peers()
            peers_of_2 = disc2.get_active_peers()

            self.assertGreaterEqual(len(peers_of_1), 1, "Node 1 should have peer records")
            self.assertGreaterEqual(len(peers_of_2), 1, "Node 2 should have peer records")

            print(f"✅ Discovery Test Passed! Node 1 peers: {len(peers_of_1)}, Node 2 peers: {len(peers_of_2)}")

        finally:
            disc1.stop()
            disc2.stop()

    def test_multi_model_zero_error_consensus(self):
        """Test that multiple models iterate through review until reaching zero errors and unanimous plan."""
        nodes = [
            {
                "node_id": "laptop-1",
                "hostname": "Alienware-Laptop",
                "api_url": "http://127.0.0.1:8090",
                "model_name": "Qwen-Coder-32B",
                "memory": {"ram_gb": 32, "ssd_swap_gb": 128}
            },
            {
                "node_id": "laptop-2",
                "hostname": "MacStudio-M2",
                "api_url": "http://127.0.0.1:8091",
                "model_name": "Llama-3.3-70B",
                "memory": {"ram_gb": 64, "ssd_swap_gb": 256}
            }
        ]

        engine = MultiModelConsensusEngine(local_node_info=nodes[0])

        project_ctx = {
            "summary": "SwarmCode Multi-Agent IDE Workspace",
            "files": [
                {"path": "src/main.ts", "size": 1024},
                {"path": "src/cluster.ts", "size": 2048}
            ]
        }

        loop = asyncio.new_event_loop()
        plan = loop.run_until_complete(
            engine.run_collaborative_discussion_and_plan(
                project_context=project_ctx,
                user_prompt="Refactor cluster communication into a zero-error peer-to-peer mesh",
                active_peers=nodes
            )
        )
        loop.close()

        self.assertEqual(plan["status"], "APPROVED_BY_CLUSTER")
        self.assertGreaterEqual(plan["consensus_score"], 0.95)
        self.assertGreaterEqual(len(plan["tasks"]), 2)
        self.assertGreaterEqual(len(plan["discussion_transcript"]), 2)

        print(f"✅ Multi-Model Zero-Error Consensus Test Passed! Tasks: {len(plan['tasks'])}, Rounds: {plan['rounds_to_zero_error']}")

    def test_http_api_endpoints(self):
        """Test HTTP server endpoints (/v1/node/info, /v1/cluster/peers, /v1/cluster/ingest)."""
        import threading
        import urllib.request
        import json
        from cluster.cluster_server import SwarmNodeService

        service = SwarmNodeService(
            hostname="Test-Laptop",
            api_port=9998,
            model_name="Qwen-Test-Model",
            ram_gb=16.0,
            ssd_swap_gb=64.0
        )

        t = threading.Thread(target=service.start, daemon=True)
        t.start()
        time.sleep(1.0)

        try:
            # Test GET /v1/node/info
            with urllib.request.urlopen("http://127.0.0.1:9998/v1/node/info", timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(data.get("hostname"), "Test-Laptop")
                self.assertEqual(data.get("model_name"), "Qwen-Test-Model")

            # Test POST /v1/cluster/ingest
            ingest_payload = json.dumps({"files": [{"path": "main.py", "size": 500}]}).encode("utf-8")
            req = urllib.request.Request(
                "http://127.0.0.1:9998/v1/cluster/ingest",
                data=ingest_payload,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(data.get("status"), "success")
                self.assertEqual(data.get("file_count"), 1)

            print("✅ Swarm Node HTTP API Test Passed!")

        finally:
            service.discovery.stop()


if __name__ == "__main__":
    unittest.main()
