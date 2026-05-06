import { describe, it, expect } from 'vitest'
import {
  computeGridLayout,
  defaultSizes,
  rowsForCount,
  slotPlacement,
  syncLayoutSizes,
  syncSlotOrder,
} from '../../src/lib/grid-layout'

describe('computeGridLayout', () => {
  it('returns null for non-positive counts', () => {
    expect(computeGridLayout(0)).toBeNull()
    expect(computeGridLayout(-1)).toBeNull()
  })

  it('uses 1x1 grid for a single tab', () => {
    const layout = computeGridLayout(1)
    expect(layout).toEqual({ cols: 1, rows: 1, spanRowsSlots: new Set() })
  })

  it('uses a 2x1 grid for two tabs (no spanning)', () => {
    const layout = computeGridLayout(2)!
    expect(layout.cols).toBe(2)
    expect(layout.rows).toBe(1)
    expect(layout.spanRowsSlots).toEqual(new Set())
  })

  it('spans the rightmost top tab over 2 rows for 3 tabs', () => {
    const layout = computeGridLayout(3)!
    expect(layout.cols).toBe(2)
    expect(layout.rows).toBe(2)
    expect(layout.spanRowsSlots).toEqual(new Set([1]))
  })

  it('does not span anything in a perfect square (4 tabs)', () => {
    const layout = computeGridLayout(4)!
    expect(layout.cols).toBe(2)
    expect(layout.rows).toBe(2)
    expect(layout.spanRowsSlots).toEqual(new Set())
  })

  it('spans the top-right tab for 5 tabs', () => {
    const layout = computeGridLayout(5)!
    expect(layout.cols).toBe(3)
    expect(layout.rows).toBe(2)
    expect(layout.spanRowsSlots).toEqual(new Set([2]))
  })

  it('spans nothing for 6 tabs (full last row)', () => {
    const layout = computeGridLayout(6)!
    expect(layout.cols).toBe(3)
    expect(layout.rows).toBe(2)
    expect(layout.spanRowsSlots).toEqual(new Set())
  })

  it('spans the two trailing slots in the second-to-last row for 7 tabs', () => {
    const layout = computeGridLayout(7)!
    expect(layout.cols).toBe(3)
    expect(layout.rows).toBe(3)
    expect(layout.spanRowsSlots).toEqual(new Set([4, 5]))
  })

  it('spans the rightmost slot for 8 tabs (one empty cell)', () => {
    const layout = computeGridLayout(8)!
    expect(layout.cols).toBe(3)
    expect(layout.rows).toBe(3)
    expect(layout.spanRowsSlots).toEqual(new Set([5]))
  })

  it('spans nothing for 9 tabs (perfect 3x3)', () => {
    const layout = computeGridLayout(9)!
    expect(layout.cols).toBe(3)
    expect(layout.rows).toBe(3)
    expect(layout.spanRowsSlots).toEqual(new Set())
  })

  it('spans the rightmost second-to-last-row slot for 11 tabs', () => {
    const layout = computeGridLayout(11)!
    expect(layout.cols).toBe(4)
    expect(layout.rows).toBe(3)
    expect(layout.spanRowsSlots).toEqual(new Set([7]))
  })
})

describe('slotPlacement', () => {
  it('places slots row-major in a 2x2 grid (4 tabs)', () => {
    expect(slotPlacement(0, 4, 2)).toEqual({ colStart: 1, rowStart: 1, colSpan: 1 })
    expect(slotPlacement(1, 4, 2)).toEqual({ colStart: 2, rowStart: 1, colSpan: 1 })
    expect(slotPlacement(2, 4, 2)).toEqual({ colStart: 1, rowStart: 2, colSpan: 1 })
    expect(slotPlacement(3, 4, 2)).toEqual({ colStart: 2, rowStart: 2, colSpan: 1 })
  })

  it('expands the last tab to fill remaining columns in a partial last row (3 tabs in 2 cols)', () => {
    expect(slotPlacement(0, 3, 2)).toEqual({ colStart: 1, rowStart: 1, colSpan: 1 })
    expect(slotPlacement(1, 3, 2)).toEqual({ colStart: 2, rowStart: 1, colSpan: 1 })
    expect(slotPlacement(2, 3, 2)).toEqual({ colStart: 1, rowStart: 2, colSpan: 2 })
  })

  it('expands the last tab in a 3-col grid with 5 tabs (last row has 2)', () => {
    expect(slotPlacement(4, 5, 3)).toEqual({ colStart: 2, rowStart: 2, colSpan: 2 })
  })

  it('handles cols < 1 by clamping to 1', () => {
    expect(slotPlacement(0, 1, 0)).toEqual({ colStart: 1, rowStart: 1, colSpan: 1 })
  })
})

describe('defaultSizes', () => {
  it('returns array of 1s', () => {
    expect(defaultSizes(3)).toEqual([1, 1, 1])
  })
  it('returns at least one element for 0 or negative input', () => {
    expect(defaultSizes(0)).toEqual([1])
    expect(defaultSizes(-2)).toEqual([1])
  })
})

describe('rowsForCount', () => {
  it('rounds up the row count', () => {
    expect(rowsForCount(5, 3)).toBe(2)
    expect(rowsForCount(6, 3)).toBe(2)
    expect(rowsForCount(7, 3)).toBe(3)
  })
  it('returns at least 1', () => {
    expect(rowsForCount(0, 3)).toBe(1)
  })
})

describe('syncLayoutSizes', () => {
  it('returns same reference when nothing changes', () => {
    const layout = { cols: 2, colSizes: [1, 2], rowSizes: [1] }
    const out = syncLayoutSizes(layout, 2)
    expect(out).toBe(layout)
  })

  it('extends rowSizes when count grows', () => {
    const layout = { cols: 2, colSizes: [1, 1], rowSizes: [1] }
    const out = syncLayoutSizes(layout, 3)
    expect(out.rowSizes).toHaveLength(2)
    expect(out.colSizes).toEqual([1, 1])
  })

  it('shrinks rowSizes when count drops', () => {
    const layout = { cols: 2, colSizes: [1, 1], rowSizes: [1, 2, 3] }
    const out = syncLayoutSizes(layout, 2)
    expect(out.rowSizes).toEqual([1])
  })

  it('extends colSizes when cols grows', () => {
    const layout = { cols: 2, colSizes: [3, 1], rowSizes: [1] }
    const out = syncLayoutSizes({ ...layout, cols: 4 }, 4)
    expect(out.colSizes).toHaveLength(4)
    expect(out.colSizes[0]).toBe(3)
    expect(out.colSizes[1]).toBe(1)
  })

  it('replaces non-positive sizes with 1', () => {
    const layout = { cols: 2, colSizes: [0, 2], rowSizes: [1] }
    const out = syncLayoutSizes(layout, 2)
    expect(out.colSizes[0]).toBeGreaterThan(0)
  })

  it('preserves slotOrder if present', () => {
    const layout = { cols: 2, colSizes: [1, 1], rowSizes: [1], slotOrder: [3, 1, 2] }
    const out = syncLayoutSizes(layout, 3)
    expect(out.slotOrder).toEqual([3, 1, 2])
  })
})

describe('syncSlotOrder', () => {
  it('returns undefined when no slotOrder is provided', () => {
    expect(syncSlotOrder(undefined, [1, 2, 3])).toBeUndefined()
  })

  it('returns same reference when nothing needs to change', () => {
    const order = [3, 1, 2]
    const out = syncSlotOrder(order, [1, 2, 3])
    expect(out).toBe(order)
  })

  it('removes ids no longer present', () => {
    const out = syncSlotOrder([3, 1, 2], [1, 2])
    expect(out).toEqual([1, 2])
  })

  it('appends new ids at the end in their incoming order', () => {
    const out = syncSlotOrder([2, 1], [1, 2, 4, 5])
    expect(out).toEqual([2, 1, 4, 5])
  })

  it('handles a full reset where all old ids are gone', () => {
    const out = syncSlotOrder([5, 6], [1, 2, 3])
    expect(out).toEqual([1, 2, 3])
  })
})
