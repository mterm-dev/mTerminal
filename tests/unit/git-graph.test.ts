import { describe, it, expect } from "vitest";
import { layoutGraph } from "../../src/lib/git-graph";
import type { GitLogEntry } from "../../src/lib/git-api";

function commit(sha: string, parents: string[] = []): GitLogEntry {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    parents,
    author: "t",
    authorEmail: "t@x",
    date: 0,
    subject: "",
    refs: [],
  };
}

describe("layoutGraph", () => {
  it("places linear history all in lane 0", () => {
    const layout = layoutGraph([
      commit("c", ["b"]),
      commit("b", ["a"]),
      commit("a", []),
    ]);
    expect(layout.maxLane).toBe(0);
    expect(layout.rows.map((r) => r.lane)).toEqual([0, 0, 0]);
  });

  it("allocates separate lanes for diverged tips that share no descendant", () => {
    const layout = layoutGraph([
      commit("merge", ["main2", "feat"]),
      commit("feat", []),
      commit("main2", []),
    ]);
    const featRow = layout.rows.find((r) => r.commit.sha === "feat")!;
    const main2Row = layout.rows.find((r) => r.commit.sha === "main2")!;
    expect(featRow.lane).not.toBe(main2Row.lane);
    expect(layout.maxLane).toBeGreaterThanOrEqual(1);
  });

  it("represents a single merge with two lanes converging", () => {
    const layout = layoutGraph([
      commit("merge", ["main2", "feat"]),
      commit("feat", ["main1"]),
      commit("main2", ["main1"]),
      commit("main1", []),
    ]);
    expect(layout.rows[0].lane).toBe(0);
    expect(layout.rows[0].edges).toHaveLength(2);
    expect(layout.maxLane).toBeGreaterThanOrEqual(1);
    const main1Row = layout.rows.find((r) => r.commit.sha === "main1")!;
    expect(main1Row).toBeDefined();
  });

  it("supports octopus merge with 3 parents", () => {
    const layout = layoutGraph([
      commit("o", ["p1", "p2", "p3"]),
      commit("p1", []),
      commit("p2", []),
      commit("p3", []),
    ]);
    expect(layout.rows[0].edges).toHaveLength(3);
    expect(layout.maxLane).toBeGreaterThanOrEqual(2);
  });

  it("tracks passing lanes for parallel branches", () => {
    const layout = layoutGraph([
      commit("a", ["a-prev"]),
      commit("b", ["b-prev"]),
      commit("a-prev", []),
      commit("b-prev", []),
    ]);
    const aPrevRow = layout.rows.find((r) => r.commit.sha === "a-prev")!;
    expect(aPrevRow.passingLanes.length).toBeGreaterThan(0);
  });
});
