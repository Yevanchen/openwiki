---
type: CLI reference
title: OpenWiki CLI usage
description: Commands and runtime behavior for the Mosoo-backed OpenWiki CLI/TUI and visualizer.
tags: [openwiki, cli, mosoo, visualizer]
---

# CLI usage

## Repository commands

```bash
openwiki
openwiki code --init
openwiki code --update
openwiki code --init --print "Document the API first"
openwiki --language zh-CN --update
```

`openwiki` opens the Ink terminal UI. `--init` and `--update` use the Mosoo Agent and preserve the existing streamed run log. `--print` runs once and prints the final assistant output.

`--modelId` is still accepted so existing scripts do not break, but it does not override the model frozen into the published Mosoo Agent deployment. Provider/model/API-key slash commands were removed from the interactive menu for the same reason.

## Visualizer

```bash
openwiki visualize openwiki --port 4400
openwiki visualize openwiki --export dist/wiki
```

The local visualizer is a read-only graph and Markdown reader with live refresh. It does not run the Agent and does not receive `MOSOO_API_TOKEN`.

## Connector commands

Authentication, ingestion, cron, and connector configuration commands remain local. Code-mode ingestion may update repository evidence before the filtered bundle is uploaded. Personal/local-wiki execution is not yet supported by the Mosoo runtime and fails explicitly instead of silently falling back to DeepAgents.

## Diagnostics

The TUI header reports `runtime: Mosoo` and `harness: Codex + native SubAgents`. Use `--debug` for sanitized runtime diagnostics. Run records and artifacts remain available in Mosoo even if the local SSE connection exits.
