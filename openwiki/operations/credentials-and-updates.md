---
type: Operations Guide
title: Credentials and updates
description: Server-side Mosoo configuration, repository update behavior, failure recovery, and deployment responsibilities.
tags: [operations, credentials, mosoo, updates]
---

# Credentials and updates

## Required runtime values

```env
MOSOO_API_BASE=https://cloud.mosoo.ai/api/v1
MOSOO_AGENT_ID=<published-agent-id>
MOSOO_API_TOKEN=<access-token>
```

Store them in the trusted CLI environment, CI secret store, or `~/.openwiki/.env`. The browser visualizer never needs them. Provider credentials are configured on the Mosoo Environment/Agent side and are not sent to the OpenWiki browser.

## Repository uploads

Before every new repository generation, OpenWiki builds a temporary Git bundle from tracked and non-ignored working-tree files. `.openwikiignore`, Git ignore rules, sensitive filename filtering, symlink confinement, and the 64 MiB cap apply before network upload. Temporary snapshots are removed after the Thread request.

## Update and failure behavior

- A successful non-chat Run downloads and validates the complete artifact before replacing `openwiki/`.
- A failed Run does not partially apply cloud workspace files.
- `openwiki/.last-update.json` records interrupted local runs so later automation does not mistake a failure for a fresh wiki.
- The current Task/cattle Agent starts retries from a new repository bundle. Mosoo keeps the failed Run and events for diagnosis, but not a resumable native execution checkpoint.

## Deployment split

OpenWiki releases contain the CLI/TUI, bundle uploader, event projection, artifact validator, and visualizer. Mosoo deployment owns the Agent, Skill, Environment, Driver image, runtime protocol, durable sessions, and credentials. Updating either side must preserve the public Thread API and `openwiki-result.json` schema.

## Verification

Run the repository gate before publishing:

```bash
pnpm test
node dist/cli/cli.js --help
node dist/cli/cli.js visualize openwiki --port 4400 --no-open
```

Live verification additionally requires a completed Mosoo Run, native `spawnAgent` lifecycle events, and a downloadable `openwiki-result.json`.
