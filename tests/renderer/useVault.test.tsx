// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("../../src/lib/ipc", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => invokeMock(cmd, args),
}));

import { useVault } from "../../src/hooks/useVault";

beforeEach(() => {
  vi.clearAllMocks();
  
  invokeMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useVault - enabled gating", () => {
  it("enabled=false → status stays {exists:false, unlocked:false}, no invoke", async () => {
    const { result } = renderHook(() => useVault(false));
    
    await Promise.resolve();
    expect(result.current.status).toEqual({ exists: false, unlocked: false });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("enabled=true → calls vault_status once on mount; status reflects result", async () => {
    invokeMock.mockResolvedValueOnce({ exists: true, unlocked: false });
    const { result } = renderHook(() => useVault(true));
    await waitFor(() => {
      expect(result.current.status).toEqual({ exists: true, unlocked: false });
    });
    const statusCalls = invokeMock.mock.calls.filter((c) => c[0] === "vault_status");
    expect(statusCalls).toHaveLength(1);
  });

  it("falls back to {exists:false, unlocked:false} on vault_status error", async () => {
    invokeMock.mockRejectedValueOnce(new Error("io"));
    const { result } = renderHook(() => useVault(true));
    await waitFor(() => {
      expect(result.current.status).toEqual({ exists: false, unlocked: false });
    });
  });
});

describe("useVault - mutations", () => {
  it("init() calls vault_init then refreshes", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: false, unlocked: false };
      return undefined;
    });
    const { result } = renderHook(() => useVault(true));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("vault_status", undefined);
    });

    let initCalled = false;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_init") {
        initCalled = true;
        return undefined;
      }
      if (cmd === "vault_status") return { exists: true, unlocked: true };
      return undefined;
    });

    await act(async () => {
      await result.current.init("pw");
    });
    expect(initCalled).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("vault_init", { masterPassword: "pw" });
    await waitFor(() => {
      expect(result.current.status).toEqual({ exists: true, unlocked: true });
    });
  });

  it("unlock() calls vault_unlock then refreshes", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: false };
      return undefined;
    });
    const { result } = renderHook(() => useVault(true));
    await waitFor(() => expect(result.current.status.exists).toBe(true));

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_unlock") return undefined;
      if (cmd === "vault_status") return { exists: true, unlocked: true };
      return undefined;
    });

    await act(async () => {
      await result.current.unlock("pw");
    });
    expect(invokeMock).toHaveBeenCalledWith("vault_unlock", { masterPassword: "pw" });
    await waitFor(() => expect(result.current.status.unlocked).toBe(true));
  });

  it("lock() calls vault_lock then refreshes", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: true };
      return undefined;
    });
    const { result } = renderHook(() => useVault(true));
    await waitFor(() => expect(result.current.status.unlocked).toBe(true));

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_lock") return undefined;
      if (cmd === "vault_status") return { exists: true, unlocked: false };
      return undefined;
    });

    await act(async () => {
      await result.current.lock();
    });
    expect(invokeMock).toHaveBeenCalledWith("vault_lock", undefined);
    await waitFor(() => expect(result.current.status.unlocked).toBe(false));
  });

  it("changePassword() calls vault_change_password with both fields then refreshes", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: true };
      return undefined;
    });
    const { result } = renderHook(() => useVault(true));
    await waitFor(() => expect(result.current.status.unlocked).toBe(true));

    await act(async () => {
      await result.current.changePassword("old", "new");
    });
    expect(invokeMock).toHaveBeenCalledWith("vault_change_password", {
      oldPassword: "old",
      newPassword: "new",
    });
  });
});

describe("useVault - idle timer", () => {
  it("auto-locks after 15 minutes when unlocked", async () => {
    vi.useFakeTimers();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: true };
      return undefined;
    });
    const { result } = renderHook(() => useVault(true));
    
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toEqual({ exists: true, unlocked: true });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    });
    expect(invokeMock).toHaveBeenCalledWith("vault_lock", undefined);
  });

  it("activity (keydown) resets the idle timer", async () => {
    vi.useFakeTimers();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: true };
      return undefined;
    });
    const { result } = renderHook(() => useVault(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status.unlocked).toBe(true);

    
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14 * 60 * 1000);
    });
    const lockedYet = invokeMock.mock.calls.some((c) => c[0] === "vault_lock");
    expect(lockedYet).toBe(false);

    
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown"));
    });

    
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14 * 60 * 1000);
    });
    expect(invokeMock.mock.calls.some((c) => c[0] === "vault_lock")).toBe(false);

    
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1 * 60 * 1000);
    });
    expect(invokeMock).toHaveBeenCalledWith("vault_lock", undefined);
  });

  it("idle timer is not armed when locked", async () => {
    vi.useFakeTimers();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "vault_status") return { exists: true, unlocked: false };
      return undefined;
    });
    renderHook(() => useVault(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    });
    expect(invokeMock.mock.calls.some((c) => c[0] === "vault_lock")).toBe(false);
  });
});
