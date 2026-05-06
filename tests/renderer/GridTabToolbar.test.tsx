// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GridTabToolbar } from "../../src/components/GridTabToolbar";

afterEach(() => {
  cleanup();
});

function renderToolbar(overrides: Partial<Parameters<typeof GridTabToolbar>[0]> = {}) {
  const props = {
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
});
