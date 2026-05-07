import type { GitLogEntry } from "./git-api";

export interface GraphEdge {
  fromLane: number;
  toLane: number;
  fromSha: string;
  toSha: string;
}

export interface GraphRow {
  commit: GitLogEntry;
  lane: number;
  edges: GraphEdge[];
  passingLanes: number[];
}

export interface GraphLayout {
  rows: GraphRow[];
  maxLane: number;
}

export function layoutGraph(commits: GitLogEntry[]): GraphLayout {
  const rows: GraphRow[] = [];
  let maxLane = 0;

  let activeLanes: Array<{ sha: string } | null> = [];

  const ensureLane = (sha: string): number => {
    for (let i = 0; i < activeLanes.length; i++) {
      const slot = activeLanes[i];
      if (slot && slot.sha === sha) return i;
    }
    return -1;
  };

  const allocLane = (sha: string): number => {
    for (let i = 0; i < activeLanes.length; i++) {
      if (!activeLanes[i]) {
        activeLanes[i] = { sha };
        return i;
      }
    }
    activeLanes.push({ sha });
    return activeLanes.length - 1;
  };

  for (const commit of commits) {
    let lane = ensureLane(commit.sha);
    if (lane < 0) {
      lane = allocLane(commit.sha);
    }
    activeLanes[lane] = null;

    const edges: GraphEdge[] = [];
    const beforeSnapshot = activeLanes.slice();

    for (let pi = 0; pi < commit.parents.length; pi++) {
      const parent = commit.parents[pi];
      let parentLane = ensureLane(parent);
      if (parentLane < 0) {
        if (pi === 0 && !beforeSnapshot[lane]) {
          parentLane = lane;
          activeLanes[lane] = { sha: parent };
        } else {
          parentLane = allocLane(parent);
        }
      }
      edges.push({
        fromLane: lane,
        toLane: parentLane,
        fromSha: commit.sha,
        toSha: parent,
      });
    }

    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] == null) {
      activeLanes.pop();
    }

    const passingLanes: number[] = [];
    for (let i = 0; i < activeLanes.length; i++) {
      if (i === lane) continue;
      if (activeLanes[i]) passingLanes.push(i);
    }

    rows.push({ commit, lane, edges, passingLanes });
    if (lane > maxLane) maxLane = lane;
    for (const e of edges) {
      if (e.toLane > maxLane) maxLane = e.toLane;
    }
  }

  return { rows, maxLane };
}

const LANE_COLORS = [
  "#7aa6ff",
  "#7ed9c1",
  "#e6a44b",
  "#d97a7a",
  "#b88be8",
  "#88c45c",
  "#e1c453",
  "#5cb6c4",
];

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}
