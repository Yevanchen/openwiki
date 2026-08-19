import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  applyOpenWikiArtifact,
  createRepositoryBundle,
  mapMosooEvent,
  resolveMosooConfig,
  runOpenWikiOnMosoo,
} from "../../src/agent/mosoo.ts";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "openwiki-mosoo-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("Mosoo runtime configuration", () => {
  test("requires every server-side value without echoing secrets", () => {
    expect(() =>
      resolveMosooConfig({}),
    ).toThrow("MOSOO_API_BASE, MOSOO_AGENT_ID, MOSOO_API_TOKEN");
  });
});

describe("Mosoo repository snapshot", () => {
  test("includes working-tree files but excludes secrets and .openwikiignore paths", async () => {
    const repo = await tempDir();
    await execFileAsync("git", ["init", "-q"], { cwd: repo });
    await writeFile(path.join(repo, "package.json"), '{"name":"fixture"}\n');
    await writeFile(path.join(repo, ".env"), "SECRET=do-not-upload\n");
    await writeFile(path.join(repo, ".openwikiignore"), "private.txt\n");
    await writeFile(path.join(repo, "private.txt"), "private\n");
    await writeFile(path.join(repo, "working.txt"), "uncommitted\n");

    const bundle = await createRepositoryBundle(repo);
    const clone = await tempDir();
    await rm(clone, { recursive: true });
    await execFileAsync("git", ["clone", "-q", bundle, clone]);

    await expect(readFile(path.join(clone, "working.txt"), "utf8")).resolves.toBe(
      "uncommitted\n",
    );
    await expect(readFile(path.join(clone, ".env"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(clone, "private.txt"), "utf8")).rejects.toThrow();
  });

  test("ignores tracked files deleted from the working tree", async () => {
    const repo = await tempDir();
    await execFileAsync("git", ["init", "-q"], { cwd: repo });
    await writeFile(path.join(repo, "README.md"), "fixture\n");
    await writeFile(path.join(repo, "removed.txt"), "gone\n");
    await execFileAsync("git", ["add", "."], { cwd: repo });
    await execFileAsync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"],
      { cwd: repo },
    );
    await rm(path.join(repo, "removed.txt"));

    await expect(createRepositoryBundle(repo)).resolves.toMatch(
      /repository\.bundle$/u,
    );
  });
});

describe("Mosoo event projection", () => {
  test("maps message and tool lifecycle events into the existing UI contract", () => {
    expect(
      mapMosooEvent({
        content: "hello",
        id: "event-1",
        runId: "run-1",
        status: "available",
        type: "agent.message.delta",
      }),
    ).toEqual({ source: "main", type: "text", text: "hello" });
    expect(
      mapMosooEvent({
        content: "",
        id: "event-2",
        runId: "run-1",
        status: "available",
        toolCallId: "tool-1",
        toolInput: { path: "README.md" },
        toolName: "read",
        type: "tool.use.started",
      }),
    ).toMatchObject({ id: "tool-1", name: "read", type: "tool_start" });
  });
});

describe("Mosoo artifact application", () => {
  test("replaces the wiki atomically and rejects traversal", async () => {
    const repo = await tempDir();
    await applyOpenWikiArtifact(repo, {
      schemaVersion: 1,
      files: [{ path: "quickstart.md", content: "# New\n" }],
    });
    await expect(
      readFile(path.join(repo, "openwiki", "quickstart.md"), "utf8"),
    ).resolves.toBe("# New\n");

    await expect(
      applyOpenWikiArtifact(repo, {
        schemaVersion: 1,
        files: [{ path: "../escape.md", content: "bad" }],
      }),
    ).rejects.toThrow("Invalid OpenWiki artifact path");
    await expect(
      readFile(path.join(repo, "openwiki", "quickstart.md"), "utf8"),
    ).resolves.toBe("# New\n");
  });
});

describe("Mosoo Public Thread workflow", () => {
  test("uploads, streams, and applies a completed run", async () => {
    vi.stubEnv("MOSOO_API_BASE", "https://mosoo.example/api/v1");
    vi.stubEnv("MOSOO_AGENT_ID", "agent-1");
    vi.stubEnv("MOSOO_API_TOKEN", "server-secret");
    const repo = await tempDir();
    await execFileAsync("git", ["init", "-q"], { cwd: repo });
    await writeFile(path.join(repo, "README.md"), "fixture\n");
    const events: string[] = [];
    const responses = [
      Response.json({ file: { id: "file-1" } }),
      Response.json({ thread: { id: "thread-1" }, run: { id: "run-1" } }),
      new Response(
        [
          'event: thread.event\ndata: {"content":"working","id":"event-1","runId":"run-1","status":"available","type":"agent.message.delta"}\n\n',
          'event: thread.event\ndata: {"content":"","id":"event-2","runId":"run-1","status":"available","type":"run.completed"}\n\n',
        ].join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
      Response.json({
        files: [
          { id: "artifact-1", kind: "artifact", name: "openwiki-result.json" },
        ],
      }),
      Response.json({
        schemaVersion: 1,
        files: [{ path: "quickstart.md", content: "# Cloud wiki\n" }],
      }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(responses.shift()!)),
    );

    await runOpenWikiOnMosoo("init", repo, {
      outputMode: "repository",
      threadId: "local-thread",
      onEvent: (event) => {
        if (event.type === "text") events.push(event.text);
      },
    });

    expect(events).toEqual(["working"]);
    await expect(
      readFile(path.join(repo, "openwiki", "quickstart.md"), "utf8"),
    ).resolves.toBe("# Cloud wiki\n");
  });
});
