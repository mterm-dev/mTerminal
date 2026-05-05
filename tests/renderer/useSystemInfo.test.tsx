// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();

vi.mock("../../src/lib/tauri-shim", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => invokeMock(cmd, args),
}));

import { useSystemInfo } from "../../src/hooks/useSystemInfo";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSystemInfo", () => {
  it("calls invoke('system_info') once and returns the resolved {user,host}", async () => {
    invokeMock.mockResolvedValueOnce({ user: "alice", host: "rocinante" });
    const { result } = renderHook(() => useSystemInfo());
    await waitFor(() => {
      expect(result.current).toEqual({ user: "alice", host: "rocinante" });
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("system_info", undefined);
  });

  it("falls back to default {user:'user', host:'host'} on error", async () => {
    invokeMock.mockRejectedValueOnce(new Error("nope"));
    const { result } = renderHook(() => useSystemInfo());
    
    expect(result.current).toEqual({ user: "user", host: "host" });
    
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current).toEqual({ user: "user", host: "host" });
  });
});
