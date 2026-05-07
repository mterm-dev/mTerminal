import { useRef, type PointerEvent as RPointerEvent } from "react";

interface Props {
  cols: number;
  rows: number;
  colSizes: number[];
  rowSizes: number[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onColSizes: (sizes: number[]) => void;
  onRowSizes: (sizes: number[]) => void;
  occupancy?: number[][];
  gapPx?: number;
  paddingPx?: number;
  minFr?: number;
}

export function GridResizers({
  cols,
  rows,
  colSizes,
  rowSizes,
  containerRef,
  onColSizes,
  onRowSizes,
  occupancy,
  gapPx = 4,
  paddingPx = 4,
  minFr = 0.1,
}: Props) {
  const draggingRef = useRef(false);

  if (cols < 2 && rows < 2) return null;

  const colTotal = sumOf(colSizes);
  const rowTotal = sumOf(rowSizes);

  const startColDrag = (
    e: RPointerEvent<HTMLDivElement>,
    boundary: number,
  ) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const innerWidth = container.clientWidth - paddingPx * 2 - gapPx * (cols - 1);
    if (innerWidth <= 0) return;
    const startSizes = colSizes.slice();
    const startX = e.clientX;
    const total = sumOf(startSizes);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    target.classList.add("dragging");
    document.body.classList.add("resizing-grid", "resizing-grid-col");
    draggingRef.current = true;
    const move = (ev: PointerEvent) => {
      const deltaPx = ev.clientX - startX;
      const deltaFr = (deltaPx / innerWidth) * total;
      const a = startSizes[boundary];
      const b = startSizes[boundary + 1];
      const sum = a + b;
      let nextA = a + deltaFr;
      let nextB = b - deltaFr;
      if (nextA < minFr) {
        nextA = minFr;
        nextB = sum - minFr;
      } else if (nextB < minFr) {
        nextB = minFr;
        nextA = sum - minFr;
      }
      const next = startSizes.slice();
      next[boundary] = nextA;
      next[boundary + 1] = nextB;
      onColSizes(next);
    };
    const up = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {}
      target.classList.remove("dragging");
      document.body.classList.remove("resizing-grid", "resizing-grid-col");
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const startRowDrag = (
    e: RPointerEvent<HTMLDivElement>,
    boundary: number,
  ) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const innerHeight = container.clientHeight - paddingPx * 2 - gapPx * (rows - 1);
    if (innerHeight <= 0) return;
    const startSizes = rowSizes.slice();
    const startY = e.clientY;
    const total = sumOf(startSizes);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    target.classList.add("dragging");
    document.body.classList.add("resizing-grid", "resizing-grid-row");
    draggingRef.current = true;
    const move = (ev: PointerEvent) => {
      const deltaPx = ev.clientY - startY;
      const deltaFr = (deltaPx / innerHeight) * total;
      const a = startSizes[boundary];
      const b = startSizes[boundary + 1];
      const sum = a + b;
      let nextA = a + deltaFr;
      let nextB = b - deltaFr;
      if (nextA < minFr) {
        nextA = minFr;
        nextB = sum - minFr;
      } else if (nextB < minFr) {
        nextB = minFr;
        nextA = sum - minFr;
      }
      const next = startSizes.slice();
      next[boundary] = nextA;
      next[boundary + 1] = nextB;
      onRowSizes(next);
    };
    const up = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {}
      target.classList.remove("dragging");
      document.body.classList.remove("resizing-grid", "resizing-grid-row");
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const colBoundaries = computeBoundaries(colSizes, colTotal);
  const rowBoundaries = computeBoundaries(rowSizes, rowTotal);

  const colCumFractions = cumFractions(colSizes, colTotal);
  const rowCumFractions = cumFractions(rowSizes, rowTotal);

  const colSegments = (boundary: number): Array<[number, number]> => {
    const ranges: Array<[number, number]> = [];
    let start = -1;
    for (let c = 0; c < cols; c++) {
      let active = true;
      if (occupancy) {
        const above = occupancy[boundary]?.[c];
        const below = occupancy[boundary + 1]?.[c];
        if (above !== undefined && below !== undefined && above === below && above !== -1) {
          active = false;
        }
      }
      if (active) {
        if (start < 0) start = c;
      } else {
        if (start >= 0) ranges.push([start, c - 1]);
        start = -1;
      }
    }
    if (start >= 0) ranges.push([start, cols - 1]);
    return ranges;
  };

  const rowSegments = (boundary: number): Array<[number, number]> => {
    const ranges: Array<[number, number]> = [];
    let start = -1;
    for (let r = 0; r < rows; r++) {
      let active = true;
      if (occupancy) {
        const left = occupancy[r]?.[boundary];
        const right = occupancy[r]?.[boundary + 1];
        if (left !== undefined && right !== undefined && left === right && left !== -1) {
          active = false;
        }
      }
      if (active) {
        if (start < 0) start = r;
      } else {
        if (start >= 0) ranges.push([start, r - 1]);
        start = -1;
      }
    }
    if (start >= 0) ranges.push([start, rows - 1]);
    return ranges;
  };

  const colInner = `(100% - ${paddingPx * 2}px - ${gapPx * (cols - 1)}px)`;
  const rowInner = `(100% - ${paddingPx * 2}px - ${gapPx * (rows - 1)}px)`;

  return (
    <>
      {cols >= 2 &&
        colTotal > 0 &&
        colBoundaries.map((fraction, i) => {
          const segs = rowSegments(i);
          if (segs.length === 0) return null;
          return segs.map(([rStart, rEnd]) => {
            const topFrac = rowCumFractions[rStart];
            const bottomFrac = rowCumFractions[rEnd + 1];
            return (
              <div
                key={`c${i}-${rStart}-${rEnd}`}
                className="grid-resizer col"
                style={{
                  left: `calc(${paddingPx}px + ${colInner} * ${fraction} + ${gapPx * i}px + ${gapPx / 2}px)`,
                  top: `calc(${paddingPx}px + ${rowInner} * ${topFrac} + ${gapPx * rStart}px)`,
                  height: `calc(${rowInner} * ${bottomFrac - topFrac} + ${gapPx * (rEnd - rStart)}px)`,
                }}
                onPointerDown={(e) => startColDrag(e, i)}
                aria-hidden="true"
              />
            );
          });
        })}
      {rows >= 2 &&
        rowTotal > 0 &&
        rowBoundaries.map((fraction, i) => {
          const segs = colSegments(i);
          if (segs.length === 0) return null;
          return segs.map(([cStart, cEnd]) => {
            const leftFrac = colCumFractions[cStart];
            const rightFrac = colCumFractions[cEnd + 1];
            return (
              <div
                key={`r${i}-${cStart}-${cEnd}`}
                className="grid-resizer row"
                style={{
                  top: `calc(${paddingPx}px + ${rowInner} * ${fraction} + ${gapPx * i}px + ${gapPx / 2}px)`,
                  left: `calc(${paddingPx}px + ${colInner} * ${leftFrac} + ${gapPx * cStart}px)`,
                  width: `calc(${colInner} * ${rightFrac - leftFrac} + ${gapPx * (cEnd - cStart)}px)`,
                }}
                onPointerDown={(e) => startRowDrag(e, i)}
                aria-hidden="true"
              />
            );
          });
        })}
    </>
  );
}

function cumFractions(sizes: number[], total: number): number[] {
  if (total <= 0) return sizes.map(() => 0).concat(0);
  const out: number[] = [0];
  let acc = 0;
  for (const s of sizes) {
    acc += s;
    out.push(acc / total);
  }
  return out;
}

function computeBoundaries(sizes: number[], total: number): number[] {
  if (sizes.length < 2 || total <= 0) return [];
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < sizes.length - 1; i++) {
    acc += sizes[i];
    out.push(acc / total);
  }
  return out;
}

function sumOf(arr: number[]): number {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}
