import { describe, it, expect } from "vitest";
import {
  diffWords,
  parseUnifiedDiffSideBySide,
  type DiffRow,
} from "../../src/lib/diff-parse";

function rowsByType(rows: DiffRow[], type: DiffRow["type"]) {
  return rows.filter((r) => r.type === type);
}

describe("diffWords", () => {
  it("returns no changed spans for identical strings", () => {
    const { left, right } = diffWords("foo bar", "foo bar");
    expect(left.every((s) => !s.changed)).toBe(true);
    expect(right.every((s) => !s.changed)).toBe(true);
    expect(left.map((s) => s.text).join("")).toBe("foo bar");
    expect(right.map((s) => s.text).join("")).toBe("foo bar");
  });

  it("marks inserted word as changed only on right", () => {
    const { left, right } = diffWords("foo bar", "foo NEW bar");
    expect(left.some((s) => s.changed)).toBe(false);
    const changedRight = right.filter((s) => s.changed).map((s) => s.text).join("");
    expect(changedRight).toContain("NEW");
  });

  it("marks deleted word as changed only on left", () => {
    const { left, right } = diffWords("foo OLD bar", "foo bar");
    const changedLeft = left.filter((s) => s.changed).map((s) => s.text).join("");
    expect(changedLeft).toContain("OLD");
    expect(right.some((s) => s.changed)).toBe(false);
  });

  it("marks single-token replacement on both sides", () => {
    const { left, right } = diffWords("a = 1", "a = 2");
    expect(left.filter((s) => s.changed).map((s) => s.text).join("")).toContain("1");
    expect(right.filter((s) => s.changed).map((s) => s.text).join("")).toContain("2");
  });

  it("preserves full text concatenation on both sides", () => {
    const a = "foo OLD bar baz";
    const b = "foo NEW bar baz qux";
    const { left, right } = diffWords(a, b);
    expect(left.map((s) => s.text).join("")).toBe(a);
    expect(right.map((s) => s.text).join("")).toBe(b);
  });
});

describe("parseUnifiedDiffSideBySide", () => {
  it("returns [] for empty input", () => {
    expect(parseUnifiedDiffSideBySide("")).toEqual([]);
  });

  it("emits only context rows for unchanged file with full context", () => {
    const text = [
      "diff --git a/x b/x",
      "--- a/x",
      "+++ b/x",
      "@@ -1,3 +1,3 @@",
      " line1",
      " line2",
      " line3",
      "",
    ].join("\n");
    const rows = parseUnifiedDiffSideBySide(text);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.type).toBe("hunk");
    expect(rowsByType(rows, "context")).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      type: "context",
      leftNo: 1,
      rightNo: 1,
      leftText: "line1",
      rightText: "line1",
    });
  });

  it("emits add-only rows for newly added file", () => {
    const text = [
      "diff --git a/dev/null b/x",
      "--- /dev/null",
      "+++ b/x",
      "@@ -0,0 +1,2 @@",
      "+hello",
      "+world",
      "",
    ].join("\n");
    const rows = parseUnifiedDiffSideBySide(text);
    expect(rows[0]?.type).toBe("hunk");
    const adds = rowsByType(rows, "add");
    expect(adds).toHaveLength(2);
    expect(adds[0]).toMatchObject({ rightNo: 1, rightText: "hello" });
    expect(adds[1]).toMatchObject({ rightNo: 2, rightText: "world" });
    expect(adds.every((r) => r.leftNo === undefined)).toBe(true);
  });

  it("emits del-only rows for deleted file", () => {
    const text = [
      "diff --git a/x b/dev/null",
      "--- a/x",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-gone1",
      "-gone2",
      "",
    ].join("\n");
    const rows = parseUnifiedDiffSideBySide(text);
    const dels = rowsByType(rows, "del");
    expect(dels).toHaveLength(2);
    expect(dels[0]).toMatchObject({ leftNo: 1, leftText: "gone1" });
    expect(dels[1]).toMatchObject({ leftNo: 2, leftText: "gone2" });
    expect(dels.every((r) => r.rightNo === undefined)).toBe(true);
  });

  it("pairs - and + lines into change rows with word spans, leftover becomes add", () => {
    const text = [
      "@@ -1,2 +1,3 @@",
      "-foo bar",
      "-baz",
      "+foo BAR",
      "+baz",
      "+extra",
      "",
    ].join("\n");
    const rows = parseUnifiedDiffSideBySide(text);
    const changes = rowsByType(rows, "change");
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      leftNo: 1,
      rightNo: 1,
      leftText: "foo bar",
      rightText: "foo BAR",
    });
    expect(changes[0]?.leftSpans?.length).toBeGreaterThan(0);
    expect(changes[0]?.rightSpans?.some((s) => s.changed)).toBe(true);
    const adds = rowsByType(rows, "add");
    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatchObject({ rightNo: 3, rightText: "extra" });
  });

  it("resets line numbers per hunk", () => {
    const text = [
      "@@ -10,1 +10,1 @@",
      "-old10",
      "+new10",
      "@@ -50,1 +52,1 @@",
      "-old50",
      "+new52",
      "",
    ].join("\n");
    const rows = parseUnifiedDiffSideBySide(text);
    const hunks = rowsByType(rows, "hunk");
    expect(hunks).toHaveLength(2);
    const changes = rowsByType(rows, "change");
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ leftNo: 10, rightNo: 10 });
    expect(changes[1]).toMatchObject({ leftNo: 50, rightNo: 52 });
  });

  it('skips "\\ No newline at end of file" markers', () => {
    const text = [
      "@@ -1,1 +1,1 @@",
      "-foo",
      "\\ No newline at end of file",
      "+bar",
      "\\ No newline at end of file",
      "",
    ].join("\n");
    const rows = parseUnifiedDiffSideBySide(text);
    const changes = rowsByType(rows, "change");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ leftText: "foo", rightText: "bar" });
  });

  it("ignores file headers before the first hunk", () => {
    const text = [
      "diff --git a/x b/x",
      "index abc..def 100644",
      "--- a/x",
      "+++ b/x",
      "@@ -1,1 +1,1 @@",
      "-a",
      "+b",
      "",
    ].join("\n");
    const rows = parseUnifiedDiffSideBySide(text);
    expect(rows[0]?.type).toBe("hunk");
    expect(rows.slice(1).every((r) => r.type !== "hunk")).toBe(true);
  });
});
