import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { loadOpenWikiEnv } from "../config/env.js";
import type { RunTelemetryContext } from "../telemetry/index.js";
import { runOpenWikiOnMosoo } from "./mosoo.js";
import type {
  OpenWikiCommand,
  OpenWikiRunOptions,
  OpenWikiRunResult,
} from "./types.js";
import {
  createOpenWikiContentSnapshot,
  getUpdateNoopStatus,
  persistRunMetadataIfChanged,
  shouldCheckUpdateNoop,
  writeLastUpdateMetadata,
} from "./utils.js";
import { OpenWikiIgnore } from "./openwiki-ignore.js";

export async function runOpenWikiAgent(
  command: OpenWikiCommand,
  cwd = process.cwd(),
  options: OpenWikiRunOptions = {},
  telemetryContext: RunTelemetryContext = {},
): Promise<OpenWikiRunResult> {
  await loadOpenWikiEnv();

  const outputMode = options.outputMode ?? "repository";
  const ignore = await OpenWikiIgnore.load(cwd);

  if (command === "update" && shouldCheckUpdateNoop(options)) {
    const noop = await getUpdateNoopStatus(cwd, ignore, options.language);

    if (noop.shouldSkip) {
      await writeLastUpdateMetadata(
        command,
        cwd,
        noop.model,
        outputMode,
        "complete",
        noop.language,
      );
      telemetryContext.outcome = "noop";
      options.onEvent?.({
        type: "text",
        text: "No repository changes detected since the last OpenWiki update; skipping agent run.",
      });
      return { command, model: noop.model, skipped: true };
    }
  }

  const snapshot =
    command === "chat"
      ? null
      : await createOpenWikiContentSnapshot(cwd, outputMode);

  try {
    const result = await runOpenWikiOnMosoo(command, cwd, options);
    await persistRunMetadataIfChanged(
      command,
      cwd,
      result.model,
      outputMode,
      snapshot,
      "complete",
      options.language ?? undefined,
    );
    return result;
  } catch (error) {
    await persistRunMetadataIfChanged(
      command,
      cwd,
      "mosoo",
      outputMode,
      snapshot,
      "interrupted",
      options.language ?? undefined,
    ).catch(() => undefined);
    throw error;
  }
}

export function createOpenWikiThreadId(cwd = process.cwd()): string {
  const repository = createHash("sha256")
    .update(path.resolve(cwd))
    .digest("hex")
    .slice(0, 32);

  return `openwiki-${repository}-${randomUUID()}`;
}
