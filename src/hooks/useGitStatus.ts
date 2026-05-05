import { useCallback, useEffect, useRef, useState } from "react";

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

interface MtGit {
  status: (cwd: string) => Promise<GitStatus>;
  diff: (
    cwd: string,
    path: string,
    staged: boolean,
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

function gitApi(): MtGit | null {
  if (typeof window === "undefined") return null;
  const mt = (window as unknown as { mt?: { git?: MtGit } }).mt;
  return mt?.git ?? null;
}

const POLL_MS = 3000;

export interface UseGitStatusResult {
  status: GitStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  runMutation: <T>(fn: (api: MtGit) => Promise<T>) => Promise<T>;
  api: MtGit | null;
}

export function useGitStatus(
  cwd: string | undefined,
  enabled: boolean,
): UseGitStatusResult {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const api = gitApi();
  const apiRef = useRef(api);
  apiRef.current = api;
  const pausedRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    const a = apiRef.current;
    const c = cwdRef.current;
    if (!a || !c) {
      setStatus(null);
      return;
    }
    const myId = ++reqIdRef.current;
    setLoading(true);
    try {
      const s = await a.status(c);
      if (myId !== reqIdRef.current) return;
      setStatus(s);
      setError(s.error ?? null);
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      setStatus(null);
      setError((e as Error).message);
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !cwd) {
      reqIdRef.current++;
      setStatus(null);
      setError(null);
      return;
    }
    void fetchOnce();
    const handle = setInterval(() => {
      if (!pausedRef.current) void fetchOnce();
    }, POLL_MS);
    return () => clearInterval(handle);
  }, [cwd, enabled, fetchOnce]);

  const refresh = useCallback(async () => {
    await fetchOnce();
  }, [fetchOnce]);

  const runMutation = useCallback(
    async <T,>(fn: (a: MtGit) => Promise<T>): Promise<T> => {
      const a = apiRef.current;
      if (!a) throw new Error("git api unavailable");
      pausedRef.current = true;
      try {
        const result = await fn(a);
        await fetchOnce();
        return result;
      } finally {
        pausedRef.current = false;
      }
    },
    [fetchOnce],
  );

  return { status, loading, error, refresh, runMutation, api };
}
