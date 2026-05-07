/**
 * Renderer-side copy of `electron/main/extensions/semver-mini.ts`. We keep
 * a duplicate to avoid pulling Node-specific imports into the renderer
 * bundle.
 *
 * Supported range syntax: `*`, `X.Y.Z`, `^X.Y.Z`, `~X.Y.Z`, `>=X.Y.Z`, etc.
 * For full-featured semver swap to the `semver` npm package.
 */

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  pre: string[]
}

export function parse(version: string): ParsedVersion | null {
  const m = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ? m[4].split('.') : [],
  }
}

interface Comparator {
  op: '<' | '<=' | '>' | '>=' | '='
  ver: ParsedVersion
}

function parseComparator(token: string): Comparator[] | null {
  const raw = token.trim()
  if (!raw) return []
  if (raw === '*' || raw === 'x' || raw === 'X') {
    return [{ op: '>=', ver: { major: 0, minor: 0, patch: 0, pre: [] } }]
  }
  if (raw.startsWith('^')) {
    const v = parse(raw.slice(1))
    if (!v) return null
    let upper: ParsedVersion
    if (v.major > 0) upper = { major: v.major + 1, minor: 0, patch: 0, pre: [] }
    else if (v.minor > 0) upper = { major: 0, minor: v.minor + 1, patch: 0, pre: [] }
    else upper = { major: 0, minor: 0, patch: v.patch + 1, pre: [] }
    return [{ op: '>=', ver: v }, { op: '<', ver: upper }]
  }
  if (raw.startsWith('~')) {
    const v = parse(raw.slice(1))
    if (!v) return null
    return [
      { op: '>=', ver: v },
      { op: '<', ver: { major: v.major, minor: v.minor + 1, patch: 0, pre: [] } },
    ]
  }
  const opMatch = raw.match(/^(>=|<=|>|<|=)?\s*(.+)$/)
  if (!opMatch) return null
  const op = (opMatch[1] || '=') as Comparator['op']
  const v = parse(opMatch[2])
  if (!v) return null
  return [{ op, ver: v }]
}

function compare(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  if (a.pre.length === 0 && b.pre.length > 0) return 1
  if (a.pre.length > 0 && b.pre.length === 0) return -1
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const ai = a.pre[i],
      bi = b.pre[i]
    if (ai === undefined) return -1
    if (bi === undefined) return 1
    const an = Number(ai),
      bn = Number(bi)
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      if (an !== bn) return an - bn
    } else if (ai !== bi) return ai < bi ? -1 : 1
  }
  return 0
}

export function satisfies(version: string, range: string): boolean {
  const v = parse(version)
  if (!v) return false
  const tokens = range.trim().split(/\s+/).filter(Boolean)
  const comparators: Comparator[] = []
  for (const t of tokens) {
    const cs = parseComparator(t)
    if (cs === null) return false
    comparators.push(...cs)
  }
  if (!comparators.length) return true
  return comparators.every((c) => check(v, c))
}

function check(v: ParsedVersion, c: Comparator): boolean {
  const cmp = compare(v, c.ver)
  switch (c.op) {
    case '=':
      return cmp === 0
    case '>':
      return cmp > 0
    case '>=':
      return cmp >= 0
    case '<':
      return cmp < 0
    case '<=':
      return cmp <= 0
  }
}
