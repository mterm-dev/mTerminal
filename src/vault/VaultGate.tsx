import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "../lib/ipc";
import { setVaultGateBridge } from "../extensions/vault-gate-bridge";

export type VaultModalMode = "init" | "unlock" | "change";
export type VaultModalPhase = "input" | "decrypting" | "success";

export interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
  dev?: boolean;
}

export interface VaultModalState {
  mode: VaultModalMode;
  phase: VaultModalPhase;
}

export interface VaultGateValue {
  status: VaultStatus;
  modal: VaultModalState | null;
  enabled: boolean;
  ensure(): Promise<boolean>;
  init(masterPassword: string): Promise<void>;
  unlock(masterPassword: string): Promise<void>;
  lock(): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  devReset(): Promise<void>;
  openModal(mode: VaultModalMode): void;
  closeModal(): void;
  setModalPhase(phase: VaultModalPhase): void;
  refresh(): Promise<void>;
}

const VaultGateContext = createContext<VaultGateValue | null>(null);

export function useVaultGate(): VaultGateValue {
  const ctx = useContext(VaultGateContext);
  if (!ctx) throw new Error("useVaultGate used outside VaultGateProvider");
  return ctx;
}

interface ProviderProps {
  enabled: boolean;
  idleLockMs: number;
  children: ReactNode;
}

export function VaultGateProvider({ enabled, idleLockMs, children }: ProviderProps) {
  const [status, setStatus] = useState<VaultStatus>({ exists: false, unlocked: false });
  const [modal, setModal] = useState<VaultModalState | null>(null);

  const pendingResolversRef = useRef<Array<(ok: boolean) => void>>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<VaultStatus>("vault_status");
      setStatus(s);
    } catch {
      setStatus({ exists: false, unlocked: false });
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus({ exists: false, unlocked: false });
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  const resolvePending = useCallback((ok: boolean) => {
    const list = pendingResolversRef.current;
    pendingResolversRef.current = [];
    for (const fn of list) {
      try {
        fn(ok);
      } catch {}
    }
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    resolvePending(false);
  }, [resolvePending]);

  const setModalPhase = useCallback((phase: VaultModalPhase) => {
    setModal((m) => (m ? { ...m, phase } : m));
  }, []);

  const openModal = useCallback((mode: VaultModalMode) => {
    setModal((cur) => (cur ? cur : { mode, phase: "input" }));
  }, []);

  const ensure = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    if (statusRef.current.unlocked) return true;
    const mode: VaultModalMode = statusRef.current.exists ? "unlock" : "init";
    const promise = new Promise<boolean>((resolve) => {
      pendingResolversRef.current.push(resolve);
    });
    setModal((cur) => (cur ? cur : { mode, phase: "input" }));
    return promise;
  }, [enabled]);

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
      await invoke("vault_change_password", { oldPassword, newPassword });
      await refresh();
    },
    [refresh],
  );

  const devReset = useCallback(async () => {
    await invoke("vault_dev_reset");
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (modal && status.unlocked && modal.phase !== "decrypting") {
      const t = setTimeout(() => {
        resolvePending(true);
        setModal(null);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [modal, status.unlocked, resolvePending]);

  useEffect(() => {
    const armIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (idleLockMs <= 0) return;
      idleTimerRef.current = setTimeout(() => {
        invoke("vault_lock")
          .catch(() => {})
          .finally(() => {
            void refresh();
          });
      }, idleLockMs);
    };

    if (!enabled || !status.unlocked || idleLockMs <= 0) {
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
  }, [enabled, status.unlocked, idleLockMs, refresh]);

  const value = useMemo<VaultGateValue>(
    () => ({
      status,
      modal,
      enabled,
      ensure,
      init,
      unlock,
      lock,
      changePassword,
      devReset,
      openModal,
      closeModal,
      setModalPhase,
      refresh,
    }),
    [
      status,
      modal,
      enabled,
      ensure,
      init,
      unlock,
      lock,
      changePassword,
      devReset,
      openModal,
      closeModal,
      setModalPhase,
      refresh,
    ],
  );

  useEffect(() => {
    setVaultGateBridge({
      ensure,
      isUnlocked: () => statusRef.current.unlocked,
    });
    return () => setVaultGateBridge(null);
  }, [ensure]);

  return (
    <VaultGateContext.Provider value={value}>{children}</VaultGateContext.Provider>
  );
}
