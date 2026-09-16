// ─────────────────────────────────────────────────────────────────────────────
// NEXUS Workbench — Shared Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Node / Cluster ────────────────────────────────────────────────────────────

export interface MemoryTier {
    vram_gb: number;
    ram_gb: number;
    ssd_swap_gb: number;
}

export interface BackendInfo {
    reachable: boolean;
    model_name: string;
    model_path: string;
    n_ctx: number;
    backend_url: string;
}

export interface NodeInfo {
    node_id: string;
    hostname: string;
    api_host: string;
    api_port: number;
    model_name: string;
    role_description: string;
    vram_gb: number;
    ram_gb: number;
    ssd_swap_gb: number;
    max_context: number;
    tags: string[];
    /** Present only on the local node topology response */
    backend?: BackendInfo;
}

export interface ClusterTopology {
    cluster_id: string;
    total_nodes: number;
    local_node: NodeInfo & { backend: BackendInfo };
    nodes: NodeInfo[];
    scope: WorkspaceScope;
}

// ── Workspace & Context ───────────────────────────────────────────────────────

export interface WorkspaceScope {
    roots: string[];
    restricted: boolean;
}

export interface FileEntry {
    path: string;
    content?: string;
    language?: string;
    size?: number;
}

export interface DiagnosticEntry {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    source?: string;
}

export interface WorkspaceContext {
    workspace: string;
    activeFile: string;
    selection: string;
    openFiles: string[];
    gitDiff: string;
    gitBranch: string;
    modifiedFiles: string[];
    diagnostics: DiagnosticEntry[];
    terminal: string[];
    projectContext: string;
    relatedFiles: string[];
    tokenCounts: {
        project: number;
        selected: number;
        sent: number;
    };
}

export interface IngestedContext {
    summary: string;
    files: FileEntry[];
    ingested_at: string;
    total_tokens: number;
}

// ── Agent Definitions ─────────────────────────────────────────────────────────

export type AgentCapability =
    | 'read_files'
    | 'write_files'
    | 'search_files'
    | 'git_diff'
    | 'run_tests'
    | 'run_command'
    | 'get_diagnostics'
    | 'security_analysis'
    | 'open_file';

export interface AgentDefinition {
    name: string;
    model: string;
    nodeId: string;
    role: string;
    capabilities: AgentCapability[];
    can_write: boolean;
}

// ── NEXUS Events (streaming from task sessions) ───────────────────────────────

export type NexusEventType =
    | 'NODE_STARTED'
    | 'NODE_THINKING'
    | 'NODE_TOOL_CALL'
    | 'NODE_FILE_READ'
    | 'NODE_FILE_WRITE'
    | 'NODE_RESPONSE'
    | 'NODE_REVIEW'
    | 'NODE_APPROVED'
    | 'NODE_REJECTED'
    | 'TASK_COMPLETED'
    | 'TASK_FAILED'
    | 'DIFF_PROPOSED';

export interface NexusEvent {
    type: NexusEventType;
    nodeId: string;
    nodeRole?: string;
    timestamp: number;
    payload: Record<string, unknown>;
}

// ── Task Abstraction ──────────────────────────────────────────────────────────

export type TaskType =
    | 'implement'
    | 'fix'
    | 'refactor'
    | 'explain'
    | 'review'
    | 'generate_tests'
    | 'security_review'
    | 'consensus';

export type TaskStatus =
    | 'pending'
    | 'planning'
    | 'architecture'
    | 'implementation'
    | 'testing'
    | 'security_review'
    | 'consensus'
    | 'awaiting_approval'
    | 'applied'
    | 'rejected'
    | 'failed';

export interface NexusTask {
    id: string;
    type: TaskType;
    goal: string;
    workspace: string;
    files: string[];
    agents: string[];
    approvalRequired: boolean;
    context?: WorkspaceContext;
}

export interface TaskSession {
    sessionId: string;
    taskId: string;
    status: TaskStatus;
    events: NexusEvent[];
    result?: string;
    proposedEdits?: DiffProposal[];
    startedAt: number;
    completedAt?: number;
}

// ── Diff / File Operations ────────────────────────────────────────────────────

export interface DiffProposal {
    id: string;
    path: string;
    originalContent: string;
    proposedContent: string;
    description: string;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface ToolRequest {
    type: AgentCapability | 'open_file';
    path?: string;
    content?: string;
    query?: string;
    command?: string;
}

export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    nodeId?: string;
}

export interface CollaborationResult {
    approved_plan: string;
    participating_nodes: string[];
    rounds_to_zero_error: number;
    discussion_transcript: ChatMessage[];
}

// ── Infrastructure / Metrics ──────────────────────────────────────────────────

export interface NodeMetrics {
    node_id: string;
    vram_used_gb: number;
    vram_total_gb: number;
    ram_used_gb: number;
    ram_total_gb: number;
    kv_vram_used_gb: number;
    kv_ram_used_gb: number;
    kv_ssd_used_gb: number;
    turbo_k_quant?: string;
    turbo_v_quant?: string;
    is_unified_memory: boolean;
    tokens_per_second?: number;
}
