import React from "react";
import { render } from "ink-testing-library";
import { describe, expect, test } from "vitest";
import { Header } from "../../../src/cli/components/header.tsx";
import { stripAnsi as plain } from "./ansi.ts";

describe("Header", () => {
  test("compact form shows the Mosoo Codex runtime", () => {
    const { lastFrame } = render(
      <Header compact modelId="my-model-id" subtitle="Agent running" />,
    );

    const frame = plain(lastFrame());
    expect(frame).toContain("OpenWiki");
    expect(frame).toContain("runtime: Mosoo");
    expect(frame).toContain("harness: Codex");
    expect(frame).toContain("Agent running");
  });

  test("full form shows runtime, harness, directory, and the usage tip", () => {
    const { lastFrame } = render(
      <Header modelId="opus" showLogo={false} subtitle="Development dry run" />,
    );

    const frame = plain(lastFrame());
    expect(frame).toContain("runtime: Mosoo");
    expect(frame).toContain("harness: Codex + native SubAgents");
    expect(frame).toContain("directory:");
    expect(frame).toContain("Development dry run");
    expect(frame).toContain("/exit");
  });

});
