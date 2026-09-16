# NEXUS

## Multi-Model Intelligence Network with Tiered AI Memory

NEXUS is a modified `llama.cpp`-based local AI infrastructure designed to combine:

- **LLM inference on local hardware**
- **GPU VRAM + system RAM + NVMe SSD tiered KV cache**
- **TurboQuant KV-cache compression**
- **Multiple heterogeneous AI nodes**
- **Automatic peer discovery**
- **Multi-model collaboration and cross-verification**
- **OpenAI-compatible model serving**
- **Workspace-scoped project context**
- **A web-based AI interface**

The repository currently contains the core inference engine, memory extensions, cluster services, server components, UI, and the experimental TurboQuant+ research implementation.

> NEXUS is built as a modified fork of [llama.cpp](https://github.com/ggml-org/llama.cpp).

---

# 1. High-Level Architecture

NEXUS can be understood as four major layers:

```text
┌──────────────────────────────────────────────────────────────────┐
│                         NEXUS HOST / UI                           │
│                                                                  │
│  Web UI / IDE / Host Integration                                 │
│  ├── Chat                                                        │
│  ├── Files / Workspace                                           │
│  ├── Model Selection                                             │
│  ├── KV Cache Configuration                                      │
│  ├── MCP / Tools                                                 │
│  └── Cluster / Agent Controls                                    │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP / WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     CLUSTER / AGENT LAYER                        │
│                                                                  │
│  Python Cluster Services                                         │
│  ├── Node configuration                                          │
│  ├── Peer discovery                                              │
│  ├── Workspace scope                                             │
│  ├── Project context                                             │
│  └── Multi-model consensus engine                                │
│                                                                  │
│  C++ Swarm Support                                                │
│  └── UDP node discovery                                          │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               │ OpenAI-compatible API
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                      LLAMA SERVER LAYER                          │
│                                                                  │
│  llama-server                                                    │
│  ├── HTTP API                                                    │
│  ├── Request queue                                               │
│  ├── Server slots                                                │
│  ├── Batching                                                    │
│  ├── Streaming                                                   │
│  ├── MCP / tools                                                 │
│  ├── Model management                                            │
│  └── Cluster/swarm integration                                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     LLAMA INFERENCE CORE                          │
│                                                                  │
│  llama.cpp                                                        │
│  ├── Model loader                                                │
│  ├── Context                                                     │
│  ├── KV cache                                                    │
│  ├── Attention / graph                                           │
│  ├── Sampling                                                   │
│  ├── Quantization                                                │
│  └── Memory management                                           │
│                                                                  │
│              ┌───────────────────────────────┐                   │
│              │ NEXUS Memory Extensions      │                   │
│              │                               │                   │
│              │ SSD KV Swap                   │                   │
│              │ TurboQuant KV Compression     │                   │
│              │ Block indexing                │                   │
│              │ LRU eviction                  │                   │
│              └──────────────┬────────────────┘                   │
└─────────────────────────────┼────────────────────────────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │     Memory Hierarchy    │
                 │                         │
                 │ GPU VRAM                │
                 │      ↓                  │
                 │ System RAM              │
                 │      ↓                  │
                 │ NVMe SSD                │
                 └─────────────────────────┘
```

---

# 2. Core Design Philosophy

NEXUS is based on a different approach from conventional distributed inference systems.

Instead of splitting one model across multiple computers, the cluster architecture is designed so that:

```text
Machine A → Model A
Machine B → Model B
Machine C → Model C
Machine D → Model D
```

Each node can specialize in a different task.

For example:

```text
┌─────────────── NEXUS CLUSTER ────────────────┐

 Node A
 Qwen Coder
 Role: Coding
       │
       │
 Node B
 Llama
 Role: Architecture
       │
       │
 Node C
 DeepSeek
 Role: Review
       │
       │
 Node D
 Vision Model
 Role: Visual analysis

              ↓

       Consensus Engine

              ↓

       Unified Result
```

This makes the cluster a **team of different models**, rather than a distributed copy of the same model.

---

# 3. Repository Structure

The important architecture-related directories are:

```text
NEXUS/
└── MIND — Multi-model Intelligence Network Distributed/
    │
    ├── app/
    │   └── CLI/application entry points
    │
    ├── src/
    │   ├── llama.cpp
    │   ├── llama-context.cpp
    │   ├── llama-model.cpp
    │   ├── llama-kv-cache.cpp
    │   ├── llama-kv-swap.cpp
    │   ├── llama-kv-swap.h
    │   ├── llama-turboquant.cpp
    │   ├── llama-turboquant.h
    │   ├── llama-memory.cpp
    │   └── ...
    │
    ├── common/
    │   ├── common.cpp
    │   ├── arg.cpp
    │   ├── sampling.cpp
    │   ├── speculative.cpp
    │   └── ...
    │
    ├── tools/
    │   ├── server/
    │   │   ├── server.cpp
    │   │   ├── server-context.cpp
    │   │   ├── server-task.cpp
    │   │   ├── server-queue.cpp
    │   │   ├── server-stream.cpp
    │   │   ├── server-tools.cpp
    │   │   ├── server-mcp.cpp
    │   │   ├── server-swarm.cpp
    │   │   └── ...
    │   │
    │   └── ui/
    │       └── src/
    │           ├── components/
    │           ├── stores/
    │           ├── routes/
    │           └── ...
    │
    ├── cluster/
    │   ├── discovery.py
    │   ├── cluster_server.py
    │   ├── agent_server.py
    │   ├── cluster_daemon.py
    │   ├── consensus_engine.py
    │   ├── node_config.py
    │   ├── config.example.json
    │   └── start_node.sh
    │
    ├── ggml/
    │   └── Low-level tensor and backend engine
    │
    ├── turboquant_plus-main/
    │   ├── turboquant research implementation
    │   ├── benchmarks/
    │   ├── docs/
    │   ├── tests/
    │   └── research papers/notes
    │
    ├── conversion/
    ├── examples/
    ├── tests/
    ├── docs/
    ├── scripts/
    └── .devops/
```

---

# 4. Inference Engine

At the bottom of NEXUS is the `llama.cpp` inference engine.

The main components are:

```text
Application
    │
    ▼
common/
    │
    ▼
llama/
    │
    ├── Model
    ├── Context
    ├── Batch
    ├── KV Cache
    ├── Memory
    ├── Graph
    └── Sampling
    │
    ▼
ggml
    │
    ├── CPU
    ├── CUDA
    ├── Metal
    ├── Vulkan
    ├── HIP
    ├── SYCL
    ├── OpenCL
    └── other backends
```

The repository retains the broad hardware-backend architecture of `llama.cpp`.

---

# 5. NEXUS Tiered KV Cache

One of the main NEXUS modifications is the tiered KV-cache system.

The implementation is centered around:

```text
src/llama-kv-swap.h
src/llama-kv-swap.cpp
```

The cache is divided into three conceptual tiers:

```text
             HOT
        ┌─────────────┐
        │   GPU VRAM  │
        └──────┬──────┘
               │
               ▼
             WARM
        ┌─────────────┐
        │ System RAM  │
        └──────┬──────┘
               │
               ▼
             COLD
        ┌─────────────┐
        │   NVMe SSD  │
        └─────────────┘
```

The implementation defines:

```cpp
enum class llama_kv_block_loc {
    HOT_VRAM,
    WARM_RAM,
    COLD_SSD
};
```

---

# 6. KV Block Management

The cache is managed in blocks rather than treating the complete KV cache as one monolithic allocation.

A block contains metadata such as:

```text
Block ID
├── Sequence ID
├── Starting position
└── Token count

Location
├── VRAM
├── RAM
└── SSD

Storage
├── Cell start
├── SSD slot
├── RAM pointer
└── Stream ID

Management
├── Access timestamp
└── Dirty state

Indexing
└── Token signature
```

The default KV swap block size is:

```text
32 tokens
```

---

# 7. LRU Eviction

When the hot/warm memory tiers become constrained, NEXUS can evict KV blocks using an LRU-style mechanism.

Conceptually:

```text
KV Cache

Block A ─ recently used
Block B ─ recently used
Block C ─ old
Block D ─ very old
               │
               ▼
          LRU Selection
               │
               ▼
        Block D → SSD
```

The tiered manager maintains:

```text
lru_list
lru_map
warm_ram_list
warm_ram_map
```

This allows blocks to move between memory tiers while maintaining their metadata.

---

# 8. Conditional SSD Recall

NEXUS also contains a lightweight token-based block index.

Each block can maintain a token signature consisting of:

```text
64-bit Bloom filter
+
Exact token list
```

When a new query arrives:

```text
Query tokens
      │
      ▼
Token signature matching
      │
      ├── No likely match
      │       ↓
      │   Avoid SSD I/O
      │
      └── Likely match
              ↓
        Recall block
              │
              ▼
          SSD → RAM
```

This is intended to prevent unnecessary SSD operations when cold KV blocks are unlikely to be relevant.

---

# 9. KV Storage Engines

The KV swap subsystem defines several I/O modes:

```text
POSIX_ALIGNED
    │
    └── 4 KB aligned file I/O

PINNED_DMA
    │
    └── Pinned host memory + DMA-oriented transfers

GPU_DIRECT
    │
    └── Direct GPU/NVMe path where supported
```

The code also performs drive discovery and validation.

It can identify:

- device
- mount path
- filesystem
- total capacity
- free capacity
- SSD status

---

# 10. KV State Persistence

The tiered KV manager provides state persistence:

```text
KV cache
   │
   ├── Block metadata
   ├── SSD slot allocation
   └── Token signatures
           │
           ▼
       metadata file
```

The manager exposes:

```cpp
save_state()
load_state()
```

This allows the storage metadata to survive beyond a single in-memory manager lifetime.

---

# 11. TurboQuant Integration

NEXUS also integrates TurboQuant-oriented KV compression.

Relevant components include:

```text
src/llama-turboquant.cpp
src/llama-turboquant.h
```

The tiered manager accepts separate compression modes for:

```text
K cache
V cache
```

For example:

```text
K → Turbo4
V → Turbo2
```

The code therefore supports asymmetric K/V compression.

Conceptually:

```text
                 KV Cache
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
       K Cache             V Cache
          │                   │
          ▼                   ▼
      TurboQuant          TurboQuant
       setting              setting
          │                   │
          ▼                   ▼
       Storage             Storage
```

The CLI exposes:

```text
--turboquant-k
--turboquant-v
```

with supported levels including:

```text
turbo4
turbo3
turbo2
none
```

---

# 12. Why KV Compression and SSD Tiering Are Combined

The architecture effectively creates two independent ways of extending usable KV capacity:

```text
             KV Cache
                │
       ┌────────┴────────┐
       │                 │
       ▼                 ▼
 Compression          Tiering
       │                 │
       ▼                 ▼
Fewer bytes/token   More storage capacity
       │                 │
       └────────┬────────┘
                ▼
        Larger practical
         memory capacity
```

TurboQuant reduces the amount of memory required per KV element.

SSD tiering allows cold blocks to leave RAM entirely.

---

# 13. Important KV-Cache Configuration

The common argument parser adds options including:

```text
--kv-swap-path
--kv-swap-drive
--kv-swap-size
--kv-swap-ram
--turboquant-k
--turboquant-v
```

The system also contains block-size and engine configuration.

When SSD KV swapping is active, GPU KV offloading is disabled in the relevant configuration path so the tiered manager can manage the KV data from host memory.

Conceptually:

```text
Normal configuration:

GPU
└── Model + KV Cache


SSD KV mode:

GPU
└── Model
    │
    └── Attention operations

RAM
└── Hot/Warm KV

SSD
└── Cold KV
```

---

# 14. Context-Length Safety

One important modification addresses automatic context sizing.

A naive calculation based only on:

```text
SSD capacity + RAM capacity
```

could produce a context size much larger than the model's trained context.

For example:

```text
Available KV storage
        ↓
Calculated n_ctx
        ↓
Hundreds of thousands of tokens
        ↓
GPU compute buffers sized for enormous context
        ↓
OOM / allocation failure
```

NEXUS caps automatically calculated context size against the model's training context.

Conceptually:

```text
n_ctx_auto
     │
     ▼
Compare with n_ctx_train
     │
     ▼
min(n_ctx_auto, n_ctx_train)
```

This separates:

```text
larger storage capacity
```

from:

```text
larger model-native context length
```

---

# 15. llama-server

The server layer is located primarily under:

```text
tools/server/
```

Important components include:

```text
server.cpp
server-context.cpp
server-task.cpp
server-queue.cpp
server-stream.cpp
server-models.cpp
server-tools.cpp
server-mcp.cpp
server-swarm.cpp
```

The server provides:

- HTTP API
- OpenAI-compatible chat completions
- request processing
- batching
- streaming
- model management
- tool calling
- MCP support
- embeddings/reranking-related APIs
- cluster/swarm functionality

---

# 16. Server Request Flow

A typical request follows:

```text
Client
  │
  ▼
HTTP API
  │
  ▼
Server HTTP Layer
  │
  ▼
Task / Request Queue
  │
  ▼
Server Context
  │
  ▼
Batch Construction
  │
  ▼
llama_context
  │
  ▼
KV Cache
  │
  ▼
GGML Graph
  │
  ▼
CPU / GPU Backend
  │
  ▼
Generated Tokens
  │
  ▼
Streaming / JSON Response
```

---

# 17. Server Slots

The server maintains independent request slots with states such as:

```text
IDLE
  ↓
WAIT_OTHER
  ↓
STARTED
  ↓
PROCESSING_PROMPT
  ↓
DONE_PROMPT
  ↓
GENERATING
```

This enables multiple requests to share the model context infrastructure.

The KV-cache extensions integrate into this slot/sequence architecture.

---

# 18. Native C++ Swarm Layer

NEXUS contains a C++ swarm implementation:

```text
tools/server/server-swarm.h
tools/server/server-swarm.cpp
```

The main abstraction is:

```cpp
SwarmNode
```

Each node advertises:

```text
node_id
IP
HTTP port
role
model
```

The C++ implementation uses UDP multicast discovery.

The discovery group is:

```text
224.0.0.111
```

and the discovery port is:

```text
52415
```

The beacon contains a structure conceptually similar to:

```json
{
  "magic": "SWARM",
  "node_id": "...",
  "role": "...",
  "port": 8080,
  "model": "..."
}
```

---

# 19. Python Cluster Architecture

The repository also contains a higher-level Python cluster subsystem:

```text
cluster/
```

The major components are:

```text
discovery.py
node_config.py
cluster_server.py
agent_server.py
cluster_daemon.py
consensus_engine.py
```

---

# 20. Node Discovery

`cluster/discovery.py` implements automatic heterogeneous-node discovery.

Each node advertises information including:

```text
Node ID
Hostname
API address
API port
Model name
Role
VRAM
RAM
SSD swap capacity
Maximum context
Tags
```

Discovery uses:

```text
UDP multicast
UDP broadcast
```

The primary multicast endpoint is:

```text
224.0.0.111:52415
```

Nodes periodically send heartbeats.

A peer is considered inactive after its configured timeout.

---

# 21. Node Identity

The node configuration layer can probe the local llama-compatible backend.

It checks endpoints such as:

```text
/health
/props
/v1/models
```

This allows the cluster node to determine which model the backend is actually serving.

The advertised node therefore contains information such as:

```text
Hostname
Model
Backend URL
Context size
Role
Memory capacity
```

---

# 22. Workspace Security Boundary

NEXUS contains a workspace-scope mechanism.

A user can grant specific folders:

```text
Workspace
├── project-a/
├── project-b/
└── ...
```

The scope system normalizes paths and checks whether ingested files fall inside the allowed roots.

Conceptually:

```text
User grants:

/home/user/projects/my-app

             │
             ▼

       WorkspaceScope
             │
      ┌──────┴──────┐
      │             │
 inside scope   outside scope
      │             │
      ▼             ▼
   accepted       rejected
```

Out-of-scope ingestion requests are rejected with HTTP `403`.

This creates an explicit boundary around which workspace files may be provided to the model cluster.

---

# 23. Project Context

The cluster server maintains an active project context consisting primarily of:

```json
{
  "summary": "...",
  "files": []
}
```

The context can be:

```text
Ingested
   ↓
Validated against workspace scope
   ↓
Stored as active project context
   ↓
Provided to collaborative model calls
```

---

# 24. Multi-Model Consensus Engine

The central collaborative component is:

```text
cluster/consensus_engine.py
```

Its main abstraction is:

```python
MultiModelConsensusEngine
```

The architecture is iterative rather than simply asking one model for an answer.

```text
                    User Task
                       │
                       ▼
                Project Context
                       │
                       ▼
              ┌─────────────────┐
              │ Active AI Nodes │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Model A       Model B      Model C
          │            │            │
          └────────────┼────────────┘
                       ▼
                 Initial Proposals
                       │
                       ▼
               Cross Verification
                       │
             ┌─────────┴─────────┐
             │                   │
          Problems             Approved
             │                   │
             ▼                   ▼
       Revision/Synthesis       Finish
             │
             ▼
        Verify Again
             │
             └───────────►
```

---

# 25. Consensus Pipeline

The implemented consensus process has three major stages.

## Stage 1 — Proposal

Every active node is asked to analyze the project and produce a proposal.

Each model can receive role-specific instructions.

For example:

```text
Node A
Role: Coder

Node B
Role: Architect

Node C
Role: Reviewer

Node D
Role: Security
```

Each contributes independently.

---

## Stage 2 — Cross Verification

The generated proposal is sent to the participating models for review.

Reviewers are asked to identify:

```text
Bugs
Syntax problems
Edge cases
Regressions
Architectural flaws
```

Each reviewer returns an approval status and issues/corrections.

The engine treats malformed or ambiguous review responses conservatively rather than automatically considering them approved.

---

## Stage 3 — Revision

If any reviewer rejects the proposal:

```text
Proposal
   │
   ▼
Reviewer feedback
   │
   ▼
Lead Architect
   │
   ▼
Revised proposal
   │
   ▼
New verification round
```

The current implementation permits up to:

```text
4 verification rounds
```

If all reviewers approve, the result is marked:

```text
APPROVED_BY_CLUSTER
```

If verification rounds are exhausted while objections remain, the result is:

```text
NEEDS_REVIEW
```

This distinction is important: the implementation does not treat an exhausted verification loop as successful consensus.

---

# 26. Consensus Output

The resulting plan contains information such as:

```text
Title
Status
Participating nodes
Models
Memory information
Verification rounds
Discussion transcript
Tasks
```

The generated task structure associates tasks with participating nodes/models.

---

# 27. Agent Server

`cluster/agent_server.py` provides a FastAPI-based agent interface.

Important endpoints include:

```text
GET  /v1/node/info
GET  /v1/cluster/peers

POST /v1/agent/discuss
POST /v1/chat/completions
POST /v1/agent/plan

WS   /v1/cluster/stream
```

The agent server can proxy chat requests toward the local llama backend while exposing higher-level collaborative operations.

---

# 28. Cluster Server API

The native Python cluster service exposes the host API described by:

```text
cluster/HOST_API.md
```

Important endpoints include:

```text
GET  /v1/node/info
GET  /v1/node/status

GET  /v1/cluster/peers
GET  /v1/cluster/topology
GET  /v1/cluster/context
GET  /v1/cluster/scope

POST /v1/cluster/scope
POST /v1/cluster/ingest

POST /v1/cluster/collaborate
POST /v1/cluster/discuss
```

---

# 29. Cluster Topology

A topology response combines:

```text
Local node
    +
Backend information
    +
Discovered nodes
    +
Workspace scope
```

This provides a host application with a complete view of the current NEXUS environment.

---

# 30. Host API Architecture

The intended host integration is explicitly separated from the cluster service.

```text
┌───────────────────────────┐
│        Host / IDE         │
│                           │
│  UI / panels / controls   │
└─────────────┬─────────────┘
              │
              │ swarm-host/1
              ▼
┌───────────────────────────┐
│     NEXUS Cluster API     │
│                           │
│  topology                 │
│  peers                    │
│  scope                    │
│  ingest                   │
│  collaborate              │
└─────────────┬─────────────┘
              │
              ▼
       AI model nodes
```

The cluster service acts as the source of truth for cluster state.

---

# 31. Web UI

The repository contains a substantial Svelte-based UI under:

```text
tools/ui/src/
```

The UI includes components for:

```text
Chat
├── Messages
├── Input
├── Attachments
├── Tools
├── MCP resources
├── Model selection
├── Context gauge
└── Working directory

Settings
├── Model configuration
├── KV swap configuration
├── TurboQuant configuration
└── Other inference parameters
```

The UI communicates with the server API rather than directly implementing inference.

---

# 32. KV Settings in the UI

The UI has explicit configuration support for the NEXUS KV extensions.

Relevant settings include:

```text
KV swap drive
KV swap SSD size
KV swap RAM size
KV swap block size
KV swap engine
TurboQuant K
TurboQuant V
```

The settings store can synchronize these values to the server.

---

# 33. Complete End-to-End Request

A collaborative coding request can conceptually travel through NEXUS like this:

```text
User
 │
 ▼
NEXUS Host / UI
 │
 │ project files
 │ task
 ▼
Workspace Scope
 │
 ▼
Project Context
 │
 ▼
Cluster Discovery
 │
 ├───────────────┐
 ▼               ▼
Node A          Node B
Model A         Model B
 │               │
 └──────┬────────┘
        ▼
  Initial proposals
        │
        ▼
 Cross-model review
        │
        ▼
  Revision loop
        │
        ▼
 Cluster result
        │
        ▼
 Host / UI
        │
        ▼
 User
```

---

# 34. Inference + Tiered Memory Flow

For a normal inference request:

```text
Prompt
  │
  ▼
llama-server
  │
  ▼
llama_context
  │
  ▼
KV cache
  │
  ├── HOT
  │    GPU / active memory
  │
  ├── WARM
  │    RAM
  │
  └── COLD
       SSD
        │
        ▼
    KV recall
        │
        ▼
     Attention
        │
        ▼
    Next token
```

---

# 35. Multi-Node + Tiered Memory

The larger NEXUS architecture combines the two systems:

```text
                     NEXUS
                       │
            ┌──────────┴──────────┐
            │                     │
       Distributed            Tiered Memory
        Intelligence                │
            │                 ┌─────┼─────┐
            │                 ▼     ▼     ▼
            │                VRAM  RAM   SSD
            │
     ┌──────┼──────────────┐
     │      │              │
     ▼      ▼              ▼
   Node A  Node B        Node C
   Model A Model B       Model C
     │      │              │
     └──────┼──────────────┘
            ▼
       Consensus Engine
            │
            ▼
       Unified Result
```

This is the central architectural idea of NEXUS.

---

# 36. TurboQuant Research Subsystem

The repository also contains:

```text
turboquant_plus-main/
```

This is a research-oriented implementation and experimentation area.

It contains:

```text
benchmarks/
docs/
tests/
research papers/
experiments/
```

The research architecture combines:

```text
PolarQuant
     +
Walsh-Hadamard / random rotation
     +
QJL / residual quantization
     ↓
Compressed KV representation
```

The research directory is more experimental than the production inference path.

---

# 37. Hardware Abstraction

Because NEXUS inherits the GGML/llama.cpp architecture, computation can be dispatched to different backends.

The repository contains support/configuration for several backends, including:

```text
CPU
CUDA
Metal
Vulkan
HIP
SYCL
OpenCL
BLAS
CANN
MUSA
OpenVINO
ZenDNN
zDNN
```

Therefore the architecture is approximately:

```text
                llama.cpp
                    │
                  GGML
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
      CPU          CUDA        Metal
       │            │            │
       ▼            ▼            ▼
     x86/ARM      NVIDIA      Apple
```

---

# 38. Build System

The primary build system is CMake.

Important files include:

```text
CMakeLists.txt
CMakePresets.json
Makefile
```

The server target incorporates the swarm source:

```text
tools/server/server-swarm.cpp
```

The inference library incorporates:

```text
src/llama-kv-swap.cpp
src/llama-turboquant.cpp
```

---

# 39. Example Node Configuration

The repository provides:

```text
cluster/config.example.json
```

A node can specify:

```json
{
  "node_role": "coder",
  "node_model": "Qwen-2.5-Coder-32B",
  "http_port": 8000,
  "llama_server_path": "../build/bin/llama-server",
  "llama_model_path": "../../models/qwen2.5-coder-32b-q4_k_m.gguf",
  "tiered_cache": {
    "ssd_enabled": true,
    "ram_enabled": true,
    "nvme_path": "/mnt/nvme0n1/llama_cache"
  }
}
```

This represents the intended relationship between:

```text
Node
 ├── Role
 ├── Model
 ├── llama-server
 └── Tiered KV storage
```

---

# 40. Starting a Cluster Node

The repository contains:

```text
cluster/start_node.sh
```

The script supports modes including:

```text
agent
cluster
```

Relevant environment variables include:

```text
SWARM_MODE
SWARM_ROLE
SWARM_MODEL
SWARM_PORT
SWARM_BACKEND_URL
```

A typical architecture is:

```text
start_node.sh
       │
       ▼
Python cluster service
       │
       ▼
Local llama-server
       │
       ▼
Local model
```

---

# 41. Security Model

The repository includes several useful security boundaries, particularly around workspace access.

The main principle is:

```text
User explicitly grants workspace
            │
            ▼
       Scope checker
            │
       ┌────┴────┐
       ▼         ▼
    allowed    rejected
       │
       ▼
 Project context
```

The cluster API also exposes CORS headers and proxies requests to the local llama backend.

For production/networked deployment, authentication, authorization, encryption, and stronger node authentication should be treated as separate deployment concerns.

---

# 42. Important Architectural Distinction

NEXUS contains **two related swarm/discovery implementations**:

### C++ server swarm

```text
tools/server/server-swarm.*
```

This is integrated into the llama server side and provides lightweight UDP-based peer discovery.

### Python cluster system

```text
cluster/
```

This provides the higher-level functionality:

```text
Node configuration
Discovery
Workspace scope
Project ingestion
Agent API
Consensus
Planning
```

They should not be interpreted as identical layers.

The Python subsystem currently provides the richer multi-model orchestration functionality.

---

# 43. Data Ownership

A simplified ownership model is:

```text
GGML
└── Tensor computation

llama.cpp
└── Model / context / KV cache

NEXUS KV layer
└── Tiered KV storage and compression

llama-server
└── API / scheduling / inference requests

Cluster layer
└── Nodes / workspace / collaboration

UI / Host
└── User interaction
```

This separation is important when extending the system.

---

# 44. Where to Modify the Project

## Add or modify KV-cache behavior

Start with:

```text
src/llama-kv-cache.cpp
src/llama-kv-cache.h
src/llama-kv-swap.cpp
src/llama-kv-swap.h
```

## Modify TurboQuant

Look at:

```text
src/llama-turboquant.cpp
src/llama-turboquant.h
turboquant_plus-main/
```

## Add CLI configuration

Modify:

```text
common/arg.cpp
```

## Modify server behavior

Look at:

```text
tools/server/server.cpp
tools/server/server-context.cpp
tools/server/server-task.cpp
```

## Modify cluster discovery

Look at:

```text
cluster/discovery.py
cluster/node_config.py
```

and the C++ implementation:

```text
tools/server/server-swarm.cpp
```

## Modify multi-model reasoning

Start with:

```text
cluster/consensus_engine.py
```

## Modify host/agent API

Look at:

```text
cluster/cluster_server.py
cluster/agent_server.py
cluster/HOST_API.md
```

## Modify UI

Start under:

```text
tools/ui/src/
```

---

# 45. Architectural Summary

NEXUS can be summarized as:

```text
                  ┌─────────────────────┐
                  │       USER          │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │    HOST / UI        │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │  CLUSTER SERVICES    │
                  │                     │
                  │ Discovery           │
                  │ Workspace Scope     │
                  │ Project Context     │
                  │ Consensus           │
                  └──────────┬──────────┘
                             │
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
         AI Node A       AI Node B        AI Node C
         Model A         Model B          Model C
             │               │                │
             ▼               ▼                ▼
       ┌──────────────────────────────────────────┐
       │              llama.cpp                   │
       │                                          │
       │ Model → Context → KV → GGML → Backend  │
       └───────────────────┬──────────────────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │   NEXUS KV Layer    │
                 │                     │
                 │  TurboQuant         │
                 │       +             │
                 │  LRU Tiering        │
                 └─────────┬───────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
            VRAM          RAM          NVMe
            HOT          WARM          COLD
```

## In one sentence

**NEXUS extends llama.cpp into a local AI infrastructure where different models can operate as collaborative nodes while each inference engine uses compressed and tiered KV memory across GPU VRAM, system RAM, and NVMe storage.**

---

# 46. Project Status Notes

The repository combines multiple development layers:

```text
Stable/base infrastructure
        │
        ├── llama.cpp
        ├── GGML
        └── llama-server
                 │
                 ▼
NEXUS extensions
        │
        ├── SSD KV swap
        ├── Tiered memory
        ├── TurboQuant integration
        └── Swarm functionality
                 │
                 ▼
Experimental / research
        │
        └── turboquant_plus-main
```

The architecture should therefore be treated as a **research/engineering fork with experimental components**, rather than assuming every subsystem has the same maturity or production-readiness.

---

# 47. Recommended Development Order

For developers entering the codebase, the most useful reading order is:

```text
1. README.md
      ↓
2. src/llama-context.*
      ↓
3. src/llama-kv-cache.*
      ↓
4. src/llama-kv-swap.*
      ↓
5. src/llama-turboquant.*
      ↓
6. tools/server/server-context.*
      ↓
7. tools/server/server.cpp
      ↓
8. cluster/discovery.py
      ↓
9. cluster/node_config.py
      ↓
10. cluster/consensus_engine.py
      ↓
11. cluster/cluster_server.py
      ↓
12. tools/ui/src/
```

This follows the architecture from:

```text
Inference core
    ↓
Memory subsystem
    ↓
Server
    ↓
Distributed intelligence
    ↓
User interface
```

---

## License

NEXUS is a modified fork of `llama.cpp`.

The original `llama.cpp` project and its applicable components are distributed under the MIT License. Refer to the repository's `LICENSE`, `AUTHORS`, and third-party license files for the exact licensing and attribution requirements of the complete tree.

Original project:

https://github.com/ggml-org/llama.cpp