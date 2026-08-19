---
type: Technical documentation
title: Agent workflow
description: How OpenWiki invokes Mosoo's Codex Harness, native SubAgents, event stream, and artifact contract.
tags: [agent, workflow, mosoo, subagents]
---

# Agent workflow

## Host flow

1. `src/agent/index.ts` delegates the command to `runOpenWikiOnMosoo()`.
2. `src/agent/mosoo.ts` requires `MOSOO_API_BASE`, `MOSOO_AGENT_ID`, and `MOSOO_API_TOKEN`.
3. Repository mode creates a temporary snapshot from tracked and unignored working-tree files, commits it, and builds `repository.bundle`.
4. The CLI uploads the bundle and creates a Mosoo Thread whose first message names the OpenWiki command and output contract.
5. The CLI consumes the Thread SSE stream and maps message/tool events to the existing TUI contract.
6. A successful `init` or `update` downloads `openwiki-result.json` and atomically replaces the local wiki.
7. Failures leave the previous local wiki untouched and write interrupted update metadata through the existing OpenWiki lifecycle.

## Cloud workflow

The `openwiki-cloud-runner` Skill owns the documentation procedure inside Mosoo:

1. Clone the attached bundle into a clean workspace.
2. Inventory source, manifests, public surfaces, persistence, operations, and representative tests.
3. Write a skeleton and run `skeleton_critic` twice, resolving actionable gaps between reviews.
4. Write the complete wiki under `workspace/openwiki/`.
5. Run `wiki_question_finder`, then parallel `wiki_answer_verifier` SubAgents and repair PARTIAL/FAIL findings.
6. Run exactly two final native reviewers in parallel: source grounding and output contract.
7. Package the UTF-8 wiki tree as `outputs/openwiki-result.json`.

All orchestration uses native Codex SubAgents. Mosoo Driver preserves and normalizes their lifecycle events; it does not implement another scheduler.

## Output contract

```json
{
  "schemaVersion": 1,
  "files": [
    { "path": "quickstart.md", "content": "..." }
  ]
}
```

Only top-level Mosoo output files are downloadable artifacts. Missing, empty, malformed, or path-traversing output fails the host operation rather than partially updating the wiki.

## Retry semantics

The production Agent is intentionally Task/cattle. A retry creates a clean execution from the latest repository bundle. Durable Mosoo events explain the failed attempt, but are not treated as a filesystem or native SubAgent checkpoint.
