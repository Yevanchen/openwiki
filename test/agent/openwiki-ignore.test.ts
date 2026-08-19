import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  OPENWIKI_IGNORE_FILE,
  OpenWikiIgnore,
  OpenWikiIgnoreRule,
} from "../../src/agent/openwiki-ignore.ts";

describe(".openwikiignore rules", () => {
  test("matches comments, directory rules, globs, negation, and root anchoring", () => {
    const rules = OpenWikiIgnore.parse(`
# ignored paths
secrets/
*.log
!logs/keep.log
/build
`);

    expect(rules.isActive).toBe(true);
    expect(rules.ignores("secrets/token.txt")).toBe(true);
    expect(rules.ignores("src/secrets/token.txt")).toBe(true);
    expect(rules.ignores("logs/debug.log")).toBe(true);
    expect(rules.ignores("logs/keep.log")).toBe(false);
    expect(rules.ignores("build/index.js")).toBe(true);
    expect(rules.ignores("src/build/index.js")).toBe(false);
    expect(rules.ignores("src/index.ts")).toBe(false);
  });

  test("canonicalizes ./ and ../ so anchored rules cannot be bypassed", () => {
    const rules = OpenWikiIgnore.parse(`
/secrets
`);

    // Baseline: the plainly-spelled path is excluded.
    expect(rules.ignores("secrets/token.txt")).toBe(true);
    expect(rules.ignores("/secrets/token.txt")).toBe(true);

    // Equivalent spellings that must resolve to the same excluded path.
    expect(rules.ignores("./secrets/token.txt")).toBe(true);
    expect(rules.ignores("secrets/../secrets/token.txt")).toBe(true);
    expect(rules.ignores("./secrets/../secrets/token.txt")).toBe(true);

    // A path that genuinely resolves elsewhere stays allowed.
    expect(rules.ignores("secrets/../public.txt")).toBe(false);
  });

  test("matches case-insensitively so alternate casing cannot bypass a rule", () => {
    const rules = OpenWikiIgnore.parse(`
secrets/
*.log
`);

    // On case-insensitive filesystems (macOS, Windows) these spellings all
    // resolve to the same excluded files, so they must all be ignored.
    expect(rules.ignores("secrets/token.txt")).toBe(true);
    expect(rules.ignores("Secrets/token.txt")).toBe(true);
    expect(rules.ignores("SECRETS/token.txt")).toBe(true);
    expect(rules.ignores("secrets/Token.TXT")).toBe(true);
    expect(rules.ignores("app/DEBUG.LOG")).toBe(true);
  });

  test("matches ** globstars spanning directories and ? single characters", () => {
    const rules = OpenWikiIgnore.parse(`
**/build/
logs/**
cache?
`);

    // `**/` spans zero or more leading directories.
    expect(rules.ignores("build/out.js")).toBe(true);
    expect(rules.ignores("a/b/build/out.js")).toBe(true);

    // A trailing bare `**` spans everything nested under the directory.
    expect(rules.ignores("logs/a/b/c.txt")).toBe(true);

    // `?` matches exactly one non-slash character - no more, no fewer.
    expect(rules.ignores("cacheX")).toBe(true);
    expect(rules.ignores("cacheXY")).toBe(false);
    expect(rules.ignores("cache")).toBe(false);
  });

  test("compile yields no rule for a pattern that is empty after stripping markers", () => {
    // A lone anchor, negation, or blank collapses to nothing and must not compile
    // into a rule that would match everything.
    expect(OpenWikiIgnoreRule.compile("/")).toBeUndefined();
    expect(OpenWikiIgnoreRule.compile("!")).toBeUndefined();
    expect(OpenWikiIgnoreRule.compile("")).toBeUndefined();

    const rules = new OpenWikiIgnore(["/", "!", ""]);
    expect(rules.isActive).toBe(false);
    expect(rules.ignores("anything")).toBe(false);
  });
});

describe("OpenWikiIgnore.load", () => {
  test("treats a missing .openwikiignore as an inactive matcher", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "openwiki-load-"));

    const ignore = await OpenWikiIgnore.load(repo);

    expect(ignore.isActive).toBe(false);
    expect(ignore.ignores("secrets/token.txt")).toBe(false);
  });

  test("parses an existing .openwikiignore into active rules", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "openwiki-load-"));
    await writeFile(
      path.join(repo, OPENWIKI_IGNORE_FILE),
      "secrets/\n*.log\n",
      "utf8",
    );

    const ignore = await OpenWikiIgnore.load(repo);

    expect(ignore.isActive).toBe(true);
    expect(ignore.patterns).toEqual(["secrets/", "*.log"]);
    expect(ignore.ignores("secrets/token.txt")).toBe(true);
  });

  test("rethrows a non-missing-file read error rather than disabling rules", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "openwiki-load-"));
    // A directory named .openwikiignore makes readFile fail with EISDIR. That is
    // not a missing-file case, so the loader must propagate it instead of silently
    // returning an inactive (fail-open) matcher.
    await mkdir(path.join(repo, OPENWIKI_IGNORE_FILE));

    await expect(OpenWikiIgnore.load(repo)).rejects.toThrow();
  });
});
