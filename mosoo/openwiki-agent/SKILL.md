---
name: openwiki-cloud-runner
description: Generate and maintain an OpenWiki code wiki from an attached Git bundle with native Codex SubAgents and publish the wiki as a Mosoo artifact.
version: 0.1.0
---

# OpenWiki Cloud Runner

Use this skill when the message starts with `Run OpenWiki command:`. Mosoo owns the native Codex Harness, Thread, Run, event stream, sandbox, and files. Codex owns all planning and SubAgent orchestration. Never invoke DeepAgents or the `openwiki` CLI.

## Contract

- Never print or copy `OPENAI_API_KEY` or any credential.
- For a new workspace, use the attached `repository.bundle`; do not fetch an arbitrary repository instead.
- Work only in `$PWD/workspace`, `$PWD/review`, and top-level `$PWD/outputs`.
- Read source and tests as evidence. Do not inspect `.env`, credentials, private keys, or paths outside the cloned workspace.
- Modify only `workspace/openwiki/`. Never modify source, root `AGENTS.md`, root `CLAUDE.md`, or `openwiki/INSTRUCTIONS.md`.
- Every non-reserved Markdown concept begins with valid OKF v0.2 front matter. `index.md` and `log.md` are reserved.
- Use native Codex SubAgents only. Do not create a scheduler or emulate a SubAgent lifecycle in scripts.
- Only top-level `outputs/` files become downloadable. A successful `init` or `update` must create `outputs/openwiki-result.json`.

## Init or update

1. Locate the attached `repository.bundle`, then create a clean workspace:

   ```bash
   rm -rf workspace review
   git clone "$BUNDLE_PATH" workspace
   mkdir -p review outputs
   ```

2. For `init`, inventory manifests, entrypoints, public surfaces, domains, persistence, operations, and representative tests. Write `workspace/openwiki/_skeleton.md` before wiki prose. Launch the native `skeleton_critic` SubAgent to review coverage, resolve every actionable item, then invoke it exactly once more for final review.

3. Write the complete wiki. `quickstart.md` is the entrypoint. Group by systems and workflows, not the directory tree. Explain responsibilities, owning symbols, dependencies/data flow, invariants, focused tests, and minimal validation. Add grounded Mermaid diagrams only where a flow, lifecycle, or data model benefits.

4. For `init`, launch the native `wiki_question_finder` SubAgent to produce source-grounded questions with acceptance criteria. Batch related questions 2–3 at a time and launch native `wiki_answer_verifier` SubAgents in parallel. Repair all PARTIAL/FAIL findings before one retry wave. For `update`, use the existing wiki plus changed source evidence and avoid unrelated rewrites.

5. Launch exactly two final native Codex SubAgents in parallel:

   - `source-grounding-reviewer`: spot-check quickstart and at least one architecture/workflow page against source and tests.
   - `output-contract-reviewer`: verify writes are limited to `workspace/openwiki`, temporary `_plan.md`/`_skeleton.md` files are absent, front matter is valid, and no obvious secrets appear.

   The parent waits for both, fixes actionable findings, and reruns only a failed reviewer. Remove `_plan.md` and `_skeleton.md` before packaging.

6. Package the complete generated `workspace/openwiki/` tree as UTF-8 text JSON. Binary files are not part of the OpenWiki output contract:

   ```bash
   cd "$OLDPWD"
   python3 - <<'PY'
   import json
   from pathlib import Path

   root = Path("workspace/openwiki")
   files = []
   for file in sorted(root.rglob("*")):
       if file.is_file():
           files.append({"path": file.relative_to(root).as_posix(), "content": file.read_text(encoding="utf-8")})
   if not files:
       raise SystemExit("OpenWiki produced no files")
   Path("outputs").mkdir(exist_ok=True)
   Path("outputs/openwiki-result.json").write_text(
       json.dumps({"schemaVersion": 1, "files": files}, ensure_ascii=False),
       encoding="utf-8",
   )
   PY
   ```

7. Reply only after the artifact exists. Name `openwiki-result.json` and summarize both native reviewer results.

## Chat

Reuse the existing `workspace` and Thread context. Answer from repository/wiki evidence. Do not create an artifact unless documentation changes; if it does, apply the same output contract and final reviews.

## Failure rules

- Missing bundle or generated files: stop with one actionable error.
- A SubAgent failure is a Run failure unless one retry succeeds. Do not fabricate or partially package output.
- Never upload `.env`, private keys, or credential files into `outputs/`.
