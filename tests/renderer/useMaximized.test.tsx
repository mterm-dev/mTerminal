// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

interface FakeWindow {
  isMaximized: ReturnType<typeof vi.fn>;
  onResized: ReturnType<typeof vi.fn>;
  _emitResize: () => void;
  _setMaximized: (b: boolean) => void;
}

let fakeWin: FakeWindow;
let unlistenMock: ReturnType<typeof vi.fn>;

function makeFakeWindow(): FakeWindow {
  let maximized = false;
  let resizeCb: (() => void) | null = null;
  return {
    isMaximized: vi.fn(async () => maximized),
    onResized: vi.fn(async (cb: () => void) => {
      resizeCb = cb;
      return unlistenMock;
    }),
    _emitResize: () => {
      resizeCb?.();
    },
    _setMaximized: (b: boolean) => {
      maximized = b;
    },
  };
}

vi.mock("../../src/lib/tauri-shim", () => ({
  getCurrentWindow: () => fakeWin,
}));

import { useMaximized } from "../../src/hooks/useMaximized";

beforeEach(() => {
  unlistenMock = vi.fn();
  fakeWin = makeFakeWindow();
});

describe("useMaximized", () => {
  it("initial state reflects isMaximized() result", async () => {
    fakeWin._setMaximized(true);
    const { result } = renderHook(() => useMaximized());
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(fakeWin.isMaximized).toHaveBeenCalled();
    expect(fakeWin.onResized).toHaveBeenCalled();
  });

  it("updates when onResized callback fires", async () => {
    fakeWin._setMaximized(false);
    const { result } = renderHook(() => useMaximized());
    await waitFor(() => expect(result.current).toBe(false));

    fakeWin._setMaximized(true);
    await act(async () => {
      fakeWin._emitResize();
    });
    await waitFor(() => expect(result.current).toBe(true));

    fakeWin._setMaximized(false);
    await act(async () => {
      fakeWin._emitResize();
    });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("calls unlisten on unmount", async () => {
    const { unmount } = renderHook(() => useMaximized());
    
    await waitFor(() => expect(fakeWin.onResized).toHaveBeenCalled());
    
    await Promise.resolve();
    await Promise.resolve();
    unmount();
    expect(unlistenMock).toHaveBeenCalled();
  });
});
