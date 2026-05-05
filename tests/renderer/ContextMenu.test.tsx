// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ContextMenu, type MenuItem } from "../../src/components/ContextMenu";

afterEach(() => {
  cleanup();
});

describe("ContextMenu - rendering", () => {
  it("renders all non-separator items as menu buttons", () => {
    const items: MenuItem[] = [
      { label: "rename", onSelect: vi.fn() },
      { label: "duplicate", onSelect: vi.fn() },
      { label: "close", onSelect: vi.fn(), danger: true },
    ];
    render(<ContextMenu x={10} y={20} items={items} onClose={vi.fn()} />);
    expect(screen.getByRole("menuitem", { name: "rename" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "duplicate" })).toBeTruthy();
    const closeBtn = screen.getByRole("menuitem", { name: "close" });
    expect(closeBtn.className).toContain("danger");
  });

  it("renders separators with role=separator", () => {
    const items: MenuItem[] = [
      { label: "a", onSelect: vi.fn() },
      { label: "", onSelect: vi.fn(), separator: true },
      { label: "b", onSelect: vi.fn() },
    ];
    const { container } = render(
      <ContextMenu x={0} y={0} items={items} onClose={vi.fn()} />,
    );
    const seps = container.querySelectorAll('[role="separator"]');
    expect(seps.length).toBe(1);
  });

  it("applies x/y as left/top in the inline style (when fits viewport)", () => {
    
    const items: MenuItem[] = [{ label: "a", onSelect: vi.fn() }];
    const { container } = render(
      <ContextMenu x={10} y={20} items={items} onClose={vi.fn()} />,
    );
    const menu = container.querySelector(".ctx-menu") as HTMLElement;
    expect(menu).not.toBeNull();
    
    expect(menu.style.left).toBe("10px");
    expect(menu.style.top).toBe("20px");
  });
});

describe("ContextMenu - interaction", () => {
  it("invokes item.onSelect and onClose on click", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const items: MenuItem[] = [{ label: "go", onSelect }];
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "go" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on outside mousedown", () => {
    const onClose = vi.fn();
    const items: MenuItem[] = [{ label: "a", onSelect: vi.fn() }];
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT call onClose when mousedown is inside the menu", () => {
    const onClose = vi.fn();
    const items: MenuItem[] = [{ label: "a", onSelect: vi.fn() }];
    const { container } = render(
      <ContextMenu x={0} y={0} items={items} onClose={onClose} />,
    );
    const menu = container.querySelector(".ctx-menu") as HTMLElement;
    fireEvent.mouseDown(menu);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    const items: MenuItem[] = [{ label: "a", onSelect: vi.fn() }];
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    const items: MenuItem[] = [{ label: "a", onSelect: vi.fn() }];
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes document listeners on unmount", () => {
    const onClose = vi.fn();
    const items: MenuItem[] = [{ label: "a", onSelect: vi.fn() }];
    const { unmount } = render(
      <ContextMenu x={0} y={0} items={items} onClose={onClose} />,
    );
    unmount();
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
