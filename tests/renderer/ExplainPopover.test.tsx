// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";

const { completeMock, lastOpts, lastCancel } = vi.hoisted(() => {
  const lastOpts: { current: any } = { current: null };
  const lastCancel = { current: vi.fn(async () => {}) };
  const completeMock = vi.fn(async (opts: any) => {
    lastOpts.current = opts;
    lastCancel.current = vi.fn(async () => {});
    return { taskId: 1, cancel: lastCancel.current };
  });
  return { completeMock, lastOpts, lastCancel };
});

vi.mock("../../src/hooks/useAI", () => ({
  useAI: () => ({ complete: completeMock, cancelAll: vi.fn() }),
}));

import { ExplainPopover } from "../../src/components/ExplainPopover";

beforeEach(() => {
  completeMock.mockClear();
  lastOpts.current = null;
  completeMock.mockImplementation(async (opts: any) => {
    lastOpts.current = opts;
    lastCancel.current = vi.fn(async () => {});
    return { taskId: 1, cancel: lastCancel.current };
  });
});

afterEach(() => {
  cleanup();
});

function baseProps(overrides: Partial<React.ComponentProps<typeof ExplainPopover>> = {}) {
  return {
    selection: "permission denied: /etc/shadow",
    defaultProvider: "anthropic",
    defaultModel: "claude-opus-4-7",
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("ExplainPopover", () => {
  it("renders dialog with the selected snippet", () => {
    render(<ExplainPopover {...baseProps()} />);
    expect(screen.getByRole("dialog", { name: /ai explain/i })).toBeTruthy();
    expect(screen.getByText(/permission denied: \/etc\/shadow/)).toBeTruthy();
  });

  it("triggers useAI.complete with selection (and context) on mount", async () => {
    render(
      <ExplainPopover
        {...baseProps({
          selection: "ENOENT: no such file",
          context: "$ cat foo.txt",
          cwd: "/home/u",
        })}
      />,
    );
    await waitFor(() => expect(completeMock).toHaveBeenCalledTimes(1));
    const opts = completeMock.mock.calls[0][0];
    expect(opts.provider).toBe("anthropic");
    expect(opts.model).toBe("claude-opus-4-7");
    expect(opts.maxTokens).toBe(600);
    expect(opts.messages[0].content).toContain("ENOENT: no such file");
    expect(opts.messages[0].content).toContain("$ cat foo.txt");
    expect(opts.system).toContain("cwd: /home/u");
  });

  it("streamed deltas accumulate into popover body", async () => {
    render(<ExplainPopover {...baseProps()} />);
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    await act(async () => {
      lastOpts.current.onDelta("This means ");
    });
    await act(async () => {
      lastOpts.current.onDelta("the file requires root.");
    });
    expect(screen.getByText(/This means the file requires root\./)).toBeTruthy();
  });

  it("error event surfaces", async () => {
    render(<ExplainPopover {...baseProps()} />);
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    await act(async () => {
      lastOpts.current.onError("network down");
    });
    expect(screen.getByText(/network down/)).toBeTruthy();
  });

  it("Escape calls onClose", async () => {
    const onClose = vi.fn();
    render(<ExplainPopover {...baseProps({ onClose })} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking close button calls onClose", async () => {
    const onClose = vi.fn();
    render(<ExplainPopover {...baseProps({ onClose })} />);
    const btn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalled();
  });

  it("unmount cancels in-flight request", async () => {
    const { unmount } = render(<ExplainPopover {...baseProps()} />);
    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const cancelFn = lastCancel.current;
    unmount();
    expect(cancelFn).toHaveBeenCalled();
  });
});
