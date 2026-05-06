// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { GridResizers } from "../../src/components/GridResizers";

beforeAll(() => {
  if (!("setPointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: () => {},
    });
  }
  if (!("releasePointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: () => {},
    });
  }
});

afterEach(() => {
  cleanup();
  document.body.className = "";
});

function Harness({
  cols,
  rows,
  colSizes,
  rowSizes,
  onColSizes,
  onRowSizes,
  containerWidth = 1000,
  containerHeight = 500,
}: {
  cols: number;
  rows: number;
  colSizes: number[];
  rowSizes: number[];
  onColSizes: (sizes: number[]) => void;
  onRowSizes: (sizes: number[]) => void;
  containerWidth?: number;
  containerHeight?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el) {
          Object.defineProperty(el, "clientWidth", {
            configurable: true,
            value: containerWidth,
          });
          Object.defineProperty(el, "clientHeight", {
            configurable: true,
            value: containerHeight,
          });
        }
      }}
      style={{ position: "relative" }}
    >
      <GridResizers
        cols={cols}
        rows={rows}
        colSizes={colSizes}
        rowSizes={rowSizes}
        containerRef={ref}
        onColSizes={onColSizes}
        onRowSizes={onRowSizes}
      />
    </div>
  );
}

describe("GridResizers", () => {
  it("renders cols-1 column handles and rows-1 row handles", () => {
    const { container } = render(
      <Harness
        cols={3}
        rows={2}
        colSizes={[1, 1, 1]}
        rowSizes={[1, 1]}
        onColSizes={vi.fn()}
        onRowSizes={vi.fn()}
      />,
    );
    expect(container.querySelectorAll(".grid-resizer.col").length).toBe(2);
    expect(container.querySelectorAll(".grid-resizer.row").length).toBe(1);
  });

  it("renders nothing when both cols and rows are 1", () => {
    const { container } = render(
      <Harness
        cols={1}
        rows={1}
        colSizes={[1]}
        rowSizes={[1]}
        onColSizes={vi.fn()}
        onRowSizes={vi.fn()}
      />,
    );
    expect(container.querySelector(".grid-resizer")).toBeNull();
  });

  it("dragging a column handle reports new sizes preserving the pair sum", () => {
    const onColSizes = vi.fn();
    const { container } = render(
      <Harness
        cols={2}
        rows={1}
        colSizes={[1, 1]}
        rowSizes={[1]}
        onColSizes={onColSizes}
        onRowSizes={vi.fn()}
      />,
    );
    const handle = container.querySelector(".grid-resizer.col") as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 600 });
    expect(onColSizes).toHaveBeenCalled();
    const last = onColSizes.mock.calls[onColSizes.mock.calls.length - 1][0];
    expect(last).toHaveLength(2);
    expect(last[0] + last[1]).toBeCloseTo(2, 5);
    expect(last[0]).toBeGreaterThan(1);
    expect(last[1]).toBeLessThan(1);
    fireEvent.pointerUp(window, { clientX: 600 });
  });

  it("clamps to MIN_FR so neither side collapses to zero", () => {
    const onColSizes = vi.fn();
    const { container } = render(
      <Harness
        cols={2}
        rows={1}
        colSizes={[1, 1]}
        rowSizes={[1]}
        onColSizes={onColSizes}
        onRowSizes={vi.fn()}
      />,
    );
    const handle = container.querySelector(".grid-resizer.col") as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 5000 });
    const last = onColSizes.mock.calls[onColSizes.mock.calls.length - 1][0];
    expect(last[1]).toBeGreaterThan(0);
    expect(last[0] + last[1]).toBeCloseTo(2, 5);
    fireEvent.pointerUp(window, { clientX: 5000 });
  });

  it("dragging a row handle reports new row sizes", () => {
    const onRowSizes = vi.fn();
    const { container } = render(
      <Harness
        cols={1}
        rows={2}
        colSizes={[1]}
        rowSizes={[1, 1]}
        onColSizes={vi.fn()}
        onRowSizes={onRowSizes}
      />,
    );
    const handle = container.querySelector(".grid-resizer.row") as HTMLElement;
    fireEvent.pointerDown(handle, { clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 350 });
    expect(onRowSizes).toHaveBeenCalled();
    const last = onRowSizes.mock.calls[onRowSizes.mock.calls.length - 1][0];
    expect(last[0] + last[1]).toBeCloseTo(2, 5);
    expect(last[0]).toBeGreaterThan(1);
    fireEvent.pointerUp(window, { clientY: 350 });
  });

  it("removes resizing-grid body class on pointer up", () => {
    const { container } = render(
      <Harness
        cols={2}
        rows={1}
        colSizes={[1, 1]}
        rowSizes={[1]}
        onColSizes={vi.fn()}
        onRowSizes={vi.fn()}
      />,
    );
    const handle = container.querySelector(".grid-resizer.col") as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 });
    expect(document.body.classList.contains("resizing-grid")).toBe(true);
    fireEvent.pointerUp(window, { clientX: 500 });
    expect(document.body.classList.contains("resizing-grid")).toBe(false);
  });
});
