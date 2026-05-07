// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const { winMock, maximizedRef } = vi.hoisted(() => {
  const winMock = {
    minimize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async (_cb: () => void) => () => {}),
    onCloseRequested: vi.fn(async () => () => {}),
  };
  return { winMock, maximizedRef: { current: false } };
});

vi.mock("../../src/lib/ipc", () => ({
  getCurrentWindow: () => winMock,
}));

vi.mock("../../src/hooks/useMaximized", () => ({
  useMaximized: () => maximizedRef.current,
}));

import { Titlebar } from "../../src/components/Titlebar";

beforeEach(() => {
  winMock.minimize.mockClear();
  winMock.toggleMaximize.mockClear();
  winMock.close.mockClear();
  maximizedRef.current = false;
});

afterEach(() => {
  cleanup();
});

describe("Titlebar", () => {
  it("renders title and a drag region", () => {
    const { container } = render(
      <Titlebar title="user@host" sidebarCollapsed={false} onToggleSidebar={() => {}} />,
    );
    expect(screen.getByText("user@host")).toBeTruthy();
    
    const drag = container.querySelector("[data-app-drag]");
    expect(drag).not.toBeNull();
  });

  it("minimize button calls win.minimize()", () => {
    render(<Titlebar title="t" sidebarCollapsed={false} onToggleSidebar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    expect(winMock.minimize).toHaveBeenCalledTimes(1);
  });

  it("maximize button calls win.toggleMaximize()", () => {
    render(<Titlebar title="t" sidebarCollapsed={false} onToggleSidebar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /maximize/i }));
    expect(winMock.toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("close button calls win.close()", () => {
    render(<Titlebar title="t" sidebarCollapsed={false} onToggleSidebar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(winMock.close).toHaveBeenCalledTimes(1);
  });

  it("toggles maximize button label between maximize/restore based on useMaximized", () => {
    maximizedRef.current = false;
    const { unmount } = render(
      <Titlebar title="t" sidebarCollapsed={false} onToggleSidebar={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /maximize/i })).toBeTruthy();
    unmount();

    maximizedRef.current = true;
    render(<Titlebar title="t" sidebarCollapsed={false} onToggleSidebar={() => {}} />);
    expect(screen.getByRole("button", { name: /restore/i })).toBeTruthy();
  });

  it("hides custom window controls on macOS (uses native traffic lights)", () => {
    (window as { mt: { platform: string } }).mt = { platform: "darwin" };
    try {
      const { container } = render(
        <Titlebar title="t" sidebarCollapsed={false} onToggleSidebar={() => {}} />,
      );
      expect(container.querySelector(".term-winctl")).toBeNull();
      expect(container.querySelector(".mac-traffic-spacer")).not.toBeNull();
      expect(
        container.querySelector('[data-platform="mac"]'),
      ).not.toBeNull();
    } finally {
      delete (window as { mt?: unknown }).mt;
    }
  });

  it("shows custom window controls on non-mac platforms", () => {
    (window as { mt: { platform: string } }).mt = { platform: "linux" };
    try {
      const { container } = render(
        <Titlebar title="t" sidebarCollapsed={false} onToggleSidebar={() => {}} />,
      );
      expect(container.querySelector(".term-winctl")).not.toBeNull();
      expect(container.querySelector(".mac-traffic-spacer")).toBeNull();
    } finally {
      delete (window as { mt?: unknown }).mt;
    }
  });

  it("sidebar toggle button calls onToggleSidebar and reflects collapsed state", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <Titlebar title="t" sidebarCollapsed={false} onToggleSidebar={onToggle} />,
    );
    let btn = screen.getByRole("button", { name: /hide sidebar/i });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<Titlebar title="t" sidebarCollapsed onToggleSidebar={onToggle} />);
    btn = screen.getByRole("button", { name: /show sidebar/i });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });
});
