import { describe, expect, test } from "vitest";
import { validateOkfFrontmatter } from "../../src/okf/frontmatter.ts";

function markdown(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n\n# Page\n`;
}


describe("validateOkfFrontmatter", () => {
  test("accepts the required type and supported optional fields", () => {
    expect(validateOkfFrontmatter(markdown("type: Reference"))).toEqual({
      valid: true,
    });
    expect(
      validateOkfFrontmatter(
        markdown(
          [
            "type: API Endpoint",
            'title: "Create order"',
            "description: >-",
            "  Creates a completed",
            "  order.",
            "resource: https://example.com/orders",
            "tags:",
            "  - api",
            "  - orders",
          ].join("\n"),
        ),
      ),
    ).toEqual({ valid: true });
  });

  test("accepts the legacy v0.1 timestamp and producer-defined extension fields", () => {
    expect(
      validateOkfFrontmatter(
        markdown(
          [
            "type: Reference",
            'timestamp: "2026-07-16T20:00:00Z"',
            "author: steve",
            "confidence: 0.95",
            "review_state: verified",
          ].join("\n"),
        ),
      ),
    ).toEqual({ valid: true });
  });

  test("accepts the v0.2 provenance, trust, and lifecycle families", () => {
    expect(
      validateOkfFrontmatter(
        markdown(
          [
            "type: Reference",
            "generated: {by: openwiki/0.3.0, at: 2026-08-04T09:00:00Z}",
            "verified:",
            "  - {by: human:ahormati, at: 2026-08-05T09:00:00Z}",
            "  - {by: process:finance-nightly, at: 2026-08-06T02:00:00Z}",
            "sources:",
            "  - id: spec",
            "    resource: https://example.com/spec",
            "    author: team:docs",
            "    usage_count: 5000",
            "    last_modified: 2026-05-30",
            "usage_window: {from: 2026-06-01, to: 2026-06-30}",
            "status: stable",
            "stale_after: 2026-09-23",
          ].join("\n"),
        ),
      ),
    ).toEqual({ valid: true });
  });

  test("accepts a bare verified mapping as a one-element list", () => {
    // §5.2: a single verifier may be written without the list dash.
    expect(
      validateOkfFrontmatter(
        markdown(
          "type: Reference\nverified: {by: human:ahormati, at: 2026-08-05T09:00:00Z}",
        ),
      ),
    ).toEqual({ valid: true });
  });

  test("reports malformed v0.2 family fields", () => {
    const result = validateOkfFrontmatter(
      markdown(
        [
          "type: Reference",
          "generated: 2026-08-04",
          "verified:",
          "  - {at: 2026-08-05T09:00:00Z}",
          "sources:",
          "  - {id: spec}",
          "status: verified",
          "stale_after: soon",
        ].join("\n"),
      ),
    );

    expect(result).toMatchObject({
      issues: [
        { code: "invalid_generated" },
        { code: "invalid_verified" },
        { code: "invalid_sources" },
        { code: "invalid_status" },
        { code: "invalid_stale_after" },
      ],
      valid: false,
    });
  });

  test("reports deterministic delimiter and required-field issues", () => {
    expect(validateOkfFrontmatter("# Page")).toEqual({
      issues: [
        {
          code: "missing_opening_delimiter",
          line: 1,
          message: "File must begin with `---`.",
        },
      ],
      valid: false,
    });
    expect(validateOkfFrontmatter("---\ntype: Reference")).toMatchObject({
      issues: [{ code: "missing_closing_delimiter" }],
      valid: false,
    });
    expect(validateOkfFrontmatter(markdown("title: Page"))).toMatchObject({
      issues: [{ code: "missing_type" }],
      valid: false,
    });
  });

  test("reports malformed and duplicate YAML", () => {
    for (const frontmatter of [
      "type: [unterminated",
      "type: Reference\ntype: Playbook",
    ]) {
      expect(validateOkfFrontmatter(markdown(frontmatter))).toMatchObject({
        issues: [{ code: "invalid_yaml" }],
        valid: false,
      });
    }
    const malformed = validateOkfFrontmatter(
      markdown("type: Reference\ndescription: [unterminated"),
    );
    if (malformed.valid) throw new Error("Expected invalid YAML.");
    expect(malformed.issues[0].message).toContain("line 3");
  });

  test("reports mistyped standard fields", () => {
    const result = validateOkfFrontmatter(
      markdown(
        [
          "type: Reference",
          "timestamp: [Not a string]",
          "title: [Not a string]",
          "description: 123",
          "tags: docs, api",
          "producer_extension: preserved",
        ].join("\n"),
      ),
    );

    expect(result).toMatchObject({
      issues: [
        { code: "invalid_title" },
        { code: "invalid_description" },
        { code: "invalid_timestamp" },
        { code: "invalid_tags" },
      ],
      valid: false,
    });
  });
});
