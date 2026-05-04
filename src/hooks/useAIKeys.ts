import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const PROVIDERS = ["anthropic", "openai"] as const;
type ProviderId = (typeof PROVIDERS)[number];

export function useAIKeys(vaultUnlocked: boolean) {
  const [hasKey, setHasKey] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    if (!vaultUnlocked) {
      setHasKey({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const p of PROVIDERS) {
      try {
        next[p] = await invoke<boolean>("ai_has_key", { provider: p });
      } catch {
        next[p] = false;
      }
    }
    setHasKey(next);
  }, [vaultUnlocked]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setKey = useCallback(
    async (provider: ProviderId, key: string) => {
      await invoke("ai_set_key", { provider, key });
      await refresh();
    },
    [refresh],
  );

  const clearKey = useCallback(
    async (provider: ProviderId) => {
      await invoke("ai_clear_key", { provider });
      await refresh();
    },
    [refresh],
  );

  return { hasKey, setKey, clearKey, refresh };
}
