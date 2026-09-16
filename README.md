# NEXUS --- Local Multi-AI Agents

> **NEXUS** is a local, heterogeneous multi-model AI infrastructure
> designed to power **SwarmCode**, an AI-native VS Code development
> environment.
>
> Different machines in the cluster can run different AI models. NEXUS
> discovers these nodes, routes work according to model capabilities,
> provides long-context memory through VRAM/RAM/NVMe tiers, coordinates
> multi-agent collaboration, and verifies results through cross-model
> review.

------------------------------------------------------------------------

## Overview

NEXUS is built around a simple idea:

``` text
                    ┌─────────────────────────┐
                    │       SWARMCODE         │
                    │   AI-Native VS Code     │
                    └────────────┬────────────┘
                                 │
                         NEXUS / MIND
                       Orchestration Layer
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
     Model Node A           Model Node B           Model Node C
     Coding Model           Reasoning Model        Review Model
          │                      │                      │
          ▼                      ▼                      ▼
       llama.cpp             llama.cpp             llama.cpp
          │                      │                      │
       VRAM/RAM/SSD          VRAM/RAM/SSD          VRAM/RAM/SSD
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 ▼
                        Multi-Model Review
                                 │
                                 ▼
                       Verified Development
```

Unlike a traditional inference cluster where every server runs the same
model, NEXUS is designed as a **heterogeneous model network**.

For example:

``` text
Node 01 → Qwen Coder      → Code generation
Node 02 → DeepSeek        → Architecture / reasoning
Node 03 → Llama           → Review
Node 04 → Security model  → Security analysis
Node 05 → Small model     → Fast utility tasks
```

The model is therefore selected according to the task and available
capabilities rather than being hard-coded into the IDE.

------------------------------------------------------------------------

# Core Goals

NEXUS combines several systems into one local AI platform:

-   Local LLM inference through `llama.cpp`
-   Heterogeneous multi-model clustering
-   Automatic node discovery
-   Model and capability discovery
-   Multi-agent planning and collaboration
-   Cross-model verification and consensus
-   VRAM → RAM → NVMe context/KV tiering
-   TurboQuant KV compression
-   Workspace-aware AI context
-   IDE filesystem and Git integration
-   Tool execution through a controlled Tool Gateway
-   VS Code-native AI workbench through SwarmCode
-   Human approval before applying code changes
-   Local-first operation without requiring a cloud AI provider

------------------------------------------------------------------------

# Project Architecture

The repository contains two major systems:

``` text
NEXUS-Local-Multi-Ai-agents/
│
├── MIND — Multi-model Intelligence Network Distributed/
│   │
│   ├── llama.cpp
│   ├── GGML
│   ├── KV memory / SSD swap
│   ├── TurboQuant
│   ├── llama-server
│   │
│   ├── cluster/
│   │   ├── discovery.py
│   │   ├── node_config.py
│   │   ├── cluster_daemon.py
│   │   ├── cluster_server.py
│   │   ├── agent_server.py
│   │   └── consensus_engine.py
│   │
│   └── tools/server/
│       ├── server.cpp
│       ├── server-context.cpp
│       ├── server-task.cpp
│       ├── server-queue.cpp
│       ├── server-stream.cpp
│       ├── server-tools.cpp
│       ├── server-mcp.cpp
│       └── server-swarm.cpp
│
└── SwarmCode/
    │
    ├── VS Code workbench
    │
    ├── src/vs/workbench/contrib/swarmcode/
    │   ├── common/
    │   └── browser/
    │
    └── extensions/swarmcode/
        ├── nexusClient.ts
        ├── contextEngine.ts
        ├── toolGateway.ts
        ├── taskManager.ts
        ├── gitBridge.ts
        ├── discovery/
        ├── orchestrator/
        └── views/
```

------------------------------------------------------------------------

# 1. MIND / NEXUS Backend

The MIND layer is the distributed intelligence and inference
infrastructure.

It is responsible for:

-   Model serving
-   Node discovery
-   Cluster management
-   Agent coordination
-   Context management
-   Task planning
-   Multi-model collaboration
-   Consensus and verification
-   KV-cache memory management

------------------------------------------------------------------------

# 2. Heterogeneous Model Nodes

Each server is an independent inference node.

A node can run its own model:

``` text
┌─────────────────────────────────────┐
│ NEXUS Node                          │
├─────────────────────────────────────┤
│ Model: Qwen / Llama / DeepSeek / ...│
│ Backend: llama.cpp                  │
│ Context: node-specific              │
│ VRAM: node-specific                 │
│ RAM: node-specific                  │
│ SSD: node-specific                  │
│ Capabilities: node-specific         │
└─────────────────────────────────────┘
```

Nodes expose information such as:

-   Node ID
-   Hostname
-   API address
-   API port
-   Model
-   Backend
-   VRAM
-   RAM
-   SSD capacity
-   Maximum context
-   Capabilities
-   Tags
-   Role

The cluster can probe local inference servers using endpoints such as:

``` text
/health
/props
/v1/models
```

This allows NEXUS to determine what is actually available instead of
assuming that all nodes run the same model.

------------------------------------------------------------------------

# 3. Capability-Based Model Routing

NEXUS is designed around:

``` text
Task
  ↓
Required capabilities
  ↓
Available nodes
  ↓
Model selection
  ↓
Execution
```

Example:

``` text
"Design the architecture"
        ↓
reasoning + architecture
        ↓
DeepSeek-capable node
```

``` text
"Implement the API"
        ↓
code_generation + code_editing
        ↓
coding-capable node
```

``` text
"Review authentication security"
        ↓
security_analysis + code_review
        ↓
security/reviewer node
```

This allows the cluster to evolve without requiring changes in SwarmCode
whenever a model is replaced.

------------------------------------------------------------------------

# 4. Multi-Agent Collaboration

A task can be distributed across multiple specialized agents.

Example:

``` text
User
 │
 ▼
Planner / Architect
 │
 ├──────────────┐
 ▼              ▼
Coder          Security
 │              │
 ▼              ▼
Tests         Review
 │              │
 └───────┬──────┘
         ▼
   Consensus / Verification
         │
         ▼
    Final Proposal
```

Agents can have different responsibilities and different underlying
models.

Typical roles include:

-   Architect
-   Coder
-   Debugger
-   Tester
-   Reviewer
-   Security reviewer
-   Researcher
-   Documentation agent

------------------------------------------------------------------------

# 5. Consensus and Verification

NEXUS includes a multi-model consensus engine.

The general flow is:

``` text
Independent proposals
        ↓
Cross-model verification
        ↓
Issues found?
   ┌────┴────┐
   │         │
  YES        NO
   │         │
Revision     │
   │         │
   └────┬────┘
        ▼
  Verification
        ↓
   Final result
```

The system does not treat an unavailable backend or timeout as an
approval.

Verification can therefore produce states such as:

``` text
APPROVED
NEEDS_REVIEW
REJECTED
```

The goal is not simply to ask the same model repeatedly, but to use
**different models with different reasoning characteristics** as
independent participants.

------------------------------------------------------------------------

# 6. Context and Memory System

NEXUS extends model context beyond GPU VRAM.

The KV memory hierarchy is:

``` text
HOT
VRAM
 │
 ▼
WARM
System RAM
 │
 ▼
COLD
NVMe SSD
```

This allows context/KV data to be moved between storage tiers depending
on availability and usage.

The system includes:

-   KV block management
-   LRU-based management
-   SSD-backed KV storage
-   Persistent KV metadata
-   Token-based block indexing
-   Configurable swap block size
-   Multiple I/O strategies
-   State save/load support

The core idea is:

``` text
GPU VRAM
    ↓
fastest / active context

RAM
    ↓
warm context

NVMe SSD
    ↓
cold / overflow context
```

This is especially useful for local systems where GPU memory is the
primary constraint.

------------------------------------------------------------------------

# 7. TurboQuant

NEXUS integrates TurboQuant-based KV compression.

Configuration supports different compression levels, including:

``` text
turbo4
turbo3
turbo2
none
```

The purpose is to reduce KV memory requirements while allowing larger
effective contexts.

The exact memory/performance tradeoff depends on the model, hardware,
context size, and compression level.

------------------------------------------------------------------------

# 8. Swarm Discovery

NEXUS supports node discovery through its swarm infrastructure.

The C++ server layer contains:

``` text
server-swarm.cpp
server-swarm.h
```

The Python cluster layer contains:

``` text
cluster/discovery.py
cluster/cluster_daemon.py
```

The discovery system can identify available nodes and collect
information required for cluster coordination.

The architecture also includes authenticated beacon support using:

``` text
HMAC-SHA256
timestamp validation
SWARM_BEACON_KEY
```

This provides a foundation for preventing unauthenticated nodes from
being blindly trusted on the local network.

------------------------------------------------------------------------

# 9. Workspace Security

NEXUS includes workspace-scoped access control.

A workspace can define allowed roots:

``` text
/home/user/project
/home/user/project/src
```

Operations can be checked against these roots before files are ingested
or accessed.

Conceptually:

``` text
AI request
    ↓
WorkspaceScope
    ↓
Allowed?
 ┌──┴──┐
YES    NO
 │      │
 ▼      ▼
Allow   Reject
        HTTP 403
```

This is important when agents are given access to filesystem tools.

------------------------------------------------------------------------

# 10. SwarmCode

SwarmCode is the VS Code fork that acts as the **native control surface
for NEXUS**.

Instead of treating AI as a separate web application or external panel,
SwarmCode integrates NEXUS into the VS Code workbench.

The target architecture is:

``` text
SwarmCode
│
├── Editor
├── Explorer
├── Terminal
├── Git
├── Debugger
├── Diagnostics
│
└── NEXUS Workbench
      │
      ├── Cluster
      ├── Agents
      ├── Tasks
      ├── Context
      ├── Memory
      ├── Infrastructure
      └── File Changes
```

------------------------------------------------------------------------

# 11. Native SwarmCode Workbench

The native VS Code integration includes:

``` text
src/vs/workbench/contrib/swarmcode/
```

with components such as:

``` text
common/swarmcode.ts
browser/swarmcodeService.ts
browser/swarmcodeViewPane.ts
browser/swarmcode.contribution.ts
```

The service layer provides a separation between the workbench UI and
NEXUS communication.

Important events include:

``` text
onDidDiscoverNode
onDidUpdateCluster
onDidUpdateTranscript
onDidGeneratePlan
```

This provides a foundation for real-time multi-agent UI updates.

------------------------------------------------------------------------

# 12. SwarmCode NEXUS Integration

The integration layer includes:

``` text
extensions/swarmcode/
├── nexusClient.ts
├── contextEngine.ts
├── toolGateway.ts
├── taskManager.ts
├── gitBridge.ts
├── discovery/
├── orchestrator/
└── views/
```

The major components are:

### NexusClient

Communicates with NEXUS services.

### ContextEngine

Builds development context from the IDE.

### ToolGateway

Provides controlled access to IDE tools.

### TaskManager

Tracks AI development tasks and their lifecycle.

### GitBridge

Connects NEXUS with VS Code's Git functionality.

### Cluster Client

Discovers and monitors NEXUS nodes.

### Swarm Orchestrator

Coordinates multi-model tasks.

------------------------------------------------------------------------

# 13. IDE-Aware Context Engine

SwarmCode can construct context from the actual development environment.

Possible context sources include:

``` text
Active editor
Selection
Open editors
Workspace files
Related files
Imports
Exports
Diagnostics
Git changes
Current branch
Modified files
Project information
```

The intended flow is:

``` text
User request
     ↓
Context Engine
     │
     ├── Active file
     ├── Selection
     ├── Related files
     ├── Diagnostics
     ├── Git diff
     └── Workspace
            ↓
       Relevant context
            ↓
          NEXUS
```

This avoids unnecessarily sending the entire repository to every model.

------------------------------------------------------------------------

# 14. Tool Gateway

The Tool Gateway provides a controlled boundary between AI agents and
the IDE.

Examples of tools include:

``` text
read_file
write_file
search_files
run_command
run_tests
get_diagnostics
git_diff
open_file
```

The intended security boundary is:

``` text
AI Model
   │
   │ Tool Request
   ▼
Tool Gateway
   │
   ├── Filesystem
   ├── Git
   ├── Terminal
   ├── Diagnostics
   └── VS Code APIs
```

Models should not receive unrestricted access to the host operating
system.

------------------------------------------------------------------------

# 15. Task System

NEXUS/SwarmCode introduces a task abstraction represented by concepts
such as:

``` text
NexusTask
```

A task can contain:

``` text
id
type
goal
workspace
files
agents
context
approvalRequired
```

Supported task categories include:

``` text
implement
fix
refactor
explain
review
generate_tests
security_review
consensus
```

A task can progress through states such as:

``` text
planning
architecture
implementation
testing
security_review
consensus
awaiting_approval
applied
rejected
failed
```

------------------------------------------------------------------------

# 16. Agent Event System

The SwarmCode UI can represent events from individual model nodes.

Examples include:

``` text
NODE_STARTED
NODE_THINKING
NODE_TOOL_CALL
NODE_FILE_READ
NODE_FILE_WRITE
NODE_RESPONSE
NODE_REVIEW
NODE_APPROVED
NODE_REJECTED
TASK_COMPLETED
TASK_FAILED
DIFF_PROPOSED
```

This allows the UI to show what the multi-model team is doing rather
than displaying only a final response.

Example:

``` text
Architect
DeepSeek
● reasoning

Coder
Qwen
● editing src/auth/

Security
Llama
✓ approved

Tester
Model X
● running tests
```

------------------------------------------------------------------------

# 17. Safe Code Changes

AI-generated changes are designed to go through a proposal and approval
flow.

``` text
AI
 ↓
Diff Proposal
 ↓
VS Code Diff
 ↓
User Review
 ┌──────────────┐
 ▼              ▼
Accept         Reject
 │
 ▼
Apply change
```

A proposal can retain the original file content so that the system can
detect whether the file changed between proposal creation and approval.

This helps avoid blindly overwriting newer user edits.

------------------------------------------------------------------------

# 18. Diagnostics Integration

SwarmCode can connect compiler/linter diagnostics with NEXUS.

Example:

``` text
Compilation Error
       ↓
VS Code Diagnostic
       ↓
NEXUS
       ↓
Debugging Model
       ↓
Fix Proposal
       ↓
Diff Review
```

This enables an agent workflow driven directly by errors in the editor.

------------------------------------------------------------------------

# 19. Git Integration

The Git bridge provides development state such as:

``` text
Current branch
Working-tree diff
Staged diff
Modified files
```

This gives agents additional information about what the developer is
currently changing.

For example:

``` text
Developer asks:
"Review my current changes"

        ↓

GitBridge
        ↓
Working-tree diff
        ↓
ContextEngine
        ↓
Review models
        ↓
Consensus
```

------------------------------------------------------------------------

# 20. MCP Integration

NEXUS contains MCP-related server functionality and can be extended with
external tools.

The preferred architecture is:

``` text
Model
  ↓
NEXUS Tool Gateway
  ↓
MCP / IDE / Local tools
```

rather than independently giving every model direct access to every
tool.

This provides one place to enforce permissions, logging, and workspace
restrictions.

------------------------------------------------------------------------

# 21. Infrastructure Visibility

Because NEXUS is designed for local heterogeneous hardware, SwarmCode
can expose infrastructure information such as:

``` text
Node
Model
VRAM
RAM
SSD
Context
KV usage
Backend
Status
Capabilities
```

Example:

``` text
┌───────────────────────────────────┐
│ NEXUS CLUSTER                     │
├───────────────────────────────────┤
│ Node 01  Qwen Coder    ONLINE     │
│ Node 02  DeepSeek      ONLINE     │
│ Node 03  Llama         ONLINE     │
│ Node 04  Security      OFFLINE    │
└───────────────────────────────────┘
```

------------------------------------------------------------------------

# 22. Example Development Workflow

A complete future workflow can look like:

``` text
1. Developer asks:
   "Add authentication to this project."

2. SwarmCode collects:
   - active file
   - project structure
   - related files
   - Git changes
   - diagnostics

3. NEXUS creates a task.

4. Architect model creates an implementation plan.

5. Coding model implements the changes.

6. Testing model creates/runs tests.

7. Security model reviews authentication.

8. Reviewer models inspect the implementation.

9. NEXUS performs cross-model verification.

10. SwarmCode displays proposed changes.

11. Developer reviews the VS Code diff.

12. Developer accepts or rejects.

13. Tests and diagnostics are checked again.
```

------------------------------------------------------------------------

# 23. Example Heterogeneous Cluster

A possible local cluster could look like:

``` text
Laptop / PC 01
├── Model: Qwen Coder
├── Role: Coding
└── GPU: local GPU

Laptop / PC 02
├── Model: DeepSeek
├── Role: Reasoning
└── GPU: local GPU

Laptop / PC 03
├── Model: Llama
├── Role: Review
└── GPU: local GPU

Laptop / PC 04
├── Model: Small fast model
├── Role: Utility / classification
└── GPU / CPU
```

NEXUS treats them as one logical intelligence network:

``` text
             ┌───────────────┐
             │   SwarmCode   │
             └───────┬───────┘
                     │
              NEXUS Router
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      Qwen        DeepSeek      Llama
      Coder       Reasoner      Reviewer
        │            │            │
        └────────────┼────────────┘
                     ▼
                 Consensus
```

------------------------------------------------------------------------

# 24. Security Model

The architecture should treat every AI action as potentially untrusted.

Important boundaries include:

-   Workspace scope validation
-   Tool Gateway
-   User approval for code changes
-   Authenticated swarm discovery
-   Node availability checks
-   Model/backend health checks
-   Git-aware change tracking
-   Diff-based file modifications
-   No automatic approval on timeout/failure

For production use, additional authentication, authorization,
sandboxing, process isolation, and audit logging should be added around
command execution.

------------------------------------------------------------------------

# 25. Current Architecture Status

The current project contains substantial implementations for:

  Component                                 Status
  ----------------------------------------- ----------------
  `llama.cpp` inference base                Implemented
  VRAM/RAM/SSD KV hierarchy                 Implemented
  TurboQuant integration                    Implemented
  Heterogeneous model nodes                 Implemented
  Node discovery                            Implemented
  Backend/model probing                     Implemented
  Workspace scope                           Implemented
  Multi-agent coordination                  Implemented
  Consensus engine                          Implemented
  Cross-model verification                  Implemented
  Native SwarmCode workbench                Implemented
  Context engine                            Implemented
  Tool Gateway foundation                   Implemented
  Git integration                           Implemented
  Diagnostics integration                   Implemented
  Task abstraction                          Implemented
  Diff/approval flow                        Implemented
  Agent event model                         Implemented
  Full autonomous tool execution loop       In development
  Complete native/extension consolidation   In development
  Capability-based dynamic routing          In development
  End-to-end autonomous coding loop         In development

The project is therefore best considered an **active development
platform**, not a finished autonomous coding product.

------------------------------------------------------------------------

# 26. Recommended Next Architecture

The next major development stage should connect the existing components
into one complete execution loop:

``` text
                  User
                   │
                   ▼
               SwarmCode
                   │
                   ▼
             Context Engine
                   │
                   ▼
               NexusTask
                   │
                   ▼
             Agent Router
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
    Model A      Model B      Model C
    Architect    Coder        Reviewer
       │           │           │
       └───────────┼───────────┘
                   ▼
              Tool Gateway
                   │
          ┌────────┼─────────┐
          ▼        ▼         ▼
       Files      Git      Terminal
          │        │         │
          └────────┼─────────┘
                   ▼
              Test / Debug
                   │
                   ▼
             Review Models
                   │
                   ▼
               Consensus
                   │
                   ▼
              Diff Proposal
                   │
                   ▼
              User Approval
                   │
                   ▼
               Apply Code
                   │
                   ▼
            Verify Again
```

This turns the current components into a complete agentic development
loop.

------------------------------------------------------------------------

# 27. Design Philosophy

NEXUS is built around five principles:

### 1. Local-first

Models and project data can remain on local machines.

### 2. Heterogeneous

Different nodes can run different models and specialize in different
tasks.

### 3. Resource-aware

VRAM, RAM, and NVMe storage can all participate in context management.

### 4. Human-controlled

AI proposes changes; the developer remains in control of applying them.

### 5. IDE-native

The intelligence layer should be integrated into the development
environment instead of being treated as a separate chatbot.

------------------------------------------------------------------------

# 28. Long-Term Vision

The long-term goal is a distributed local AI development environment:

``` text
                         SWARMCODE
                 AI-Native Development OS
                            │
                     NEXUS / MIND
                            │
               ┌────────────┴────────────┐
               │                         │
        Context + Tools             Agent Router
               │                         │
               └────────────┬────────────┘
                            │
                   Heterogeneous Swarm
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
    Coder Model        Reasoning Model       Review Model
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                       Verification
                            │
                       Safe Changes
                            │
                         Developer
```

The objective is not simply to build another AI chat panel.

The objective is to build a **local multi-model intelligence layer for
software development**, where SwarmCode provides the developer interface
and NEXUS provides the distributed intelligence, memory, orchestration,
tools, and verification infrastructure.

------------------------------------------------------------------------

## Project Structure

``` text
MIND/
├── common/
├── include/
├── src/
├── ggml/
├── tools/
│   └── server/
├── cluster/
├── turboquant_plus-main/
└── examples/

SwarmCode/
├── src/
│   └── vs/workbench/contrib/swarmcode/
├── extensions/
│   └── swarmcode/
│       ├── discovery/
│       ├── orchestrator/
│       └── views/
└── ...
```

------------------------------------------------------------------------

## Status

🚧 **Active development**

NEXUS and SwarmCode are evolving together. APIs, UI components,
orchestration behavior, and cluster protocols may change as the platform
moves toward a fully integrated multi-model coding workflow.

------------------------------------------------------------------------

## License

See the individual project/license files included in the repository. The
repository contains components derived from upstream projects with their
own licensing requirements.

------------------------------------------------------------------------

## Vision

> **One IDE. Multiple models. One intelligent development swarm.**

NEXUS provides the distributed intelligence.

SwarmCode provides the development environment.

Together they form a local, heterogeneous, multi-agent AI coding
platform.
