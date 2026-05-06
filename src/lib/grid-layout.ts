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
