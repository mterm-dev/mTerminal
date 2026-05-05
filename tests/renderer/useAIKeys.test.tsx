// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();

vi.mock("../../src/lib/tauri-shim", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => invokeMock(cmd, args),
}));

import { useAIKeys } from "../../src/hooks/useAIKeys";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAIKeys", () => {
  it("with vaultUnlocked=false: hasKey is empty and never calls invoke", async () => {
    const { result } = renderHook(() => useAIKeys(false));
    await waitFor(() => {
      expect(result.current.hasKey).toEqual({});
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("on mount with vaultUnlocked=true: queries ai_has_key for both providers", async () => {
    invokeMock.mockImplementation(async (_cmd: string, args: { provider: string }) => {
      return args.provider === "anthropic";
    });
    const { result } = renderHook(() => useAIKeys(true));
    await waitFor(() => {
      expect(result.current.hasKey.anthropic).toBe(true);
      expect(result.current.hasKey.openai).toBe(false);
    });
    const cmds = invokeMock.mock.calls.map((c) => c[0]);
    expect(cmds).toEqual(["ai_has_key", "ai_has_key"]);
    const providers = invokeMock.mock.calls.map((c) => (c[1] as { provider: string }).provider);
    expect(providers.sort()).toEqual(["anthropic", "openai"]);
  });

  it("rejecting ai_has_key falls back to false for that provider", async () => {
    invokeMock.mockImplementation(async (_cmd: string, args: { provider: string }) => {
      if (args.provider === "anthropic") throw new Error("nope");
      return true;
    });
    const { result } = renderHook(() => useAIKeys(true));
    await waitFor(() => {
      expect(result.current.hasKey.anthropic).toBe(false);
      expect(result.current.hasKey.openai).toBe(true);
    });
  });

  it("setKey calls ai_set_key then refreshes", async () => {
    
    invokeMock.mockResolvedValue(false);
    const { result } = renderHook(() => useAIKeys(true));
    await waitFor(() => {
      expect(result.current.hasKey.anthropic).toBe(false);
    });

    invokeMock.mockReset();
    
    invokeMock.mockImplementation(async (cmd: string, args: { provider: string }) => {
      if (cmd === "ai_set_key") return undefined;
      if (cmd === "ai_has_key") return args.provider === "anthropic";
      return undefined;
    });

    await act(async () => {
      await result.current.setKey("anthropic", "sk-xxx");
    });
    expect(invokeMock).toHaveBeenCalledWith("ai_set_key", {
      provider: "anthropic",
      key: "sk-xxx",
    });
    await waitFor(() => {
      expect(result.current.hasKey.anthropic).toBe(true);
      expect(result.current.hasKey.openai).toBe(false);
    });
  });

  it("clearKey calls ai_clear_key then refreshes", async () => {
    invokeMock.mockResolvedValue(true);
    const { result } = renderHook(() => useAIKeys(true));
    await waitFor(() => {
      expect(result.current.hasKey.anthropic).toBe(true);
    });

    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string, args: { provider: string }) => {
      if (cmd === "ai_clear_key") return undefined;
      if (cmd === "ai_has_key") return args.provider !== "openai";
      return undefined;
    });

    await act(async () => {
      await result.current.clearKey("openai");
    });
    expect(invokeMock).toHaveBeenCalledWith("ai_clear_key", { provider: "openai" });
    await waitFor(() => {
      expect(result.current.hasKey.openai).toBe(false);
      expect(result.current.hasKey.anthropic).toBe(true);
    });
  });

  it("refresh() can be called manually and re-reads provider state", async () => {
    let allowed = false;
    invokeMock.mockImplementation(async () => allowed);
    const { result } = renderHook(() => useAIKeys(true));
    await waitFor(() => {
      expect(result.current.hasKey.anthropic).toBe(false);
    });
    allowed = true;
    await act(async () => {
      await result.current.refresh();
    });
    await waitFor(() => {
      expect(result.current.hasKey.anthropic).toBe(true);
      expect(result.current.hasKey.openai).toBe(true);
    });
  });

  it("flipping vaultUnlocked from true → false clears hasKey", async () => {
    invokeMock.mockResolvedValue(true);
    const { result, rerender } = renderHook(
      ({ unlocked }: { unlocked: boolean }) => useAIKeys(unlocked),
      { initialProps: { unlocked: true } },
    );
    await waitFor(() => {
      expect(result.current.hasKey.anthropic).toBe(true);
    });
    rerender({ unlocked: false });
    await waitFor(() => {
      expect(result.current.hasKey).toEqual({});
    });
  });
});
