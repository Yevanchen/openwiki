import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  MOSOO_AGENT_ID_ENV_KEY,
  MOSOO_API_BASE_ENV_KEY,
  MOSOO_API_TOKEN_ENV_KEY,
} from "../config/constants.js";
import { OpenWikiIgnore } from "./openwiki-ignore.js";
import type {
  OpenWikiCommand,
  OpenWikiRunEvent,
  OpenWikiRunOptions,
  OpenWikiRunResult,
} from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const remoteThreads = new Map<string, string>();

type MosooConfig = {
  agentId: string;
  apiBase: string;
  token: string;
};

type MosooEvent = {
  content: string;
  id: string;
  runId: string | null;
  status: "available" | "error" | "unsupported";
  toolCallId?: string;
  toolInput?: Record<string, unknown>;
  toolName?: string;
  type:
    | "agent.message.delta"
    | "agent.thinking.delta"
    | "file.changed"
    | "run.completed"
    | "run.failed"
    | "run.started"
    | "session.status"
    | "session_files.updated"
    | "tool.confirmation.required"
    | "tool.use.completed"
    | "tool.use.started"
    | "usage.updated"
    | "user.message";
};

type ThreadFile = {
  id: string;
  kind: "attachment" | "artifact";
  name: string;
};

type OpenWikiArtifact = {
  schemaVersion: 1;
  files: Array<{ content: string; path: string }>;
};

export function isMosooRuntimeSelected(): boolean {
  return true;
}

export function resolveMosooConfig(
  env: NodeJS.ProcessEnv = process.env,
): MosooConfig {
  const apiBase = env[MOSOO_API_BASE_ENV_KEY]?.trim().replace(/\/+$/u, "");
  const agentId = env[MOSOO_AGENT_ID_ENV_KEY]?.trim();
  const token = env[MOSOO_API_TOKEN_ENV_KEY]?.trim();
  const missing = [
    [MOSOO_API_BASE_ENV_KEY, apiBase],
    [MOSOO_AGENT_ID_ENV_KEY, agentId],
    [MOSOO_API_TOKEN_ENV_KEY, token],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Mosoo runtime requires ${missing.join(", ")}.`);
  }

  return { agentId: agentId!, apiBase: apiBase!, token: token! };
}

export async function runOpenWikiOnMosoo(
  command: OpenWikiCommand,
  cwd: string,
  options: OpenWikiRunOptions,
): Promise<OpenWikiRunResult> {
  if ((options.outputMode ?? "local-wiki") !== "repository") {
    throw new Error("Mosoo runtime currently supports code repositories only.");
  }

  const config = resolveMosooConfig();
  const localThreadId = options.threadId ?? randomUUID();
  let remoteThreadId = remoteThreads.get(localThreadId);
  const message = createMosooMessage(command, options);

  if (!remoteThreadId) {
    const bundle = await createRepositoryBundle(cwd);

    try {
      const fileId = await uploadBundle(config, bundle);
      const created = await requestJson<{
        thread: { id: string };
        run: { id: string } | null;
      }>(
        config,
        `/agents/${encodeURIComponent(config.agentId)}/threads`,
        {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: JSON.stringify({
            userId: `openwiki-${createStableUserId(cwd)}`,
            input: {
              type: "user.message",
              content: [{ type: "text", text: message }],
            },
            resources: [{ type: "file", file_id: fileId }],
          }),
        },
      );
      remoteThreadId = created.thread.id;
      remoteThreads.set(localThreadId, remoteThreadId);
    } finally {
      await rm(path.dirname(bundle), { force: true, recursive: true });
    }
  } else {
    await requestJson(
      config,
      `/threads/${encodeURIComponent(remoteThreadId)}/events`,
      {
        method: "POST",
        headers: { "Idempotency-Key": randomUUID() },
        body: JSON.stringify({
          events: [
            {
              type: "user_message",
              requestId: randomUUID(),
              text: message,
            },
          ],
        }),
      },
    );
  }

  await streamRun(config, remoteThreadId, options.onEvent);

  if (command !== "chat") {
    await downloadOpenWikiArtifact(config, remoteThreadId, cwd);
  }

  return { command, model: "mosoo" };
}

function createMosooMessage(
  command: OpenWikiCommand,
  options: OpenWikiRunOptions,
): string {
  const instruction = options.userMessage?.trim();

  return [
    `Run OpenWiki command: ${command}.`,
    command === "chat"
      ? "Answer in this Thread using the existing workspace."
      : "Use the attached repository.bundle and publish outputs/openwiki-result.json.",
    options.language ? `Output language: ${options.language}.` : "",
    instruction ? `User instruction:\n${instruction}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function createRepositoryBundle(cwd: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "openwiki-mosoo-"));
  const snapshotDir = path.join(tempDir, "snapshot");
  const bundlePath = path.join(tempDir, "repository.bundle");
  const ignore = await OpenWikiIgnore.load(cwd);

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
    );
    const files = stdout
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .filter((file) => !ignore.ignores(file) && !isSensitivePath(file));

    if (files.length === 0) {
      throw new Error("The repository snapshot contains no readable files.");
    }

    for (const file of files) {
      const source = path.resolve(cwd, file);
      const destination = path.resolve(snapshotDir, file);

      if (!source.startsWith(`${path.resolve(cwd)}${path.sep}`)) {
        throw new Error(`Refusing repository path outside the root: ${file}`);
      }

      await mkdir(path.dirname(destination), { recursive: true });
      const sourceStat = await lstat(source).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (!sourceStat) continue;

      if (sourceStat.isSymbolicLink()) {
        const target = await readlink(source);
        const resolvedTarget = path.resolve(path.dirname(source), target);

        if (!resolvedTarget.startsWith(`${path.resolve(cwd)}${path.sep}`)) {
          continue;
        }

        await symlink(target, destination);
      } else if (sourceStat.isFile()) {
        await copyFile(source, destination);
      }
    }

    await execFileAsync("git", ["init", "-q"], { cwd: snapshotDir });
    await execFileAsync("git", ["add", "-A"], { cwd: snapshotDir });
    await execFileAsync(
      "git",
      [
        "-c",
        "user.name=OpenWiki",
        "-c",
        "user.email=openwiki@localhost",
        "commit",
        "-qm",
        "OpenWiki Mosoo snapshot",
      ],
      { cwd: snapshotDir },
    );
    await execFileAsync("git", ["bundle", "create", bundlePath, "HEAD"], {
      cwd: snapshotDir,
    });

    if ((await stat(bundlePath)).size > MAX_UPLOAD_BYTES) {
      throw new Error("Repository snapshot exceeds Mosoo's 64 MiB upload limit.");
    }

    return bundlePath;
  } catch (error) {
    await rm(tempDir, { force: true, recursive: true });
    throw error;
  }
}

function isSensitivePath(file: string): boolean {
  const name = path.posix.basename(file.replaceAll("\\", "/")).toLowerCase();

  if ([".env.example", ".env.sample", ".env.template"].includes(name)) {
    return false;
  }

  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name === "id_rsa" ||
    name === "id_ed25519" ||
    name.endsWith(".key") ||
    name.endsWith(".pem")
  );
}

async function uploadBundle(
  config: MosooConfig,
  bundlePath: string,
): Promise<string> {
  const form = new FormData();
  form.set(
    "file",
    new Blob([await readFile(bundlePath)], { type: "application/octet-stream" }),
    "repository.bundle",
  );
  const response = await requestJson<{ file: { id: string } }>(
    config,
    `/agents/${encodeURIComponent(config.agentId)}/files`,
    { method: "POST", body: form },
  );

  return response.file.id;
}

async function streamRun(
  config: MosooConfig,
  threadId: string,
  onEvent?: (event: OpenWikiRunEvent) => void,
): Promise<void> {
  const response = await fetch(
    `${config.apiBase}/threads/${encodeURIComponent(threadId)}/events/stream?limit=1000`,
    { headers: { Authorization: `Bearer ${config.token}` } },
  );

  if (!response.ok || !response.body) {
    throw await mosooHttpError(response);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let terminalError: Error | undefined;

  while (true) {
    const { done, value } = await reader.read();
    buffer += value ?? "";
    const blocks = buffer.split(/\r?\n\r?\n/u);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const data = block
        .split(/\r?\n/u)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      if (!data) continue;
      const event = JSON.parse(data) as MosooEvent;
      const mapped = mapMosooEvent(event);
      if (mapped) onEvent?.(mapped);

      if (event.type === "run.failed") {
        terminalError = new Error(event.content || "Mosoo Run failed.");
      }

      if (event.type === "run.completed" || event.type === "run.failed") {
        await reader.cancel();
        if (terminalError) throw terminalError;
        return;
      }
    }

    if (done) break;
  }

  throw new Error("Mosoo event stream ended before the Run completed.");
}

export function mapMosooEvent(event: MosooEvent): OpenWikiRunEvent | null {
  if (event.type === "agent.message.delta" && event.content) {
    return { source: "main", type: "text", text: event.content };
  }

  if (event.type === "tool.use.started" && event.toolCallId && event.toolName) {
    return {
      type: "tool_start",
      call: event.toolName,
      id: event.toolCallId,
      input: event.toolInput ?? {},
      name: event.toolName,
    };
  }

  if (event.type === "tool.use.completed" && event.toolCallId && event.toolName) {
    return {
      type: "tool_end",
      id: event.toolCallId,
      name: event.toolName,
      status: event.status === "error" ? "error" : "finished",
    };
  }

  return null;
}

async function downloadOpenWikiArtifact(
  config: MosooConfig,
  threadId: string,
  cwd: string,
): Promise<void> {
  const response = await requestJson<{ files: ThreadFile[] }>(
    config,
    `/threads/${encodeURIComponent(threadId)}/files`,
  );
  const artifact = response.files.find(
    (file) => file.kind === "artifact" && file.name === "openwiki-result.json",
  );

  if (!artifact) {
    throw new Error("Mosoo Run completed without openwiki-result.json.");
  }

  const download = await fetch(
    `${config.apiBase}/files/${encodeURIComponent(artifact.id)}/content`,
    { headers: { Authorization: `Bearer ${config.token}` } },
  );

  if (!download.ok) throw await mosooHttpError(download);
  await applyOpenWikiArtifact(cwd, (await download.json()) as OpenWikiArtifact);
}

export async function applyOpenWikiArtifact(
  cwd: string,
  artifact: OpenWikiArtifact,
): Promise<void> {
  if (artifact.schemaVersion !== 1 || !Array.isArray(artifact.files)) {
    throw new Error("Invalid OpenWiki artifact schema.");
  }

  const target = path.join(cwd, "openwiki");
  const stage = `${target}.mosoo-stage-${randomUUID()}`;
  const backup = `${target}.mosoo-backup-${randomUUID()}`;
  let movedTarget = false;

  try {
    for (const file of artifact.files) {
      if (typeof file.path !== "string" || typeof file.content !== "string") {
        throw new Error("Invalid OpenWiki artifact file entry.");
      }

      const normalized = path.posix.normalize(file.path.replaceAll("\\", "/"));

      if (
        normalized.startsWith("../") ||
        normalized === ".." ||
        path.posix.isAbsolute(normalized)
      ) {
        throw new Error(`Invalid OpenWiki artifact path: ${file.path}`);
      }

      const destination = path.join(stage, ...normalized.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content, "utf8");
    }

    if (artifact.files.length === 0) {
      throw new Error("OpenWiki artifact contains no files.");
    }

    try {
      await rename(target, backup);
      movedTarget = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    await rename(stage, target);
    await rm(backup, { force: true, recursive: true });
  } catch (error) {
    await rm(stage, { force: true, recursive: true });
    if (movedTarget) await rename(backup, target).catch(() => undefined);
    throw error;
  }
}

function createStableUserId(cwd: string): string {
  return Buffer.from(path.resolve(cwd)).toString("base64url").slice(0, 200);
}

async function requestJson<T = unknown>(
  config: MosooConfig,
  pathname: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.token}`);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");
  const response = await fetch(`${config.apiBase}${pathname}`, {
    ...init,
    headers,
  });

  if (!response.ok) throw await mosooHttpError(response);
  return (await response.json()) as T;
}

async function mosooHttpError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;
  const code = payload?.error?.code ? ` (${payload.error.code})` : "";
  return new Error(
    `Mosoo request failed: ${response.status}${code}${
      payload?.error?.message ? ` ${payload.error.message}` : ""
    }`,
  );
}
