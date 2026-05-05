// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";

const SIDE_DIFF = [
  "diff --git a/x b/x",
  "--- a/x",
  "+++ b/x",
  "@@ -1,3 +1,3 @@",
  " keep1",
  "-old line",
  "+new line",
  " keep2",
  "",
].join("\n");

const UNIFIED_DIFF = [
  "diff --git a/x b/x",
  "@@ -1,1 +1,1 @@",
  "-old",
  "+new",
  "",
].join("\n");

const diffMock = vi.fn();

beforeEach(() => {
  diffMock.mockReset();
  diffMock.mockImplementation(
    async (_cwd: string, _path: string, _staged: boolean, context?: number) => ({
      text: context && context > 100 ? SIDE_DIFF : UNIFIED_DIFF,
      truncated: false,
    }),
  );
  (window as unknown as { mt: unknown }).mt = { git: { diff: diffMock } };
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { mt?: unknown }).mt;
});

import { GitDiffModal } from "../../src/components/GitDiffModal";

function baseProps(
  overrides: Partial<React.ComponentProps<typeof GitDiffModal>> = {},
) {
  return {
    cwd: "/repo",
    path: "x",
    staged: false,
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("GitDiffModal", () => {
  it("fetches with full context in side-by-side mode and renders rows", async () => {
    render(<GitDiffModal {...baseProps()} />);
    await waitFor(() => expect(diffMock).toHaveBeenCalled());
    const lastCall = diffMock.mock.calls[diffMock.mock.calls.length - 1];
    expect(lastCall[3]).toBeGreaterThan(1000);
    await waitFor(() => {
      expect(document.querySelector(".git-diff-cell.change.left")).toBeTruthy();
      expect(document.querySelector(".git-diff-cell.change.right")).toBeTruthy();
    });
  });

  it("Escape triggers onClose", async () => {
    const onClose = vi.fn();
    render(<GitDiffModal {...baseProps({ onClose })} />);
    await waitFor(() => expect(diffMock).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop triggers onClose, clicking the dialog does not", async () => {
    const onClose = vi.fn();
    render(<GitDiffModal {...baseProps({ onClose })} />);
    await waitFor(() => expect(diffMock).toHaveBeenCalled());
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    const backdrop = document.querySelector(".git-diff-modal-backdrop")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("toggling view refetches without context (unified mode)", async () => {
    render(<GitDiffModal {...baseProps()} />);
    await waitFor(() => expect(diffMock).toHaveBeenCalledTimes(1));
    const toggle = screen.getByRole("button", { name: /unified/i });
    fireEvent.click(toggle);
    await waitFor(() => expect(diffMock).toHaveBeenCalledTimes(2));
    const secondCall = diffMock.mock.calls[1];
    expect(secondCall[3]).toBeUndefined();
    await waitFor(() => {
      expect(document.querySelector(".git-diff-modal-pre")).toBeTruthy();
    });
  });

  it("renders status badge for staged file", async () => {
    render(
      <GitDiffModal
        {...baseProps({
          staged: true,
          status: { indexStatus: "M", worktreeStatus: ".", untracked: false },
        })}
      />,
    );
    await waitFor(() => expect(diffMock).toHaveBeenCalled());
    const badge = document.querySelector(".git-diff-modal-badge.staged");
    expect(badge?.textContent).toBe("staged");
  });
});
