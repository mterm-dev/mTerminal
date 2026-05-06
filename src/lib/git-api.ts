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
}

export function getGitApi(): MtGit | null {
  if (typeof window === "undefined") return null;
  const mt = (window as unknown as { mt?: { git?: MtGit } }).mt;
  return mt?.git ?? null;
}
