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
}

export function getGitApi(): MtGit | null {
  if (typeof window === "undefined") return null;
  const mt = (window as unknown as { mt?: { git?: MtGit } }).mt;
  return mt?.git ?? null;
}
