import { useSyncExternalStore } from "react";
import { getAiProviderRegistry, type AiProviderEntry } from "../extensions/registries/providers-ai";

/**
 * The registry's `list()` returns a fresh array each call. To keep
 * `useSyncExternalStore`'s `getSnapshot` referentially stable between
 * unrelated re-renders (otherwise React loops complaining about
 * "Maximum update depth exceeded"), we cache the snapshot and only
 * recompute it when the registry actually fires a change notification.
 */
let cachedList: AiProviderEntry[] = [];
let cachedHas: boolean = false;
let initialized = false;

function refresh(): void {
  cachedList = getAiProviderRegistry().list();
  cachedHas = cachedList.length > 0;
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  refresh();
  getAiProviderRegistry().subscribe(() => refresh());
}

/** Reactive flag: at least one AI provider extension installed and active. */
export function useHasAiProviders(): boolean {
  ensureInitialized();
  return useSyncExternalStore(
    (cb) => {
      const sub = getAiProviderRegistry().subscribe(cb);
      return () => sub.dispose();
    },
    () => cachedHas,
    () => cachedHas,
  );
}

/** Reactive snapshot of the current AI provider list. */
export function useAiProviders(): AiProviderEntry[] {
  ensureInitialized();
  return useSyncExternalStore(
    (cb) => {
      const sub = getAiProviderRegistry().subscribe(cb);
      return () => sub.dispose();
    },
    () => cachedList,
    () => cachedList,
  );
}
