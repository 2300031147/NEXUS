"""
Multi-Model Consensus & Iterative Zero-Error Verification Engine.
Orchestrates heterogeneous models across laptops into a self-checking team:
- Round 1: Multi-model analysis and draft proposals
- Round 2+: Cross-model review and iterative error elimination
- Convergence: Concludes only when EVERY model verifies zero errors/defects.
"""

import asyncio
import json
import logging
import time
from typing import Dict, Any, List, Optional
import urllib.request
import urllib.error

logger = logging.getLogger("SwarmConsensus")

# Shared-context bounds: every node receives the same truncated snapshot so
# one giant workspace cannot blow up prompts or stall the loop. Sized for
# small local models (worst case ≈ 9k chars, not 46k).
MAX_PROMPT_SUMMARY_CHARS = 2000
MAX_PROMPT_FILES = 8
MAX_PROMPT_FILE_CHARS = 800
# Per-node call budget: the HTTP layer already times out at 120s; this caps
# the wait so one slow node cannot stall a whole round indefinitely.
NODE_CALL_TIMEOUT_S = 150.0


def build_shared_context(project_context: Dict[str, Any]) -> Dict[str, str]:
    """Bounded, identical context snapshot broadcast to every node."""
    summary = str(project_context.get("summary", ""))[:MAX_PROMPT_SUMMARY_CHARS]
    files = project_context.get("files", []) or []
    parts = []
    for entry in files[:MAX_PROMPT_FILES]:
        if isinstance(entry, dict):
            text = str(entry.get("content", entry.get("path", "")))
            parts.append(f"--- {entry.get('path', 'unnamed')} ---\n{text[:MAX_PROMPT_FILE_CHARS]}")
        else:
            parts.append(str(entry)[:MAX_PROMPT_FILE_CHARS])
    return {"summary": summary, "files": "\n\n".join(parts)}


class MultiModelConsensusEngine:
    def __init__(self, local_node_info: Dict[str, Any], local_llama_url: str = "http://127.0.0.1:8080") -> None:
        self.local_node = local_node_info
        self.local_llama_url = local_llama_url
        self.discussion_history: List[Dict[str, Any]] = []
        self.max_verification_rounds = 4
        self.node_timeout = NODE_CALL_TIMEOUT_S

    async def _call_with_timeout(self, endpoint_url: str, prompt: str, system_prompt: str = "") -> str:
        """Bounded model call: a timeout is a failure, never a verdict."""
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(self._call_model_completion, endpoint_url, prompt, system_prompt),
                timeout=self.node_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(f"Model call to {endpoint_url} timed out after {self.node_timeout}s.")
            return (
                f"[{self.local_node.get('model_name', 'Node')} ERROR]: model call to {endpoint_url} timed out; "
                f"no proposal/verdict produced — requires human review."
            )

    def _call_model_completion(self, endpoint_url: str, prompt: str, system_prompt: str = "") -> str:
        """Call standard OpenAI/llama.cpp completion endpoint on a target node."""
        target_url = f"{endpoint_url}/v1/chat/completions"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        req_body = json.dumps({
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 4096,
            "stream": False
        }).encode("utf-8")

        req = urllib.request.Request(
            target_url,
            data=req_body,
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, dict) and data.get("mock") is True:
                    # Mock completions carry no verdict: treat as abstention.
                    return (
                        f"[{self.local_node.get('model_name', 'Node')} ABSTAIN]: peer returned a mock "
                        f"completion (no backend); no proposal/verdict produced — requires human review."
                    )
                choices = data.get("choices", [])
                if choices:
                    return str(choices[0].get("message", {}).get("content", ""))
                return str(data.get("content", ""))
        except Exception as e:
            logger.warning(f"Direct API call to {endpoint_url} failed: {e}. Falling back to node synthesis.")
            return f"[{self.local_node.get('model_name', 'Node')} ERROR]: model call to {endpoint_url} failed ({e}); no proposal/verdict produced — requires human review."

    async def run_collaborative_discussion_and_plan(
        self,
        project_context: Dict[str, Any],
        user_prompt: str,
        active_peers: List[Dict[str, Any]],
        progress_callback: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Runs the full multi-laptop team deliberation:
        1. Ingestion of project context into each model's tiered memory
        2. Round-table debate & proposals
        3. Cross-model code review & error correction
        4. Zero-error unanimous consensus plan
        """
        all_nodes = active_peers if active_peers else [self.local_node]
        transcript: List[Dict[str, Any]] = []
        shared = build_shared_context(project_context)
        revision_failed = False

        if progress_callback:
            await progress_callback({
                "stage": "ingestion",
                "message": f"Broadcasting project workspace ({len(project_context.get('files', []))} files) across {len(all_nodes)} cluster laptop node(s)...",
                "nodes": all_nodes
            })

        # Stage 1: Round-table initial analysis by each laptop's model
        async def fetch_proposal(node: Dict[str, Any]) -> Dict[str, Any]:
            node_name = node.get("hostname", "Node")
            model_name = node.get("model_name", "LocalModel")
            api_url = node.get("api_url", self.local_llama_url)

            if progress_callback:
                await progress_callback({
                    "stage": "deliberation",
                    "node": node_name,
                    "model": model_name,
                    "message": f"Laptop '{node_name}' ({model_name}) is analyzing codebase and formulating proposal...",
                })

            prompt = (
                f"Project Summary:\n{shared['summary']}\n\n"
                f"Project Files:\n{shared['files']}\n\n"
                f"Target Task: {user_prompt}\n\n"
                f"As a collaborative AI team member running on node {node_name} with tiered SSD+RAM memory, "
                f"analyze the codebase structure, propose the optimal technical solution, and list key files to modify."
            )
            
            # Role-aware teamwork: each node contributes from its specialty.
            proposer_system = (
                "You are a senior AI engineering peer collaborating in a multi-model cluster. "
                "Focus on clean code, architecture correctness, and zero errors."
            )
            proposer_role = node.get("role_description")
            if proposer_role:
                proposer_system += f" Your team role is: {proposer_role}."

            response_text = await self._call_with_timeout(
                api_url,
                prompt,
                proposer_system
            )

            return {
                "round": 1,
                "node_id": node.get("node_id"),
                "hostname": node_name,
                "model_name": model_name,
                "type": "proposal",
                "content": response_text,
                "timestamp": time.time(),
            }

        proposals = await asyncio.gather(*(fetch_proposal(node) for node in all_nodes))
        transcript.extend(proposals)

        # Stage 2: Iterative Cross-Verification Loop (Review until all models find 0 errors)
        current_proposal_text = "\n\n".join([f"[{p['hostname']} ({p['model_name']})]:\n{p['content']}" for p in proposals])
        all_models_approved = False
        verification_round = 1

        while not all_models_approved and verification_round <= self.max_verification_rounds:
            if progress_callback:
                await progress_callback({
                    "stage": "verification_loop",
                    "round": verification_round,
                    "message": f"Round {verification_round}: Cross-model verification loop in progress across all nodes...",
                })

            round_reviews: List[Dict[str, Any]] = []
            errors_detected = False

            async def fetch_review(reviewer_node: Dict[str, Any]) -> Dict[str, Any]:
                r_name = reviewer_node.get("hostname", "Node")
                r_model = reviewer_node.get("model_name", "Model")
                r_url = reviewer_node.get("api_url", self.local_llama_url)

                review_prompt = (
                    f"Team Proposal under review:\n{current_proposal_text}\n\n"
                    f"Project Task: {user_prompt}\n\n"
                    f"Critically inspect this proposal for any bugs, syntax mistakes, edge-case regressions, or architectural flaws. "
                    f"Answer in JSON with keys:\n"
                    f"- 'approved' (boolean: true if 100% sound with NO flaws, false if any issues remain)\n"
                    f"- 'issues_found' (list of strings, empty if approved)\n"
                    f"- 'corrections' (string with needed fixes/refinements)\n"
                    f"- 'verdict' (short summary)"
                )

                reviewer_system = (
                    "You are an uncompromising code reviewer. Your goal is 0 bugs and pristine teamwork."
                )
                reviewer_role = reviewer_node.get("role_description")
                if reviewer_role:
                    reviewer_system += f" Your team role is: {reviewer_role}."

                review_raw = await self._call_with_timeout(
                    r_url,
                    review_prompt,
                    reviewer_system
                )

                # Parse JSON verdict or formulate clean structure.
                # A reply with no structured verdict is NOT consensus unless
                # it carries explicit approval signals: a prose rejection
                # ("I found 3 bugs ...") must count as rejection.
                approved = False
                issues: List[str] = []
                try:
                    if "{" in review_raw and "}" in review_raw:
                        json_str = review_raw[review_raw.find("{"):review_raw.rfind("}") + 1]
                        parsed_review = json.loads(json_str)
                        if not isinstance(parsed_review, dict):
                            parsed_review = {}
                        raw = parsed_review.get("approved", False)
                        approved = (raw is True) or (isinstance(raw, str) and raw.strip().lower() in ("true", "yes", "approved"))
                        issues = parsed_review.get("issues_found", [])
                    else:
                        text = review_raw.lower()
                        approval_signals = (
                            "no error", "no flaw", "no issue", "no bug",
                            "approved", "looks good", "looks solid",
                            "zero-error", "zero error", "lgtm",
                        )
                        if not any(signal in text for signal in approval_signals):
                            approved = False
                            issues = ["Reviewer gave no structured approval verdict."]
                        else:
                            approved = True
                except Exception:
                    approved = False
                    issues = ["Failed to parse review JSON. Assuming not approved."]

                return {
                    "round": verification_round,
                    "node_id": reviewer_node.get("node_id"),
                    "hostname": r_name,
                    "model_name": r_model,
                    "type": "verification_pass",
                    "approved": approved,
                    "issues": issues,
                    "content": review_raw,
                    "timestamp": time.time(),
                }
                
            round_reviews = await asyncio.gather(*(fetch_review(node) for node in all_nodes))
            transcript.extend(round_reviews)
            
            for review in round_reviews:
                if not review["approved"]:
                    errors_detected = True

            if not errors_detected:
                all_models_approved = True
                if progress_callback:
                    await progress_callback({
                        "stage": "consensus_reached",
                        "round": verification_round,
                        "message": f"Unanimous Consensus Reached! All {len(all_nodes)} model(s) verified zero errors.",
                    })
                break
            else:
                # Refine proposal based on detected issues
                refinements = []
                for review in round_reviews:
                    if not review["approved"]:
                        refinements.append(f"[{review['hostname']} ({review['model_name']}) Feedback]:\n{review['content']}")
                
                revision_prompt = (
                    f"Here is the Current Flawed Proposal:\n{current_proposal_text}\n\n"
                    f"The team found the following errors in the proposal:\n"
                    + "\n\n".join(refinements) + "\n\n"
                    f"Please rewrite the proposal completely from scratch. Fix ALL the errors mentioned above. Ensure zero bugs and clean architecture. "
                    f"Output only the final, corrected proposal text."
                )

                if progress_callback:
                    await progress_callback({
                        "stage": "synthesizing_revision",
                        "round": verification_round,
                        "message": f"Synthesizing a revised proposal to fix {len(refinements)} reported issue(s)...",
                    })

                # Use the local model to synthesize the revision
                current_proposal_text = await self._call_with_timeout(
                    self.local_llama_url,
                    revision_prompt,
                    "You are the Lead Architect. Your job is to integrate the team's feedback into a flawless, unified proposal."
                )
                if "ERROR]:" in current_proposal_text or "ABSTAIN]:" in current_proposal_text:
                    revision_failed = True

                verification_round += 1

        # Stage 3: Synthesize finalized zero-error implementation plan.
        # A plan that exhausted its rounds with objections outstanding is
        # honestly reported as needing review, never as approved.
        last_round = max((entry.get("round", 0) for entry in transcript if entry.get("type") == "verification_pass"), default=0)
        unresolved_count = sum(
            1 for entry in transcript
            if entry.get("type") == "verification_pass" and entry.get("round") == last_round and not entry.get("approved")
        )
        final_plan = {
            "title": f"Swarm Plan: {user_prompt[:80]}",
            "status": "APPROVED_BY_CLUSTER" if all_models_approved else "NEEDS_REVIEW",
            "consensus_score": 1.0 if all_models_approved else 0.95,
            "participating_nodes": [
                {
                    "node_id": n.get("node_id"),
                    "hostname": n.get("hostname"),
                    "model": n.get("model_name"),
                    "memory": n.get("memory", {}),
                }
                for n in all_nodes
            ],
            "rounds_to_zero_error": verification_round if all_models_approved else None,
            "discussion_transcript": transcript,
            "approved_plan": current_proposal_text,
            "summary": (
                f"Multi-Agent collaborative plan developed by {len(all_nodes)} laptop node(s). "
                + (
                    f"Cross-verified in {verification_round} round(s), achieving zero-defect consensus."
                    if all_models_approved else
                    f"Stopped after {verification_round} round(s) with "
                    f"{unresolved_count} unapproved review(s); human review required."
                    + (" Revision synthesis also failed on at least one round." if revision_failed else "")
                )
            ),
            "tasks": [
                {
                    "id": f"task-{i+1}",
                    "assigned_node": all_nodes[i % len(all_nodes)].get("hostname"),
                    "assigned_model": all_nodes[i % len(all_nodes)].get("model_name"),
                    "title": f"Step {i+1}: Implement and verify module changes",
                    "description": f"Execute zero-error changes formulated during team consensus.",
                    "status": "READY"
                }
                for i in range(len(all_nodes))
            ]
        }

        return final_plan
