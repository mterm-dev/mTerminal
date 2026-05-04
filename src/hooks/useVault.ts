import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
}

const IDLE_LOCK_MS = 15 * 60 * 1000;

export function useVault(enabled: boolean) {
  const [status, setStatus] = useState<VaultStatus>({ exists: false, unlocked: false });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const s = await invoke<VaultStatus>("vault_status");
      setStatus(s);
    } catch {
      setStatus({ exists: false, unlocked: false });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setStatus({ exists: false, unlocked: false });
      return;
    }
    refresh();
  }, [enabled, refresh]);

  const armIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      invoke("vault_lock")
        .catch(() => {})
        .finally(() => refresh());
    }, IDLE_LOCK_MS);
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !status.unlocked) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }
    armIdleTimer();
    const onActivity = () => armIdleTimer();
    window.addEventListener("keydown", onActivity);
    window.addEventListener("mousedown", onActivity);
    return () => {
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("mousedown", onActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [enabled, status.unlocked, armIdleTimer]);

  const init = useCallback(
    async (masterPassword: string) => {
      await invoke("vault_init", { masterPassword });
      await refresh();
    },
    [refresh],
  );

  const unlock = useCallback(
    async (masterPassword: string) => {
      await invoke("vault_unlock", { masterPassword });
      await refresh();
    },
    [refresh],
  );

  const lock = useCallback(async () => {
    await invoke("vault_lock");
    await refresh();
  }, [refresh]);

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      await invoke("vault_change_password", {
        oldPassword,
        newPassword,
      });
      await refresh();
    },
    [refresh],
  );

  return { status, refresh, init, unlock, lock, changePassword };
}
