// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";


const { completeMock, lastOpts } = vi.hoisted(() => {
  const lastOpts: { current: any } = { current: null };
  const completeMock = vi.fn(async (opts: any) => {
    lastOpts.current = opts;
    return {
      taskId: 1,
      cancel: vi.fn(async () => {}),
    };
  });
  return { completeMock, lastOpts };
});

vi.mock("../../src/hooks/useAI", () => ({
  useAI: () => ({ complete: completeMock, cancelAll: vi.fn() }),
}));

import { AICommandPalette } from "../../src/components/AICommandPalette";

beforeEach(() => {
  completeMock.mockClear();
  lastOpts.current = null;
  
  completeMock.mockImplementation(async (opts: any) => {
    lastOpts.current = opts;
    return { taskId: 1, cancel: vi.fn(async () => {}) };
  });
});

afterEach(() => {
  cleanup();
});

function baseProps(overrides: Partial<React.ComponentProps<typeof AICommandPalette>> = {}) {
  return {
    defaultProvider: "anthropic",
    defaultModel: "claude-opus-4-7",
    onClose: vi.fn(),
    onPaste: vi.fn(),
    ...overrides,
  };
}

describe("AICommandPalette", () => {
  it("renders dialog with provider/model meta and empty input", () => {
    render(<AICommandPalette {...baseProps()} />);
    expect(screen.getByRole("dialog", { name: /ai command palette/i })).toBeTruthy();
    expect(screen.getByText(/anthropic · claude-opus-4-7/)).toBeTruthy();
    const input = screen.getByPlaceholderText(/describe what you want/i) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("typing into input does not trigger network call", () => {
    render(<AICommandPalette {...baseProps()} />);
    const input = screen.getByPlaceholderText(/describe what you want/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "find big files" } });
    expect(input.value).toBe("find big files");
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("Enter submits and calls useAI.complete with the configured provider/model and CMD/EXPLAIN system prompt", async () => {
    const onPaste = vi.fn();
    render(<AICommandPalette {...baseProps({ onPaste, cwd: "/tmp/xyz", recentOutput: "tail-output-data" })} />);
    const input = screen.getByPlaceholderText(/describe what you want/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "find big files" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(completeMock).toHaveBeenCalledTimes(1);
    const opts = completeMock.mock.calls[0][0];
    expect(opts.provider).toBe("anthropic");
    expect(opts.model).toBe("claude-opus-4-7");
    expect(opts.maxTokens).toBe(256);
    expect(opts.messages).toEqual([{ role: "user", content: "find big files" }]);
    expect(opts.system).toContain("CMD: <single-line shell command>");
    expect(opts.system).toContain("EXPLAIN: <one short sentence>");
    expect(opts.system).toContain("/tmp/xyz");
    expect(opts.system).toContain("tail-output-data");
  });

  it("streams deltas, parses CMD: and EXPLAIN: after done, surfaces both", async () => {
    render(<AICommandPalette {...baseProps()} />);
    const input = screen.getByPlaceholderText(/describe what you want/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "list files" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    const opts = lastOpts.current;
    
    await act(async () => {
      opts.onDelta("CMD: ls -la\n");
    });
    expect(screen.getByText("ls -la")).toBeTruthy();
    await act(async () => {
      opts.onDelta("EXPLAIN: lists all files including hidden\n");
    });
    expect(screen.getByText("ls -la")).toBeTruthy();
    expect(screen.getByText(/lists all files including hidden/)).toBeTruthy();

    await act(async () => {
      opts.onDone({ inTokens: 5, outTokens: 10, costUsd: 0.0001 });
    });
    
    const pasteBtn = screen.getByRole("button", { name: /paste/i }) as HTMLButtonElement;
    expect(pasteBtn.disabled).toBe(false);
  });

  it("clicking paste calls onPaste(cmd, run=false) and closes", async () => {
    const onPaste = vi.fn();
    const onClose = vi.fn();
    render(<AICommandPalette {...baseProps({ onPaste, onClose })} />);
    const input = screen.getByPlaceholderText(/describe what you want/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "list" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await act(async () => {
      lastOpts.current.onDelta("CMD: ls\nEXPLAIN: list files\n");
      lastOpts.current.onDone({ inTokens: 1, outTokens: 1, costUsd: 0 });
    });
    const pasteBtn = screen.getByRole("button", { name: /paste/i });
    fireEvent.click(pasteBtn);
    expect(onPaste).toHaveBeenCalledWith("ls", false);
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter on resulting output pastes (run=false)", async () => {
    const onPaste = vi.fn();
    const onClose = vi.fn();
    render(<AICommandPalette {...baseProps({ onPaste, onClose })} />);
    const input = screen.getByPlaceholderText(/describe what you want/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "list" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await act(async () => {
      lastOpts.current.onDelta("CMD: ls\nEXPLAIN: list\n");
      lastOpts.current.onDone({ inTokens: 1, outTokens: 1, costUsd: 0 });
    });
    
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPaste).toHaveBeenCalledWith("ls", false);
    expect(onClose).toHaveBeenCalled();
  });

  it("Ctrl+Enter calls onPaste with run=true", async () => {
    const onPaste = vi.fn();
    const onClose = vi.fn();
    render(<AICommandPalette {...baseProps({ onPaste, onClose })} />);
    const input = screen.getByPlaceholderText(/describe what you want/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "list" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await act(async () => {
      lastOpts.current.onDelta("CMD: ls\nEXPLAIN: list\n");
      lastOpts.current.onDone({ inTokens: 1, outTokens: 1, costUsd: 0 });
    });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onPaste).toHaveBeenCalledWith("ls", true);
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<AICommandPalette {...baseProps({ onClose })} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("error event surfaces in UI", async () => {
    render(<AICommandPalette {...baseProps()} />);
    const input = screen.getByPlaceholderText(/describe what you want/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "x" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await act(async () => {
      lastOpts.current.onError("api blew up");
    });
    expect(screen.getByText(/api blew up/)).toBeTruthy();
  });

  it("unmount cancels in-flight request", async () => {
    const cancel = vi.fn(async () => {});
    completeMock.mockImplementationOnce(async (opts: any) => {
      lastOpts.current = opts;
      return { taskId: 7, cancel };
    });
    const { unmount } = render(<AICommandPalette {...baseProps()} />);
    const input = screen.getByPlaceholderText(/describe what you want/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "x" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
