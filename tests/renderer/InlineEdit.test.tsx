// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { InlineEdit } from "../../src/components/InlineEdit";

afterEach(() => {
  cleanup();
});

describe("InlineEdit - non-editing mode", () => {
  it("renders a span with the value when editing=false", () => {
    const onCommit = vi.fn();
    const setEditing = vi.fn();
    const { container } = render(
      <InlineEdit
        value="hello"
        onCommit={onCommit}
        editing={false}
        setEditing={setEditing}
      />,
    );
    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe("hello");
    expect(container.querySelector("input")).toBeNull();
  });

  it("forwards className to the span", () => {
    const { container } = render(
      <InlineEdit
        value="x"
        onCommit={vi.fn()}
        editing={false}
        setEditing={vi.fn()}
        className="my-cls"
      />,
    );
    expect(container.querySelector("span")!.className).toBe("my-cls");
  });
});

describe("InlineEdit - editing mode", () => {
  it("renders an input with the value as its initial draft", () => {
    render(
      <InlineEdit
        value="initial"
        onCommit={vi.fn()}
        editing={true}
        setEditing={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("initial");
  });

  it("auto-focuses the input after requestAnimationFrame", async () => {
    render(
      <InlineEdit
        value="x"
        onCommit={vi.fn()}
        editing={true}
        setEditing={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it("forwards placeholder to the input", () => {
    render(
      <InlineEdit
        value=""
        onCommit={vi.fn()}
        editing={true}
        setEditing={vi.fn()}
        placeholder="type here"
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.placeholder).toBe("type here");
  });

  it("typing changes the draft", () => {
    render(
      <InlineEdit
        value="a"
        onCommit={vi.fn()}
        editing={true}
        setEditing={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input.value).toBe("abc");
  });

  it("Enter commits the draft and clears editing", () => {
    const onCommit = vi.fn();
    const setEditing = vi.fn();
    render(
      <InlineEdit
        value="a"
        onCommit={onCommit}
        editing={true}
        setEditing={setEditing}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("abc");
    expect(setEditing).toHaveBeenCalledWith(false);
  });

  it("Escape cancels without committing", () => {
    const onCommit = vi.fn();
    const setEditing = vi.fn();
    render(
      <InlineEdit
        value="a"
        onCommit={onCommit}
        editing={true}
        setEditing={setEditing}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "xyz" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(setEditing).toHaveBeenCalledWith(false);
  });

  it("blur commits the draft and clears editing", () => {
    const onCommit = vi.fn();
    const setEditing = vi.fn();
    render(
      <InlineEdit
        value="a"
        onCommit={onCommit}
        editing={true}
        setEditing={setEditing}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "blurred" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("blurred");
    expect(setEditing).toHaveBeenCalledWith(false);
  });

  it("guards against double-commit when Enter is followed by blur", () => {
    const onCommit = vi.fn();
    const setEditing = vi.fn();
    render(
      <InlineEdit
        value="a"
        onCommit={onCommit}
        editing={true}
        setEditing={setEditing}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "once" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("once");
  });

  it("stops click propagation so parent click handlers don't fire", () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <InlineEdit
          value="a"
          onCommit={vi.fn()}
          editing={true}
          setEditing={vi.fn()}
        />
      </div>,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.click(input);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("stops mousedown propagation", () => {
    const parentMouseDown = vi.fn();
    render(
      <div onMouseDown={parentMouseDown}>
        <InlineEdit
          value="a"
          onCommit={vi.fn()}
          editing={true}
          setEditing={vi.fn()}
        />
      </div>,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.mouseDown(input);
    expect(parentMouseDown).not.toHaveBeenCalled();
  });
});
