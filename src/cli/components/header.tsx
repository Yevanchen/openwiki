import React from "react";
import { Box, Text } from "ink";
import {
  OPENWIKI_VERSION,
} from "../../config/constants.js";
import { sanitizeHeaderValue } from "../diagnostics/sanitize.js";
import { formatCwd } from "../format.js";

/** The OpenWiki ASCII wordmark shown at the top of the full header. */
export const OPENWIKI_LOGO_LINES = [
  "  ___                  __        ___ _    _ ",
  " / _ \\ _ __   ___ _ __ \\ \\      / (_) | _(_)",
  "| | | | '_ \\ / _ \\ '_ \\ \\ \\ /\\ / /| | |/ / |",
  "| |_| | |_) |  __/ | | | \\ V  V / | |   <| |",
  " \\___/| .__/ \\___|_| |_|  \\_/\\_/  |_|_|\\_\\_|",
  "      |_|",
];

/** Width of the widest logo line, used to gate whether the logo fits. */
export const OPENWIKI_LOGO_WIDTH = Math.max(
  ...OPENWIKI_LOGO_LINES.map((line) => line.length),
);

/**
 * Props for the session header.
 */
interface HeaderProps {
  /**
   * @default false Render the full bordered header with logo instead of the
   * single-line compact form.
   */
  compact?: boolean;

  /**
   * @default undefined Fall back to the model env override, then the configured
   * provider's default model id.
   */
  modelId?: string | null;

  /**
   * @default true Show the ASCII logo when it fits the terminal width.
   */
  showLogo?: boolean;

  subtitle: string;
}

/**
 * The session header showing OpenWiki version, provider, model, optional
 * reasoning effort, directory, and LangSmith tracing state. Renders a compact
 * single-line variant or the full bordered form with logo. All interpolated values pass through
 * sanitizeHeaderValue so control characters cannot reach the terminal.
 */
export function Header({
  compact = false,
  modelId,
  showLogo = true,
  subtitle,
}: HeaderProps) {
  const terminalColumns = process.stdout.columns ?? 80;
  void modelId;
  const displayDirectory = sanitizeHeaderValue(
    formatCwd(process.cwd()),
    Math.max(8, terminalColumns - 17),
  );
  const shouldShowLogo = showLogo && terminalColumns > OPENWIKI_LOGO_WIDTH;

  if (compact) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text wrap="truncate">
          <Text color="cyan">{">_ "}</Text>
          <Text bold>OpenWiki</Text>{" "}
          <Text color="gray">v{OPENWIKI_VERSION}</Text>{" "}
          <Text color="gray">runtime: </Text>
          <Text color="white">Mosoo</Text>{" "}
          <Text color="gray">harness: </Text>
          <Text color="white">Codex</Text>
        </Text>
        <Text>
          <Text color="green">* </Text>
          <Text color="cyan">{subtitle}</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {shouldShowLogo ? (
        <Box flexDirection="column" marginBottom={1}>
          {OPENWIKI_LOGO_LINES.map((line) => (
            <Text bold color="cyan" key={line} wrap="truncate">
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box
        borderColor="cyan"
        borderStyle="round"
        flexDirection="column"
        marginBottom={1}
        paddingX={1}
      >
        <Text>
          <Text color="cyan">{">_ "}</Text>
          <Text bold>OpenWiki</Text>{" "}
          <Text color="gray">v{OPENWIKI_VERSION}</Text>{" "}
          <Text color="gray">agent docs for codebases</Text>
        </Text>
        <Text>
          <Text color="gray">runtime: </Text>
          <Text color="white">Mosoo</Text>
        </Text>
        <Text>
          <Text color="gray">harness: </Text>
          <Text color="white">Codex + native SubAgents</Text>
        </Text>
        <Text>
          <Text color="gray">directory: </Text>
          <Text color="white">{displayDirectory}</Text>
        </Text>
      </Box>
      <Text>
        <Text color="green">* </Text>
        <Text color="cyan">{subtitle}</Text>
      </Text>
      <Text color="gray">
        Tip: ask for a docs change, or use /exit when you are done.
      </Text>
    </Box>
  );
}
