// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { invokeMock, MockChannel } = vi.hoisted(() => {
  class MockChannel<T> {
    public onmessage: ((msg: T) => void) | null = null;
    public unsubscribe: (() => void) | null = null;
  }
  return { invokeMock: vi.fn(), MockChannel };
});

vi.mock("../../src/lib/ipc", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => invokeMock(cmd, args),
  Channel: MockChannel,
}));

import { useAI, listModels, type AiEvent } from "../../src/hooks/useAI";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAI - complete()", () => {
  it("invokes ai_stream_complete with channel and proper null defaults", async () => {
    invokeMock.mockResolvedValueOnce(42);
    const { result } = renderHook(() => useAI());

    let handle!: { taskId: number; cancel: () => Promise<void> };
    await act(async () => {
      handle = await result.current.complete({
        provider: "anthropic",
        model: "claude-opus-4-7",
        messages: [{ role: "user", content: "hi" }],
      });
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = invokeMock.mock.calls[0];
    expect(cmd).toBe("ai_stream_complete");
    expect(args.provider).toBe("anthropic");
    expect(args.model).toBe("claude-opus-4-7");
    expect(args.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(args.system).toBeNull();
    expect(args.maxTokens).toBeNull();
    expect(args.temperature).toBeNull();
    expect(args.baseUrl).toBeNull();
    expect(args.events).toBeInstanceOf(MockChannel);
    expect(handle.taskId).toBe(42);
    expect(typeof handle.cancel).toBe("function");
  });

  it("forwards optional args (system, maxTokens, temperature, baseUrl)", async () => {
    invokeMock.mockResolvedValueOnce(7);
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.complete({
        provider: "openai",
        model: "gpt-5",
        messages: [],
        system: "be brief",
        maxTokens: 500,
        temperature: 0.5,
        baseUrl: "https://example.com/v1",
      });
    });
    const args = invokeMock.mock.calls[0][1];
    expect(args.system).toBe("be brief");
    expect(args.maxTokens).toBe(500);
    expect(args.temperature).toBe(0.5);
    expect(args.baseUrl).toBe("https://example.com/v1");
  });

  it("Channel.onmessage dispatches delta/done/error to callbacks", async () => {
    invokeMock.mockResolvedValueOnce(1);
    const { result } = renderHook(() => useAI());
    const onDelta = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await act(async () => {
      await result.current.complete({
        provider: "anthropic",
        model: "m",
        messages: [],
        onDelta,
        onDone,
        onError,
      });
    });

    const channel: MockChannel<AiEvent> = invokeMock.mock.calls[0][1].events;
    channel.onmessage!({ kind: "delta", value: "hello" });
    channel.onmessage!({ kind: "delta", value: " world" });
    channel.onmessage!({
      kind: "done",
      value: { inTokens: 10, outTokens: 5, costUsd: 0.001 },
    });
    channel.onmessage!({ kind: "error", value: "boom" });

    expect(onDelta).toHaveBeenCalledTimes(2);
    expect(onDelta).toHaveBeenNthCalledWith(1, "hello");
    expect(onDelta).toHaveBeenNthCalledWith(2, " world");
    expect(onDone).toHaveBeenCalledWith({ inTokens: 10, outTokens: 5, costUsd: 0.001 });
    expect(onError).toHaveBeenCalledWith("boom");
  });
});

describe("useAI - cancel()", () => {
  it("calls invoke('ai_cancel', {taskId}); double-cancel still invokes a second time without error", async () => {
    invokeMock.mockResolvedValueOnce(99); // ai_stream_complete
    invokeMock.mockResolvedValue(undefined); // subsequent ai_cancel calls
    const { result } = renderHook(() => useAI());
    let handle!: { taskId: number; cancel: () => Promise<void> };
    await act(async () => {
      handle = await result.current.complete({
        provider: "p",
        model: "m",
        messages: [],
      });
    });
    expect(handle.taskId).toBe(99);
    await act(async () => {
      await handle.cancel();
    });
    expect(invokeMock).toHaveBeenCalledWith("ai_cancel", { taskId: 99 });
    const callsAfterFirst = invokeMock.mock.calls.length;
    await act(async () => {
      await handle.cancel();
    });
    expect(invokeMock.mock.calls.length).toBe(callsAfterFirst + 1);
  });
});

describe("useAI - cancelAll()", () => {
  it("cancels all active tasks and swallows errors per id", async () => {
    invokeMock.mockResolvedValueOnce(1);
    invokeMock.mockResolvedValueOnce(2);
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.complete({ provider: "p", model: "m", messages: [] });
    });
    await act(async () => {
      await result.current.complete({ provider: "p", model: "m", messages: [] });
    });

    invokeMock.mockReset();
    invokeMock.mockImplementationOnce(() => Promise.reject(new Error("nope")));
    invokeMock.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.cancelAll();
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
    const cancelTaskIds = invokeMock.mock.calls.map((c) => (c[1] as { taskId: number }).taskId).sort();
    expect(cancelTaskIds).toEqual([1, 2]);
    expect(invokeMock.mock.calls.every((c) => c[0] === "ai_cancel")).toBe(true);
  });

  it("cancelAll is a no-op when no active tasks", async () => {
    const { result } = renderHook(() => useAI());
    await act(async () => {
      await result.current.cancelAll();
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("cancelAll calls unsubscribe on each channel", async () => {
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    invokeMock.mockResolvedValueOnce(10);
    invokeMock.mockResolvedValueOnce(20);
    const { result } = renderHook(() => useAI());

    await act(async () => {
      await result.current.complete({ provider: "p", model: "m", messages: [] });
    });
    const ch1: MockChannel<AiEvent> = invokeMock.mock.calls[0][1].events;
    ch1.unsubscribe = unsub1;

    await act(async () => {
      await result.current.complete({ provider: "p", model: "m", messages: [] });
    });
    const ch2: MockChannel<AiEvent> = invokeMock.mock.calls[1][1].events;
    ch2.unsubscribe = unsub2;

    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.cancelAll();
    });
    expect(unsub1).toHaveBeenCalledTimes(1);
    expect(unsub2).toHaveBeenCalledTimes(1);
  });

  it("unmount triggers cancelAll for active tasks", async () => {
    invokeMock.mockResolvedValueOnce(77);
    invokeMock.mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useAI());
    await act(async () => {
      await result.current.complete({ provider: "p", model: "m", messages: [] });
    });
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    const cancelCall = invokeMock.mock.calls.find((c) => c[0] === "ai_cancel");
    expect(cancelCall).toBeTruthy();
    expect((cancelCall![1] as { taskId: number }).taskId).toBe(77);
  });
});

describe("listModels()", () => {
  it("calls invoke('ai_list_models', {provider, baseUrl: null}) when baseUrl omitted", async () => {
    invokeMock.mockResolvedValueOnce([{ id: "m1", name: "Model 1" }]);
    const result = await listModels("anthropic");
    expect(invokeMock).toHaveBeenCalledWith("ai_list_models", {
      provider: "anthropic",
      baseUrl: null,
    });
    expect(result).toEqual([{ id: "m1", name: "Model 1" }]);
  });

  it("forwards baseUrl when provided", async () => {
    invokeMock.mockResolvedValueOnce([]);
    await listModels("openai", "http://localhost:11434/v1");
    expect(invokeMock).toHaveBeenCalledWith("ai_list_models", {
      provider: "openai",
      baseUrl: "http://localhost:11434/v1",
    });
  });
});
