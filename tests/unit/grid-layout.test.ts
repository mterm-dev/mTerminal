import { describe, it, expect } from 'vitest'
import { computeGridLayout } from '../../src/lib/grid-layout'

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
