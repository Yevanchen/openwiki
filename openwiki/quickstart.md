---
type: Quickstart Guide
title: OpenWiki Quickstart
description: Start OpenWiki's Mosoo-hosted Codex workflow and browse the generated repository wiki.
tags: [openwiki, mosoo, codex, cli]
---

# OpenWiki quickstart

OpenWiki is a TypeScript CLI/TUI that sends repository documentation work to a Mosoo-hosted Codex Agent. DeepAgents is no longer part of the runtime. OpenWiki keeps the existing terminal experience and wiki reader; Mosoo supplies the cloud sandbox, durable Thread/Run/events/files, and native Codex SubAgents.

## Configure

Keep these values in the trusted CLI process or `~/.openwiki/.env`:

```env
MOSOO_API_BASE=https://cloud.mosoo.ai/api/v1
MOSOO_AGENT_ID=<published-agent-id>
MOSOO_API_TOKEN=<access-token>
```

The token is never rendered by or sent to the browser visualizer.

## Generate a repository wiki

```bash
pnpm install
pnpm build
node dist/cli/cli.js code --init --print
```

The CLI uploads a filtered Git bundle, streams Mosoo lifecycle events into the existing run log, downloads `openwiki-result.json`, validates its paths, and atomically replaces `openwiki/`.

## Browse it

```bash
node dist/cli/cli.js visualize openwiki --port 4400
```

The visualizer is a read-only browser graph and Markdown reader. Agent generation and chat remain in the Ink terminal UI.

## Current scope

- Repository/code mode runs through Mosoo.
- `.openwikiignore`, Git ignore rules, and sensitive filename filtering apply before upload.
- Personal/local-wiki execution and connector credentials inside the cloud sandbox are not migrated yet. Code-mode connectors still pull locally before the repository snapshot is uploaded.
- `--modelId` remains parse-compatible for existing scripts, but the published Mosoo Agent owns the runtime model.

## Read next

- [Architecture overview](architecture/overview.md)
- [Agent workflow](agent/workflow.md)
- [CLI usage](cli/usage.md)
- [Credentials and updates](operations/credentials-and-updates.md)
- [Connectors](integrations/connectors.md)
