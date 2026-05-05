// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";

const { completeMock, lastOpts, cancelMock } = vi.hoisted(() => {
  const lastOpts: { current: any } = { current: null };
  const cancelMock = vi.fn(async () => {});
  const completeMock = vi.fn(async (opts: any) => {
    lastOpts.current = opts;
    return { taskId: 1, cancel: cancelMock };
  });
  return { completeMock, lastOpts, cancelMock };
});

vi.mock("../../src/hooks/useAI", () => ({
  useAI: () => ({ complete: completeMock, cancelAll: vi.fn() }),
}));

const { diffMock, statusMock, stageMock, commitMock, gitApi } = vi.hoisted(
  () => {
    const diffMock = vi.fn();
    const statusMock = vi.fn();
    const stageMock = vi.fn();
    const commitMock = vi.fn();
    const gitApi = {
      status: statusMock,
      diff: diffMock,
      stage: stageMock,
      unstage: vi.fn(),
      commit: commitMock,
      push: vi.fn(),
      pull: vi.fn(),
      fetch: vi.fn(),
    };
    return { diffMock, statusMock, stageMock, commitMock, gitApi };
  },
);

vi.mock("../../src/hooks/useGitStatus", () => ({
  useGitStatus: (cwd: string | undefined, _enabled: boolean) => {
    const status = statusMock(cwd);
    return {
      status,
      loading: false,
      error: null,
      refresh: vi.fn(async () => {}),
      runMutation: async (fn: (api: any) => Promise<unknown>) => fn(gitApi),
      api: gitApi,
    };
  },
}));

beforeEach(() => {
  completeMock.mockClear();
  cancelMock.mockClear();
  lastOpts.current = null;
  diffMock.mockReset();
  statusMock.mockReset();
  stageMock.mockReset();
  commitMock.mockReset();

  completeMock.mockImplementation(async (opts: any) => {
    lastOpts.current = opts;
    return { taskId: 1, cancel: cancelMock };
  });

  statusMock.mockReturnValue({
    isRepo: true,
    branch: "main",
    upstream: null,
    ahead: 0,
    behind: 0,
    files: [
      {
        path: "src/a.ts",
        indexStatus: "M",
        worktreeStatus: ".",
        staged: true,
        unstaged: false,
        untracked: false,
      },
      {
        path: "src/b.ts",
        indexStatus: "M",
        worktreeStatus: ".",
        staged: true,
        unstaged: false,
        untracked: false,
      },
    ],
  });

  diffMock.mockImplementation(async (_cwd: string, p: string) => ({
    text: `diff --git a/${p} b/${p}\n@@ -1 +1 @@\n-old\n+new\n`,
    truncated: false,
  }));
});

afterEach(() => {
  cleanup();
});

import { GitPanel } from "../../src/components/GitPanel";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/useSettings";

function baseProps(
  overrides: Partial<React.ComponentProps<typeof GitPanel>> = {},
) {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    gitPanelEnabled: true,
    gitPanelCollapsed: false,
    gitPanelTreeView: false,
    gitCommitProvider: "anthropic",
    gitCommitAnthropicModel: "claude-opus-4-7",
    gitCommitSystemPrompt: "SYSTEM",
  };
  return {
    cwd: "/repo",
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    treeView: false,
    onToggleTreeView: vi.fn(),
    settings,
    ...overrides,
  };
}

describe("GitPanel — AI generate commit message", () => {
  it("clicking ✨ fetches staged diff for each checked file and calls useAI.complete with system prompt", async () => {
    render(<GitPanel {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("src/a.ts")).toBeTruthy());

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /generate commit message with ai/i,
        }),
      );
    });

    await waitFor(() => expect(diffMock).toHaveBeenCalledTimes(2));
    expect(diffMock).toHaveBeenCalledWith("/repo", "src/a.ts", true);
    expect(diffMock).toHaveBeenCalledWith("/repo", "src/b.ts", true);

    await waitFor(() => expect(completeMock).toHaveBeenCalled());
    const opts = completeMock.mock.calls[0][0];
    expect(opts.provider).toBe("anthropic");
    expect(opts.model).toBe("claude-opus-4-7");
    expect(opts.system).toBe("SYSTEM");
    expect(opts.messages[0].role).toBe("user");
    expect(opts.messages[0].content).toContain("--- src/a.ts ---");
    expect(opts.messages[0].content).toContain("--- src/b.ts ---");
  });

  it("delta callbacks accumulate into the commit message textarea", async () => {
    render(<GitPanel {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("src/a.ts")).toBeTruthy());

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /generate commit message with ai/i,
        }),
      );
    });
    await waitFor(() => expect(lastOpts.current).not.toBeNull());

    await act(async () => {
      lastOpts.current.onDelta("feat: add ");
      lastOpts.current.onDelta("foo");
      lastOpts.current.onDone({ inTokens: 1, outTokens: 1, costUsd: 0 });
    });

    const ta = document.querySelector(
      ".term-side-git-msg textarea",
    ) as HTMLTextAreaElement;
    expect(ta.value).toBe("feat: add foo");
  });

  it("shows error when no model is configured and does not call useAI.complete", async () => {
    const props = baseProps({
      settings: {
        ...DEFAULT_SETTINGS,
        gitPanelEnabled: true,
        gitCommitProvider: "anthropic",
        gitCommitAnthropicModel: "",
      } as Settings,
    });
    render(<GitPanel {...props} />);
    await waitFor(() => expect(screen.getByText("src/a.ts")).toBeTruthy());

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /generate commit message with ai/i,
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(/pick a model in settings → git panel/i),
      ).toBeTruthy();
    });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("clicking ✨ during stream cancels the active task instead of starting a new one", async () => {
    render(<GitPanel {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("src/a.ts")).toBeTruthy());

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /generate commit message with ai/i,
        }),
      );
    });
    await waitFor(() => expect(completeMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /cancel ai generation/i }),
      );
    });

    expect(cancelMock).toHaveBeenCalled();
    expect(completeMock).toHaveBeenCalledTimes(1);
  });
});
