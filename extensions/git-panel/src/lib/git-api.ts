export interface GitFile {
  path: string;
  oldPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
  error?: string;
}

export interface GitBranch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitSha: string;
  lastCommitSubject: string;
  lastCommitAuthor: string;
  lastCommitDate: number;
}

export interface GitLogEntry {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  authorEmail: string;
  date: number;
  subject: string;
  refs: string[];
}

export interface GitCommitFile {
  path: string;
  oldPath?: string;
  status: string;
}

export interface GitCommitDetail {
  sha: string;
  parents: string[];
  author: string;
  authorEmail: string;
  date: number;
  subject: string;
  body: string;
  files: GitCommitFile[];
}

export type GitPullStrategy = "ff-only" | "merge" | "rebase";

export interface MtGit {
  status: (cwd: string) => Promise<GitStatus>;
  diff: (
    cwd: string,
    path: string,
    staged: boolean,
    context?: number,
  ) => Promise<{ text: string; truncated: boolean }>;
  stage: (cwd: string, paths: string[]) => Promise<void>;
  unstage: (cwd: string, paths: string[]) => Promise<void>;
  commit: (
    cwd: string,
    message: string,
    paths?: string[],
  ) => Promise<{ commit: string }>;
  push: (
    cwd: string,
    setUpstream?: boolean,
  ) => Promise<{ stdout: string; stderr: string }>;
  pull: (cwd: string) => Promise<{ stdout: string; stderr: string }>;
  fetch: (cwd: string) => Promise<{ stdout: string; stderr: string }>;
  branches: (cwd: string) => Promise<GitBranch[]>;
  checkout: (
    cwd: string,
    ref: string,
    opts?: { createNew?: boolean; newName?: string },
  ) => Promise<void>;
  branchCreate: (
    cwd: string,
    name: string,
    fromRef?: string,
    checkout?: boolean,
  ) => Promise<void>;
  branchDelete: (cwd: string, name: string, force?: boolean) => Promise<void>;
  branchDeleteRemote: (
    cwd: string,
    remote: string,
    name: string,
  ) => Promise<void>;
  branchRename: (
    cwd: string,
    oldName: string,
    newName: string,
  ) => Promise<void>;
  log: (
    cwd: string,
    opts?: { ref?: string; limit?: number; skip?: number; all?: boolean },
  ) => Promise<GitLogEntry[]>;
  show: (cwd: string, sha: string) => Promise<GitCommitDetail>;
  diffCommit: (
    cwd: string,
    sha: string,
    path: string,
    context?: number,
  ) => Promise<{ text: string; truncated: boolean }>;
  incoming: (cwd: string) => Promise<GitLogEntry[]>;
  outgoing: (cwd: string) => Promise<GitLogEntry[]>;
  pullStrategy: (
    cwd: string,
    strategy: GitPullStrategy,
  ) => Promise<{ stdout: string; stderr: string }>;
  stash: (
    cwd: string,
    message?: string,
  ) => Promise<{ created: boolean; stdout: string }>;
  stashPop: (
    cwd: string,
  ) => Promise<{ stdout: string; stderr: string; conflict: boolean }>;
  discardAll: (cwd: string) => Promise<void>;
  listConflicts: (cwd: string) => Promise<ConflictFileEntry[]>;
  readConflictFile: (
    cwd: string,
    path: string,
  ) => Promise<ConflictFile>;
  resolveFile: (cwd: string, path: string, content: string) => Promise<void>;
  mergeState: (cwd: string) => Promise<MergeStateKind>;
  mergeAbort: (cwd: string) => Promise<void>;
}

export type MergeStateKind = "merge" | "rebase" | "cherry-pick" | "revert" | null;

export interface ConflictFileEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
}

export type ConflictSegment =
  | { kind: "common"; lines: string[] }
  | {
      kind: "conflict";
      id: number;
      ours: string[];
      theirs: string[];
      base?: string[];
      labelOurs?: string;
      labelTheirs?: string;
      labelBase?: string;
    };

export interface ConflictFile {
  path: string;
  content: string;
  segments: ConflictSegment[];
  hasConflicts: boolean;
  binary: boolean;
}

export function isConflictFile(f: { indexStatus: string; worktreeStatus: string }): boolean {
  const x = f.indexStatus;
  const y = f.worktreeStatus;
  if (x === "U" || y === "U") return true;
  if (x === "A" && y === "A") return true;
  if (x === "D" && y === "D") return true;
  return false;
}

export function isMergeConflictResult(message: string): boolean {
  if (typeof message !== "string" || message.length === 0) return false;
  if (/CONFLICT\s*\(/i.test(message)) return true;
  if (/Automatic merge failed/i.test(message)) return true;
  if (/fix conflicts and then commit/i.test(message)) return true;
  return false;
}

export function isLocalChangesPullConflict(message: string): boolean {
  if (typeof message !== "string" || message.length === 0) return false;
  if (/would be overwritten by (merge|checkout|reset)/i.test(message)) return true;
  if (/please commit your changes or stash them before/i.test(message)) return true;
  if (/please move or remove them before/i.test(message)) return true;
  return false;
}

export function getGitApi(): MtGit | null {
  if (typeof window === "undefined") return null;
  const mt = (window as unknown as { mt?: { git?: MtGit } }).mt;
  return mt?.git ?? null;
}
