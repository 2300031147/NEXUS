import asyncio
import concurrent.futures
import json
import logging
import os
import subprocess
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# A mock Llama-server
class MockLlamaServerHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        response = {
            "choices": [
                {
                    "message": {
                        "content": "This is a mocked multi-agent response from LLaMa-server."
                    }
                }
            ]
        }
        self.wfile.write(json.dumps(response).encode())

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok", "slots": []}).encode())

    def log_message(self, format, *args):
        pass # suppress logs

def run_mock_llama_server():
    server = HTTPServer(('127.0.0.1', 8080), MockLlamaServerHandler)
    logging.info("Starting mock llama-server on 8080...")
    server.serve_forever()

def send_request(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'},
                                 method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        return f"Error: {e}"

def load_test():
    # Start mock llama server
    t_llama = threading.Thread(target=run_mock_llama_server, daemon=True)
    t_llama.start()
    
    # Start cluster server
    env = os.environ.copy()
    env["SWARM_MODE"] = "cluster"
    env["SWARM_PORT"] = "8000"
    p_cluster = subprocess.Popen(["python3", "cluster/cluster_server.py", "--port", "8000"], env=env)
    
    # Start a few agents
    p_agents = []
    for i in range(3):
        env_agent = os.environ.copy()
        env_agent["SWARM_MODE"] = "agent"
        env_agent["SWARM_PORT"] = str(8001 + i)
        p_agent = subprocess.Popen(["python3", "cluster/agent_server.py", "--port", str(8001 + i)], env=env_agent)
        p_agents.append(p_agent)
        
    time.sleep(3) # Wait for servers to start
    
    url = "http://127.0.0.1:8000/v1/cluster/discuss"
    payload = {"goal": "Discuss how to implement unified memory."}
    
    logging.info("Sending concurrent requests to cluster server...")
    start_t = time.time()
    
    # Fire requests concurrently
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(send_request, url, payload) for _ in range(5)]
        for i, future in enumerate(concurrent.futures.as_completed(futures)):
            res = future.result()
            logging.info(f"Request {i+1} completed. Result: {res[:100]}...")
            
    logging.info(f"Load test finished in {time.time() - start_t:.2f} seconds.")
    
    p_cluster.terminate()
    for p in p_agents:
        p.terminate()

if __name__ == "__main__":
    load_test()
