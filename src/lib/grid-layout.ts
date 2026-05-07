export interface GridLayout {
  cols: number;
  rows: number;
  spanRowsSlots: Set<number>;
}

export function computeGridLayout(n: number): GridLayout | null {
  if (n <= 0) return null;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const empty = rows * cols - n;
  const spanRowsSlots = new Set<number>();
  if (empty > 0 && rows >= 2) {
    const baseRow = rows - 2;
    for (let i = 0; i < empty; i++) {
      spanRowsSlots.add(baseRow * cols + (cols - empty + i));
    }
  }
  return { cols, rows, spanRowsSlots };
}

/**
 * Simulate CSS `grid-auto-flow: row` placement for `n` slots into a `cols x rows`
 * grid, with the slots in `spanRowsSlots` taking 2 rows. Returns a 2D occupancy
 * map `[row][col] = slotIndex` (or -1 for empty cells).
 */
export function computeOccupancy(
  n: number,
  cols: number,
  rows: number,
  spanRowsSlots: Set<number>,
): number[][] {
  const grid: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => -1),
  );
  let slot = 0;
  for (let r = 0; r < rows && slot < n; r++) {
    for (let c = 0; c < cols && slot < n; c++) {
      if (grid[r][c] !== -1) continue;
      const wantSpan = spanRowsSlots.has(slot) && r + 1 < rows;
      grid[r][c] = slot;
      if (wantSpan) grid[r + 1][c] = slot;
      slot++;
    }
  }
  return grid;
}

export interface SlotPlacement {
  colStart: number;
  rowStart: number;
  colSpan: number;
}

export function slotPlacement(
  index: number,
  count: number,
  cols: number,
): SlotPlacement {
  const safeCols = Math.max(1, cols);
  const row = Math.floor(index / safeCols);
  const col = index % safeCols;
  const lastRow = Math.floor((count - 1) / safeCols);
  const isLastRow = row === lastRow;
  const lastRowCount = count - lastRow * safeCols;
  const isLastInRow = isLastRow && col === lastRowCount - 1;
  const remaining = safeCols - lastRowCount;
  const colSpan = isLastInRow && remaining > 0 ? 1 + remaining : 1;
  return { colStart: col + 1, rowStart: row + 1, colSpan };
}

export function defaultSizes(n: number): number[] {
  return Array.from({ length: Math.max(1, n) }, () => 1);
}

export interface CustomLayout {
  cols: number;
  colSizes: number[];
  rowSizes: number[];
  slotOrder?: number[];
}

export function rowsForCount(count: number, cols: number): number {
  const safe = Math.max(1, cols);
  return Math.max(1, Math.ceil(count / safe));
}

export function syncLayoutSizes(
  layout: CustomLayout,
  count: number,
): CustomLayout {
  const cols = Math.max(1, layout.cols);
  const targetRows = rowsForCount(count, cols);
  const colSizes = resizeArray(layout.colSizes, cols);
  const rowSizes = resizeArray(layout.rowSizes, targetRows);
  if (
    cols === layout.cols &&
    colSizes === layout.colSizes &&
    rowSizes === layout.rowSizes
  ) {
    return layout;
  }
  return { cols, colSizes, rowSizes, slotOrder: layout.slotOrder };
}

export function syncSlotOrder(
  slotOrder: number[] | undefined,
  presentTabIds: number[],
): number[] | undefined {
  if (!slotOrder) return undefined;
  const present = new Set(presentTabIds);
  const filtered = slotOrder.filter((id) => present.has(id));
  const known = new Set(filtered);
  const appended = presentTabIds.filter((id) => !known.has(id));
  if (
    filtered.length === slotOrder.length &&
    appended.length === 0 &&
    filtered.every((id, i) => id === slotOrder[i])
  ) {
    return slotOrder;
  }
  return [...filtered, ...appended];
}

function resizeArray(arr: number[], target: number): number[] {
  if (arr.length === target && arr.every((v) => v > 0)) return arr;
  if (target <= 0) return [1];
  const next = arr.slice(0, target);
  while (next.length < target) {
    const avg = next.length > 0 ? avgOf(next) : 1;
    next.push(avg);
  }
  for (let i = 0; i < next.length; i++) {
    if (!(next[i] > 0)) next[i] = 1;
  }
  return next;
}

function avgOf(arr: number[]): number {
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}
