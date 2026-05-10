// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();

vi.mock("../../src/lib/ipc", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => invokeMock(cmd, args),
}));

import { useSystemInfo } from "../../src/hooks/useSystemInfo";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSystemInfo", () => {
  it("calls invoke('system_info') once and returns the resolved info", async () => {
    invokeMock.mockResolvedValueOnce({
      user: "alice",
      host: "rocinante",
      home: "/home/alice",
      platform: "linux",
    });
    const { result } = renderHook(() => useSystemInfo());
    await waitFor(() => {
      expect(result.current).toEqual({
        user: "alice",
        host: "rocinante",
        home: "/home/alice",
        platform: "linux",
      });
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("system_info", undefined);
  });

  it("merges partial responses with defaults", async () => {
    invokeMock.mockResolvedValueOnce({ user: "bob", host: "pluto" });
    const { result } = renderHook(() => useSystemInfo());
    await waitFor(() => {
      expect(result.current.user).toBe("bob");
      expect(result.current.host).toBe("pluto");
    });
    expect(result.current.home).toBe("");
    expect(result.current.platform).toBe("linux");
  });

  it("falls back to defaults on error", async () => {
    invokeMock.mockRejectedValueOnce(new Error("nope"));
    const { result } = renderHook(() => useSystemInfo());

    expect(result.current).toEqual({
      user: "user",
      host: "host",
      home: "",
      platform: "linux",
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(result.current).toEqual({
      user: "user",
      host: "host",
      home: "",
      platform: "linux",
    });
  });
});
