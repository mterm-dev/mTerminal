// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../src/lib/ipc", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "../../src/lib/ipc";
import { useMcpServer } from "../../src/hooks/useMcpServer";

const mInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mInvoke.mockReset();
});

describe("useMcpServer - mount sync", () => {
  it("1. enabled=true on mount calls mcp_server_start and updates status", async () => {
    mInvoke.mockResolvedValueOnce({ running: true, socketPath: "/tmp/s.sock" });
    const { result } = renderHook(() => useMcpServer(true));
    await waitFor(() => {
      expect(result.current.status.running).toBe(true);
    });
    expect(mInvoke).toHaveBeenCalledWith("mcp_server_start");
    expect(result.current.status.socketPath).toBe("/tmp/s.sock");
  });

  it("2. enabled=false on mount calls mcp_server_stop and updates status", async () => {
    mInvoke.mockResolvedValueOnce({ running: false, socketPath: null });
    const { result } = renderHook(() => useMcpServer(false));
    await waitFor(() => {
      expect(mInvoke).toHaveBeenCalledWith("mcp_server_stop");
    });
    expect(result.current.status.running).toBe(false);
    expect(result.current.status.socketPath).toBeNull();
  });

  it("3. flipping enabled triggers the opposite channel", async () => {
    mInvoke.mockResolvedValueOnce({ running: false, socketPath: null });
    const { result, rerender } = renderHook(
      ({ e }: { e: boolean }) => useMcpServer(e),
      { initialProps: { e: false } },
    );
    await waitFor(() => {
      expect(mInvoke).toHaveBeenCalledWith("mcp_server_stop");
    });
    mInvoke.mockResolvedValueOnce({ running: true, socketPath: "/p.sock" });
    rerender({ e: true });
    await waitFor(() => {
      expect(mInvoke).toHaveBeenCalledWith("mcp_server_start");
    });
    await waitFor(() => {
      expect(result.current.status.running).toBe(true);
    });
    expect(result.current.status.socketPath).toBe("/p.sock");
  });
});

describe("useMcpServer - error handling", () => {
  it("4. when start/stop rejects, falls back to refresh via mcp_server_status", async () => {
    mInvoke.mockRejectedValueOnce(new Error("nope"));
    mInvoke.mockResolvedValueOnce({ running: false, socketPath: null });
    const { result } = renderHook(() => useMcpServer(true));
    await waitFor(() => {
      expect(mInvoke).toHaveBeenCalledWith("mcp_server_status");
    });
    expect(result.current.status.running).toBe(false);
  });

  it("5. when both start and refresh reject, status becomes safe default", async () => {
    mInvoke.mockRejectedValueOnce(new Error("start fail"));
    mInvoke.mockRejectedValueOnce(new Error("refresh fail"));
    const { result } = renderHook(() => useMcpServer(true));
    await waitFor(() => {
      expect(mInvoke).toHaveBeenCalledWith("mcp_server_status");
    });
    expect(result.current.status).toEqual({ running: false, socketPath: null });
  });
});

describe("useMcpServer - exposed refresh()", () => {
  it("6. refresh() invokes mcp_server_status and updates status", async () => {
    mInvoke.mockResolvedValueOnce({ running: true, socketPath: "/a.sock" });
    const { result } = renderHook(() => useMcpServer(true));
    await waitFor(() => expect(result.current.status.running).toBe(true));

    mInvoke.mockResolvedValueOnce({ running: false, socketPath: null });
    await act(async () => {
      await result.current.refresh();
    });
    expect(mInvoke).toHaveBeenLastCalledWith("mcp_server_status");
    expect(result.current.status).toEqual({
      running: false,
      socketPath: null,
    });
  });

  it("7. refresh() rejection resets status to safe default", async () => {
    mInvoke.mockResolvedValueOnce({ running: true, socketPath: "/x.sock" });
    const { result } = renderHook(() => useMcpServer(true));
    await waitFor(() => expect(result.current.status.running).toBe(true));

    mInvoke.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toEqual({
      running: false,
      socketPath: null,
    });
  });
});
