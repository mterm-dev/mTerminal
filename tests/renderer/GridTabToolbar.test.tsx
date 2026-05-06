// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GridTabToolbar } from "../../src/components/GridTabToolbar";

afterEach(() => {
  cleanup();
});

function renderToolbar(overrides: Partial<Parameters<typeof GridTabToolbar>[0]> = {}) {
  const props = {
    label: "shell",
    isSolo: false,
    onSolo: vi.fn(),
    onRename: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const utils = render(<GridTabToolbar {...props} />);
  return { ...utils, props };
}

describe("GridTabToolbar", () => {
  it("invokes the rename, solo and close callbacks for the visible icons", () => {
    const { props } = renderToolbar();
    fireEvent.click(screen.getByLabelText("fullscreen"));
    fireEvent.click(screen.getByLabelText("rename"));
    fireEvent.click(screen.getByLabelText("close tab"));
    expect(props.onSolo).toHaveBeenCalledTimes(1);
    expect(props.onRename).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows 'exit fullscreen' label when isSolo is true", () => {
    renderToolbar({ isSolo: true });
    expect(screen.getByLabelText("exit fullscreen")).not.toBeNull();
  });

  it("renders exactly three buttons", () => {
    const { container } = renderToolbar();
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(3);
  });

  it("displays the tab label and optional sub", () => {
    renderToolbar({ label: "my-tab", sub: "/home/work" });
    expect(screen.getByText("my-tab")).not.toBeNull();
    expect(screen.getByText("/home/work")).not.toBeNull();
  });

  it("invokes onDragStart when pointerdown lands on the drag handle", () => {
    const onDragStart = vi.fn();
    renderToolbar({ onDragStart });
    const handle = screen.getByLabelText("drag handle");
    fireEvent.pointerDown(handle);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it("does not start a drag when pointerdown lands on a button", () => {
    const onDragStart = vi.fn();
    renderToolbar({ onDragStart });
    fireEvent.pointerDown(screen.getByLabelText("close tab"));
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("applies the dragging class when prop is set", () => {
    const { container } = renderToolbar({ dragging: true });
    const root = container.querySelector(".grid-toolbar");
    expect(root?.classList.contains("dragging")).toBe(true);
  });

  it("renders an inline edit input when editing is true and commits the new name", () => {
    const setEditing = vi.fn();
    const onCommitRename = vi.fn();
    const { container } = renderToolbar({
      editing: true,
      setEditing,
      onCommitRename,
    });
    const input = container.querySelector("input.inline-edit") as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommitRename).toHaveBeenCalledWith("renamed");
    expect(setEditing).toHaveBeenCalledWith(false);
  });

  it("does not render an inline edit input when editing is false", () => {
    const { container } = renderToolbar({
      editing: false,
      setEditing: vi.fn(),
      onCommitRename: vi.fn(),
    });
    expect(container.querySelector("input.inline-edit")).toBeNull();
  });

  it("does not start a drag when pointerdown lands on the handle while editing", () => {
    const onDragStart = vi.fn();
    renderToolbar({
      onDragStart,
      editing: true,
      setEditing: vi.fn(),
      onCommitRename: vi.fn(),
    });
    fireEvent.pointerDown(screen.getByLabelText("drag handle"));
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("clicking the rename button reveals the inline edit input (parent-controlled)", () => {
    function Harness() {
      const [editing, setEditing] = (require("react") as typeof import("react")).useState(false);
      return (
        <GridTabToolbar
          label="shell"
          isSolo={false}
          onSolo={vi.fn()}
          onRename={() => setEditing(true)}
          onClose={vi.fn()}
          editing={editing}
          setEditing={setEditing}
          onCommitRename={vi.fn()}
        />
      );
    }
    const { container } = render(<Harness />);
    expect(container.querySelector("input.inline-edit")).toBeNull();
    fireEvent.click(screen.getByLabelText("rename"));
    expect(container.querySelector("input.inline-edit")).not.toBeNull();
  });

  it("enters edit mode on double-click on the drag handle", () => {
    const setEditing = vi.fn();
    renderToolbar({
      setEditing,
      onCommitRename: vi.fn(),
    });
    fireEvent.doubleClick(screen.getByLabelText("drag handle"));
    expect(setEditing).toHaveBeenCalledWith(true);
  });
});
