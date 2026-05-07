// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("../../src/lib/ipc", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

import { VaultGateProvider, useVaultGate } from "../../src/vault/VaultGate";
import type { ReactNode } from "react";

function wrapper(props: { enabled?: boolean; idleLockMs?: number }) {
  const { enabled = true, idleLockMs = 0 } = props;
  return ({ children }: { children: ReactNode }) => (
    <VaultGateProvider enabled={enabled} idleLockMs={idleLockMs}>
      {children}
    </VaultGateProvider>
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

describe("VaultGate.ensure", () => {
  it("resolves true immediately when already unlocked", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: true };
      return undefined;
    });
    const { result } = renderHook(() => useVaultGate(), {
      wrapper: wrapper({ enabled: true }),
    });
    await waitFor(() => expect(result.current.status.unlocked).toBe(true));
    let outcome: boolean | null = null;
    await act(async () => {
      outcome = await result.current.ensure();
    });
    expect(outcome).toBe(true);
    expect(result.current.modal).toBeNull();
  });

  it("returns false when gate is disabled", async () => {
    const { result } = renderHook(() => useVaultGate(), {
      wrapper: wrapper({ enabled: false }),
    });
    let outcome: boolean | null = null;
    await act(async () => {
      outcome = await result.current.ensure();
    });
    expect(outcome).toBe(false);
  });

  it("opens modal when locked and resolves true after unlock", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: false };
      return undefined;
    });
    const { result } = renderHook(() => useVaultGate(), {
      wrapper: wrapper({ enabled: true }),
    });
    await waitFor(() => expect(result.current.status.exists).toBe(true));

    let pending: Promise<boolean> | null = null;
    act(() => {
      pending = result.current.ensure();
    });
    await waitFor(() => expect(result.current.modal).not.toBeNull());
    expect(result.current.modal?.mode).toBe("unlock");

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_unlock") return undefined;
      if (cmd === "vault_status") return { exists: true, unlocked: true };
      return undefined;
    });
    await act(async () => {
      await result.current.unlock("pw");
    });
    const ok = await pending!;
    expect(ok).toBe(true);
  });

  it("returns init mode when no vault exists yet", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: false, unlocked: false };
      return undefined;
    });
    const { result } = renderHook(() => useVaultGate(), {
      wrapper: wrapper({ enabled: true }),
    });
    await waitFor(() => expect(result.current.status.exists).toBe(false));
    act(() => {
      void result.current.ensure();
    });
    await waitFor(() => expect(result.current.modal?.mode).toBe("init"));
  });

  it("queues concurrent ensure() calls and resolves all on a single unlock", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: false };
      return undefined;
    });
    const { result } = renderHook(() => useVaultGate(), {
      wrapper: wrapper({ enabled: true }),
    });
    await waitFor(() => expect(result.current.status.exists).toBe(true));

    let p1: Promise<boolean> | null = null;
    let p2: Promise<boolean> | null = null;
    act(() => {
      p1 = result.current.ensure();
      p2 = result.current.ensure();
    });
    await waitFor(() => expect(result.current.modal).not.toBeNull());

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_unlock") return undefined;
      if (cmd === "vault_status") return { exists: true, unlocked: true };
      return undefined;
    });
    await act(async () => {
      await result.current.unlock("pw");
    });
    expect(await p1!).toBe(true);
    expect(await p2!).toBe(true);
  });

  it("closeModal resolves pending ensure() with false", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: false };
      return undefined;
    });
    const { result } = renderHook(() => useVaultGate(), {
      wrapper: wrapper({ enabled: true }),
    });
    await waitFor(() => expect(result.current.status.exists).toBe(true));
    let pending: Promise<boolean> | null = null;
    act(() => {
      pending = result.current.ensure();
    });
    await waitFor(() => expect(result.current.modal).not.toBeNull());
    act(() => {
      result.current.closeModal();
    });
    expect(await pending!).toBe(false);
    expect(result.current.modal).toBeNull();
  });
});
