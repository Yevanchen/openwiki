import React from "react";
import { render } from "ink-testing-library";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  ChatHistory,
  ChatInput,
  SlashMenu,
} from "../../../src/cli/components/chat.tsx";
import type { CompletedRun } from "../../../src/cli/components/types.ts";
import { saveOpenWikiEnv } from "../../../src/config/env.ts";
import { stripAnsi as plain } from "./ansi.ts";

// The secret-input path persists credentials to ~/.openwiki/.env. Mock the writer
// so the tests exercise that path without ever touching the real filesystem; the
// rest of config/env stays real via importOriginal.
vi.mock("../../../src/config/env.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/config/env.ts")>();
  return { ...actual, saveOpenWikiEnv: vi.fn(() => Promise.resolve()) };
});

/** A no-op async handler for ChatInput callbacks. */
async function noopAsync(): Promise<void> {}

/**
 * Let queued microtasks and one macrotask settle so the input handler's async
 * work (submit, credential save, menu selection) completes before assertions.
 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe("ChatHistory", () => {
  test("renders nothing when there are no completed runs", () => {
    const { lastFrame } = render(<ChatHistory runs={[]} />);
    expect(plain(lastFrame())).toBe("");
  });

  test("renders each run's prompt, status line, and log", () => {
    const runs: CompletedRun[] = [
      {
        id: 1,
        command: "init",
        log: [{ content: "Wrote 5 pages.", id: 1, type: "text" }],
        message: "seed the wiki",
        reasoningEffort: "max",
        result: { command: "init", model: "opus" },
      },
    ];

    const { lastFrame } = render(<ChatHistory runs={runs} />);
    const frame = plain(lastFrame());

    expect(frame).toContain("seed the wiki");
    expect(frame).toContain("Complete");
    expect(frame).toContain("openwiki init - opus (effort: max)");
    expect(frame).toContain("Wrote 5 pages.");
  });

  test("shows a placeholder when a run captured no output", () => {
    const runs: CompletedRun[] = [
      {
        id: 2,
        command: "update",
        log: [],
        message: null,
        reasoningEffort: null,
        result: { command: "update", model: "sonnet" },
      },
    ];

    const { lastFrame } = render(<ChatHistory runs={runs} />);
    const frame = plain(lastFrame());
    expect(frame).toContain("No assistant output captured.");
    expect(frame).not.toContain("effort:");
  });
});

describe("SlashMenu", () => {
  test("renders the command menu with a highlighted selection", () => {
    const { lastFrame } = render(
      <SlashMenu
        currentModelId="opus"
        currentProvider="anthropic"
        currentReasoningEffort={null}
        input="/"
        menuState={{ kind: "commands", selectedIndex: 0 }}
      />,
    );
    const frame = plain(lastFrame());

    expect(frame).toContain("Commands");
    expect(frame).toContain("Use arrows, enter to select, esc to cancel.");
  });

  test("renders the provider menu labeled with providers", () => {
    const { lastFrame } = render(
      <SlashMenu
        currentModelId="opus"
        currentProvider="anthropic"
        currentReasoningEffort={null}
        input="/provider"
        menuState={{ kind: "provider", selectedIndex: 0 }}
      />,
    );
    const frame = plain(lastFrame());

    expect(frame).toContain("Providers");
  });

  test("renders the model menu labeled for the current provider", () => {
    const { lastFrame } = render(
      <SlashMenu
        currentModelId="opus"
        currentProvider="anthropic"
        currentReasoningEffort={null}
        input="/model"
        menuState={{ kind: "model", selectedIndex: 0 }}
      />,
    );
    const frame = plain(lastFrame());

    expect(frame).toContain("Models for");
  });

  test("renders only supported reasoning efforts for the selected model", () => {
    const { lastFrame } = render(
      <SlashMenu
        currentModelId="nvidia/nemotron-3-super-120b-a12b"
        currentProvider="nvidia"
        currentReasoningEffort="high"
        input="/effort"
        menuState={{ kind: "effort", selectedIndex: 3 }}
      />,
    );
    const frame = plain(lastFrame());

    expect(frame).toContain("Reasoning effort for NVIDIA NIM");
    expect(frame).toContain("Provider default");
    expect(frame).toContain("none");
    expect(frame).toContain("low");
    expect(frame).toContain("high");
    expect(frame).not.toContain("max");
  });
});

describe("ChatInput", () => {
  test("renders the empty-state placeholder and hint line", () => {
    const { lastFrame, unmount } = render(
      <ChatInput
        currentModelId="opus"
        currentProvider="anthropic"
        currentReasoningEffort={null}
        onClear={() => {}}
        onCommandRun={() => {}}
        onModelSelect={noopAsync}
        onProviderSelect={noopAsync}
        onReasoningEffortSelect={noopAsync}
        onSubmit={() => {}}
      />,
    );
    const frame = plain(lastFrame());

    expect(frame).toContain("Ask a follow-up...");
    expect(frame).toContain("enter to send");
    unmount();
  });
});

describe("ChatInput keyboard interactions", () => {
  /**
   * Renders ChatInput with fresh spy callbacks the tests can assert on.
   *
   * Async because Ink registers the `useInput` stdin listener in an effect that
   * runs after the first render; we flush once here so a keystroke written by
   * the very first `press` is not dropped before that listener attaches.
   */
  async function renderInput(
    overrides: Partial<
      Pick<
        React.ComponentProps<typeof ChatInput>,
        | "currentModelId"
        | "currentProvider"
        | "currentReasoningEffort"
        | "onReasoningEffortSelect"
      >
    > = {},
  ) {
    const onClear = vi.fn();
    const onCommandRun = vi.fn();
    const onModelSelect = vi.fn(() => Promise.resolve());
    const onProviderSelect = vi.fn(() => Promise.resolve());
    const onReasoningEffortSelect =
      overrides.onReasoningEffortSelect ?? vi.fn(() => Promise.resolve());
    const onSubmit = vi.fn();

    const utils = render(
      <ChatInput
        currentModelId={overrides.currentModelId ?? "opus"}
        currentProvider={overrides.currentProvider ?? "anthropic"}
        currentReasoningEffort={overrides.currentReasoningEffort ?? null}
        onClear={onClear}
        onCommandRun={onCommandRun}
        onModelSelect={onModelSelect}
        onProviderSelect={onProviderSelect}
        onReasoningEffortSelect={onReasoningEffortSelect}
        onSubmit={onSubmit}
      />,
    );

    /**
     * Write one keystroke and let it commit before the next. The Ink
     * `useInput` handler closes over the current `input` value, so back-to-back
     * synchronous writes make a later keystroke (e.g. Enter) read a stale value
     * and submit an empty string. Flushing between writes keeps each render in
     * step with the input the test just typed.
     */
    const press = async (data: string): Promise<void> => {
      utils.stdin.write(data);
      await flush();
    };

    // Let the mount effect attach the stdin listener before any keystroke.
    await flush();

    return {
      ...utils,
      press,
      onClear,
      onCommandRun,
      onModelSelect,
      onProviderSelect,
      onReasoningEffortSelect,
      onSubmit,
    };
  }

  beforeEach(() => {
    vi.mocked(saveOpenWikiEnv).mockClear();
  });

  test("echoes typed characters", async () => {
    const { press, lastFrame, unmount } = await renderInput();

    await press("hello");
    expect(plain(lastFrame())).toContain("hello");
    unmount();
  });

  test("backspace deletes the last character", async () => {
    const { press, lastFrame, unmount } = await renderInput();

    await press("abc");
    await press("\u007f");
    const frame = plain(lastFrame());
    expect(frame).toContain("ab");
    expect(frame).not.toContain("abc");
    unmount();
  });

  test("cursor movement keys do not disturb the typed value", async () => {
    const { press, lastFrame, unmount } = await renderInput();

    await press("word");
    await press("\u001b[D"); // left
    await press("\u001b[C"); // right
    await press("\u0001"); // ctrl-a (home)
    await press("\u0005"); // ctrl-e (end)
    expect(plain(lastFrame())).toContain("word");
    unmount();
  });

  test("submits a plain message and clears the input", async () => {
    const { press, onSubmit, unmount } = await renderInput();

    await press("document the parser");
    await press("\r");

    expect(onSubmit).toHaveBeenCalledWith("document the parser");
    unmount();
  });

  test("shows an error when submitting an empty message", async () => {
    const { press, lastFrame, onSubmit, unmount } = await renderInput();

    await press("\r");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(plain(lastFrame())).toContain("Enter a follow-up message.");
    unmount();
  });

  test("opens the command menu when the input starts with a slash", async () => {
    const { press, lastFrame, unmount } = await renderInput();

    await press("/");

    const frame = plain(lastFrame());
    expect(frame).toContain("Commands");
    // Arrow navigation over the menu must not throw.
    await press("\u001b[B");
    await press("\u001b[A");
    expect(plain(lastFrame())).toContain("Commands");
    unmount();
  });

  test("/help surfaces the slash-command help notice", async () => {
    const { press, lastFrame, unmount } = await renderInput();

    await press("/help");
    await press("\r");

    expect(plain(lastFrame())).toContain("Slash commands:");
    unmount();
  });

  test("/clear resets the thread and notifies", async () => {
    const { press, lastFrame, onClear, unmount } = await renderInput();

    await press("/clear");
    await press("\r");

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(plain(lastFrame())).toContain("Started a new chat thread.");
    unmount();
  });

  test("/init runs the init command", async () => {
    const { press, onCommandRun, unmount } = await renderInput();

    await press("/init");
    await press("\r");

    expect(onCommandRun).toHaveBeenCalledWith("init", null);
    unmount();
  });

  test("/exit submits the exit sentinel", async () => {
    const { press, onSubmit, unmount } = await renderInput();

    await press("/exit");
    await press("\r");

    expect(onSubmit).toHaveBeenCalledWith("/exit");
    unmount();
  });

  test("an unknown slash command reports an error", async () => {
    const { press, lastFrame, unmount } = await renderInput();

    await press("/bogus");
    await press("\r");

    expect(plain(lastFrame())).toContain("Unknown command: /bogus");
    unmount();
  });

});
