import { useCallback, useEffect, useState } from "react";
import { invoke } from "../lib/ipc";
import { useAiProviders } from "../lib/ai-availability";

/**
 * Tracks which registered AI providers (those with `requiresVault: true`)
 * currently have an API key stored in the vault. The provider list is
 * dynamic — comes from whichever SDK extensions the user has installed.
 */
export function useAIKeys(vaultUnlocked: boolean) {
  // Re-render when providers register/unregister so the key map stays fresh.
  const providers = useAiProviders();

  const [hasKey, setHasKey] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    if (!vaultUnlocked) {
      setHasKey({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const p of providers) {
      if (!p.requiresVault) continue;
      try {
        next[p.id] = await invoke<boolean>("ai_vault_key_has", { provider: p.id });
      } catch {
        next[p.id] = false;
      }
    }
    setHasKey(next);
  }, [vaultUnlocked, providers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setKey = useCallback(
    async (provider: string, key: string) => {
      await invoke("ai_vault_key_set", { provider, key });
      await refresh();
    },
    [refresh],
  );

  const clearKey = useCallback(
    async (provider: string) => {
      await invoke("ai_vault_key_clear", { provider });
      await refresh();
    },
    [refresh],
  );

  return { hasKey, setKey, clearKey, refresh };
}
