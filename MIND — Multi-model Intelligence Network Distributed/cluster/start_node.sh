#!/bin/bash
#
# SwarmCode Cluster Node starter: agent worker (default) or cluster server.
#
#   SWARM_MODE=agent ./start_node.sh     # FastAPI worker on SWARM_PORT
#   SWARM_MODE=cluster ./start_node.sh   # Cluster orchestrator on SWARM_PORT

# Default values
export SWARM_MODE=${SWARM_MODE:-"agent"}
export SWARM_ROLE=${SWARM_ROLE:-"coder"}
export SWARM_MODEL=${SWARM_MODEL:-"Llama-3-8B"}
export SWARM_PORT=${SWARM_PORT:-8000}
export SWARM_BACKEND_URL=${SWARM_BACKEND_URL:-"http://127.0.0.1:8080"}

echo "Starting SwarmCode Cluster Node..."
echo "Mode: $SWARM_MODE"
echo "Role: $SWARM_ROLE"
echo "Model: $SWARM_MODEL"
echo "Port: $SWARM_PORT"
echo "Backend: $SWARM_BACKEND_URL"

# Check if uvicorn is installed (needed for agent mode)
if [ "$SWARM_MODE" = "agent" ] && ! command -v uvicorn &> /dev/null
then
    echo "uvicorn could not be found, please run: pip install fastapi uvicorn"
    exit 1
fi

# Get the directory of the script and cd into it
cd "$(dirname "$0")"

if [ "$SWARM_MODE" = "cluster" ]; then
    exec python3 cluster_server.py \
        --port "$SWARM_PORT" \
        --backend-url "$SWARM_BACKEND_URL" \
        --model-name "$SWARM_MODEL" \
        --role "$SWARM_ROLE"
fi

# Run the API server which embeds the Cluster Daemon
exec python3 agent_server.py
