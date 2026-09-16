# Swarm Host API (contract `swarm-host/1`)

This is the contract a native SwarmCode host panel implements against. The
cluster service is the source of truth; the panel only reads and commands it.

Base URL: `http://<node-ip>:<port>` (cluster_server, default port 8090).

## Recognition

- `GET /v1/node/info` — local node identity: `node_id`, `hostname`,
  `model_name` (auto-detected from the local backend), `role_description`,
  memory tiers.
- `GET /v1/cluster/peers` — every discovered node (self first):
  `cluster_id`, `total_nodes`, `nodes[]`.
- `GET /v1/cluster/topology` — full snapshot for hosts:
  - `local_node` — local node dict plus `backend` (`reachable`, `model_name`,
    `model_path`, `n_ctx`, `backend_url`).
  - `nodes` — all discovered nodes (heterogeneous: each runs its OWN model,
    unlike exo which shards one model).
  - `scope` — the user-granted workspace roots (see below).

## Workspace access (user-granted folders/files)

- `GET /v1/cluster/scope` — `{roots[], restricted}`.
- `POST /v1/cluster/scope` — body `{roots: [<abs paths>]}` to grant, or
  `{clear: true}` to lift restrictions.
- `POST /v1/cluster/ingest` — body `{summary, files: [{path, ...}]}`.
  Files outside the granted roots are rejected with HTTP 403 and a
  `rejected[]` list. Only ingested context is ever sent to models.
- `GET /v1/cluster/context` — currently ingested context.

## Team discussion (consensus)

- `POST /v1/cluster/collaborate` (alias `/v1/cluster/discuss`) — body
  `{goal|prompt}`. Runs propose → cross-review → revise across all nodes
  until every model approves or rounds exhaust. Returns the approved plan
  with `participating_nodes`, `rounds_to_zero_error`, and the full
  `discussion_transcript`.

## Discovery (transport, unchanged)

UDP beacons on port 52415 (`SWARM` magic) via multicast `224.0.0.111`,
subnet `<broadcast>`, and `127.255.255.255`. Never unicast: the kernel
load-balances unicast across `SO_REUSEPORT` listeners so co-located nodes
miss each other.
