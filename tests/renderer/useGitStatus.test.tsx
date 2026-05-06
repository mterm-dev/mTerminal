// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { statusMock, fetchMock, gitApi } = vi.hoisted(() => {
  const statusMock = vi.fn();
  const fetchMock = vi.fn();
  const gitApi = {
    status: statusMock,
    fetch: fetchMock,
    diff: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    branches: vi.fn(),
    checkout: vi.fn(),
    branchCreate: vi.fn(),
    branchDelete: vi.fn(),
    branchDeleteRemote: vi.fn(),
    branchRename: vi.fn(),
    log: vi.fn(),
    show: vi.fn(),
    diffCommit: vi.fn(),
    incoming: vi.fn(),
    outgoing: vi.fn(),
    pullStrategy: vi.fn(),
  };
  return { statusMock, fetchMock, gitApi };
});

vi.mock("../../src/lib/git-api", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/git-api")>(
    "../../src/lib/git-api",
  );
  return { ...actual, getGitApi: () => gitApi };
});

import { useGitStatus } from "../../src/hooks/useGitStatus";

beforeEach(() => {
  vi.useFakeTimers();
  statusMock.mockReset();
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const baseStatus = {
  isRepo: true,
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 2,
  files: [],
};

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useGitStatus auto-fetch", () => {
  it("calls git fetch on the auto-fetch interval and refreshes status", async () => {
    statusMock.mockResolvedValue(baseStatus);
    fetchMock.mockResolvedValue({ stdout: "", stderr: "" });

    renderHook(() => useGitStatus("/repo", true));
    await flushMicrotasks();
    const initialStatusCalls = statusMock.mock.calls.length;
    expect(initialStatusCalls).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/repo");
    expect(statusMock.mock.calls.length).toBeGreaterThan(initialStatusCalls);
  });

  it("does not call git fetch when there is no upstream", async () => {
    statusMock.mockResolvedValue({ ...baseStatus, upstream: null });
    fetchMock.mockResolvedValue({ stdout: "", stderr: "" });

    renderHook(() => useGitStatus("/repo", true));
    await flushMicrotasks();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows fetch errors silently", async () => {
    statusMock.mockResolvedValue(baseStatus);
    fetchMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useGitStatus("/repo", true));
    await flushMicrotasks();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("stops auto-fetching when disabled", async () => {
    statusMock.mockResolvedValue(baseStatus);
    fetchMock.mockResolvedValue({ stdout: "", stderr: "" });

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useGitStatus("/repo", enabled),
      { initialProps: { enabled: true } },
    );
    await flushMicrotasks();

    rerender({ enabled: false });
    await flushMicrotasks();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
