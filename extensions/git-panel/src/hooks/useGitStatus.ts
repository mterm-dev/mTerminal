import { useCallback, useEffect, useRef, useState } from "react";
import { getGitApi, type GitStatus, type MtGit } from "../lib/git-api";

export type { GitFile, GitStatus } from "../lib/git-api";

const POLL_MS = 3000;
const AUTO_FETCH_MS = 60_000;

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
  const api = getGitApi();
  const apiRef = useRef(api);
  apiRef.current = api;
  const pausedRef = useRef(false);
  const upstreamRef = useRef<string | null>(null);
  upstreamRef.current = status?.upstream ?? null;

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
    const fetchHandle = setInterval(async () => {
      if (pausedRef.current) return;
      if (!upstreamRef.current) return;
      const a = apiRef.current;
      const c = cwdRef.current;
      if (!a || !c) return;
      try {
        await a.fetch(c);
      } catch {
        return;
      }
      if (!pausedRef.current) void fetchOnce();
    }, AUTO_FETCH_MS);
    return () => {
      clearInterval(handle);
      clearInterval(fetchHandle);
    };
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
