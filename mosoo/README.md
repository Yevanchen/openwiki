# OpenWiki on Mosoo

OpenWiki keeps its CLI/TUI, connector pulls, documentation workflow, docs-only write policy, and generated Markdown contract. DeepAgents is replaced by Mosoo's native Codex Harness and native SubAgents; Mosoo also supplies the cloud Environment, durable Thread/Run/event stream, repository attachment, and generated wiki artifact.

The browser visualizer remains a read-only graph for an already-generated wiki; current OpenWiki has no browser agent UI. Agent work continues to start from the existing Ink terminal UI.

| Product behavior | Owner after migration |
| --- | --- |
| CLI/TUI, code-mode connector pull, update no-op, secret filtering, final wiki swap | OpenWiki |
| Codex execution, native SubAgents, skills, sandbox, durable Thread/Run/events/files | Mosoo |
| Wiki graph and Markdown reader | Existing read-only visualizer |

The boundary is intentionally narrow: OpenWiki sends one filtered Git bundle and receives one versioned JSON artifact. It does not implement a second scheduler or normalize native SubAgent lifecycle events itself.

## Server-side configuration

Add these only to the trusted OpenWiki process (for example `~/.openwiki/.env` or CI secrets):

```env
MOSOO_API_BASE=https://cloud.mosoo.ai/api/v1
MOSOO_AGENT_ID=<published-agent-id>
MOSOO_API_TOKEN=<access-token>
```

The CLI uploads a filtered Git snapshot, streams Mosoo lifecycle into the existing run log, and atomically replaces `openwiki/` from the completed artifact. Keep these values only in the trusted CLI/server process; `MOSOO_API_TOKEN` is never rendered by or sent to the visualizer/browser.

Personal-wiki mode and connector credentials inside the cloud sandbox are not migrated in this first version. Code-mode connectors still pull locally before the filtered repository snapshot is uploaded.
