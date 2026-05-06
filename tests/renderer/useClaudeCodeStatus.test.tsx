// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../src/lib/ipc", () => ({
  invoke: vi.fn(),
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

import {
  invoke,
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "../../src/lib/ipc";
import { useClaudeCodeStatus } from "../../src/hooks/useClaudeCodeStatus";

const mInvoke = invoke as unknown as ReturnType<typeof vi.fn>;
const mIsGranted = isPermissionGranted as unknown as ReturnType<typeof vi.fn>;
const mReqPerm = requestPermission as unknown as ReturnType<typeof vi.fn>;
const mSend = sendNotification as unknown as ReturnType<typeof vi.fn>;

function status(state: "none" | "idle" | "thinking" | "awaitingInput") {
  return {
    state,
    running: state !== "none",
    binary: state === "none" ? null : "claude",
    lastActivityMs: 100,
  };
}

beforeEach(() => {
  mInvoke.mockReset();
  mIsGranted.mockReset();
  mReqPerm.mockReset();
  mSend.mockReset();
  mIsGranted.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useClaudeCodeStatus - enabled gating", () => {
  it("1. enabled=false → empty Map, no invoke calls", async () => {
    const ids = new Map<number, number>([[1, 100]]);
    const { result } = renderHook(() =>
      useClaudeCodeStatus(ids, null, { enabled: false }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.size).toBe(0);
    expect(mInvoke).not.toHaveBeenCalled();
    expect(mIsGranted).not.toHaveBeenCalled();
  });

  it("2. enabled=true polls each id with claude_code_status", async () => {
    const ids = new Map<number, number>([
      [1, 100],
      [2, 200],
    ]);
    mInvoke
      .mockResolvedValueOnce(status("idle"))
      .mockResolvedValueOnce(status("thinking"));
    const { result } = renderHook(() =>
      useClaudeCodeStatus(ids, 1, { enabled: true }),
    );
    await waitFor(() => {
      expect(result.current.size).toBe(2);
    });
    expect(mInvoke).toHaveBeenCalledWith("claude_code_status", { tabId: 100 });
    expect(mInvoke).toHaveBeenCalledWith("claude_code_status", { tabId: 200 });
    expect(result.current.get(1)?.state).toBe("idle");
    expect(result.current.get(2)?.state).toBe("thinking");
  });
});

describe("useClaudeCodeStatus - polling interval", () => {
  it("3. polls again after 2000ms tick", async () => {
    vi.useFakeTimers();
    const ids = new Map<number, number>([[1, 100]]);
    mInvoke.mockResolvedValue(status("idle"));
    const { unmount } = renderHook(() =>
      useClaudeCodeStatus(ids, 1, { enabled: true }),
    );
    
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const initialCalls = mInvoke.mock.calls.filter(
      (c) => c[0] === "claude_code_status",
    ).length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    const afterCalls = mInvoke.mock.calls.filter(
      (c) => c[0] === "claude_code_status",
    ).length;
    expect(afterCalls).toBeGreaterThan(initialCalls);
    unmount();
  });

  it("4. cleanup on unmount stops the interval", async () => {
    vi.useFakeTimers();
    const ids = new Map<number, number>([[1, 100]]);
    mInvoke.mockResolvedValue(status("idle"));
    const { unmount } = renderHook(() =>
      useClaudeCodeStatus(ids, 1, { enabled: true }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    unmount();
    const before = mInvoke.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });
    expect(mInvoke.mock.calls.length).toBe(before);
  });
});

describe("useClaudeCodeStatus - permission flow", () => {
  it("5. when isPermissionGranted=false, requestPermission is called", async () => {
    mIsGranted.mockResolvedValue(false);
    mReqPerm.mockResolvedValue("granted");
    const ids = new Map<number, number>();
    renderHook(() => useClaudeCodeStatus(ids, null, { enabled: true }));
    await waitFor(() => expect(mReqPerm).toHaveBeenCalled());
  });

  it("6. when isPermissionGranted=true, requestPermission is NOT called", async () => {
    mIsGranted.mockResolvedValue(true);
    const ids = new Map<number, number>();
    renderHook(() => useClaudeCodeStatus(ids, null, { enabled: true }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mReqPerm).not.toHaveBeenCalled();
  });
});

describe("useClaudeCodeStatus - notification gating", () => {
  it("7. notifies on awaitingInput when tab not active and permission granted", async () => {
    mIsGranted.mockResolvedValue(true);
    const ids = new Map<number, number>([[2, 200]]);
    mInvoke.mockResolvedValue(status("awaitingInput"));
    renderHook(() =>
      useClaudeCodeStatus(ids, 1, {
        enabled: true,
        notifyOnAwaitingInput: true,
      }),
    );
    await waitFor(() => expect(mSend).toHaveBeenCalledTimes(1));
    expect(mSend).toHaveBeenCalledWith({
      title: "Claude Code waiting",
      body: "tab 2 needs your input",
    });
  });

  it("8. suppresses notification when same tab is active", async () => {
    mIsGranted.mockResolvedValue(true);
    const ids = new Map<number, number>([[2, 200]]);
    mInvoke.mockResolvedValue(status("awaitingInput"));
    renderHook(() =>
      useClaudeCodeStatus(ids, 2, {
        enabled: true,
        notifyOnAwaitingInput: true,
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mSend).not.toHaveBeenCalled();
  });

  it("9. suppresses notification when permission denied", async () => {
    mIsGranted.mockResolvedValue(false);
    mReqPerm.mockResolvedValue("denied");
    const ids = new Map<number, number>([[2, 200]]);
    mInvoke.mockResolvedValue(status("awaitingInput"));
    renderHook(() =>
      useClaudeCodeStatus(ids, 1, {
        enabled: true,
        notifyOnAwaitingInput: true,
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mSend).not.toHaveBeenCalled();
  });
});

async function flushAsync(times = 10) {
  for (let i = 0; i < times; i++) {
    
    await Promise.resolve();
  }
}

describe("useClaudeCodeStatus - notification rate-limit", () => {
  it("10. second awaitingInput within 30s does not notify again; after 30s it does", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mIsGranted.mockResolvedValue(true);
    const ids = new Map<number, number>([[2, 200]]);
    mInvoke.mockResolvedValue(status("awaitingInput"));
    renderHook(() =>
      useClaudeCodeStatus(ids, 1, {
        enabled: true,
        notifyOnAwaitingInput: true,
      }),
    );
    
    await act(async () => {
      await flushAsync(20);
    });
    expect(mSend).toHaveBeenCalledTimes(1);

    
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await flushAsync(20);
    });
    expect(mSend).toHaveBeenCalledTimes(1);

    
    await act(async () => {
      vi.advanceTimersByTime(30000);
      await flushAsync(20);
    });
    expect(mSend).toHaveBeenCalledTimes(2);
  });
});

describe("useClaudeCodeStatus - notification reset on state change", () => {
  it("11. once state leaves awaitingInput, returning to it re-notifies immediately", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mIsGranted.mockResolvedValue(true);
    const ids = new Map<number, number>([[2, 200]]);
    
    mInvoke
      .mockResolvedValueOnce(status("awaitingInput"))
      .mockResolvedValueOnce(status("idle"))
      .mockResolvedValueOnce(status("awaitingInput"))
      .mockResolvedValue(status("awaitingInput"));
    renderHook(() =>
      useClaudeCodeStatus(ids, 1, {
        enabled: true,
        notifyOnAwaitingInput: true,
      }),
    );
    await act(async () => {
      await flushAsync(20);
    });
    expect(mSend).toHaveBeenCalledTimes(1);

    
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await flushAsync(20);
    });
    expect(mSend).toHaveBeenCalledTimes(1);

    
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await flushAsync(20);
    });
    expect(mSend).toHaveBeenCalledTimes(2);
  });
});

describe("useClaudeCodeStatus - error swallowing", () => {
  it("12. invoke rejection just omits that tab from snapshot", async () => {
    const ids = new Map<number, number>([
      [1, 100],
      [2, 200],
    ]);
    mInvoke
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(status("idle"));
    const { result } = renderHook(() =>
      useClaudeCodeStatus(ids, null, { enabled: true }),
    );
    await waitFor(() => {
      expect(result.current.size).toBe(1);
    });
    expect(result.current.get(2)?.state).toBe("idle");
    expect(result.current.has(1)).toBe(false);
  });
});
