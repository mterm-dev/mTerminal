/**
 * Minimal semver implementation tailored to extension API use.
 *
 * Supported version shape: `MAJOR.MINOR.PATCH[-pre]` (build metadata stripped).
 * Supported range syntax:
 *   *                    — any
 *   X.Y.Z                — exact match
 *   ^X.Y.Z               — same major (or same minor if X==0; same patch if X==0&&Y==0)
 *   ~X.Y.Z               — same major and minor
 *   >X.Y.Z, >=X.Y.Z      — comparators
 *   <X.Y.Z, <=X.Y.Z      — comparators
 *   space-joined `AND`   — `>=1.0.0 <2.0.0`
 *
 * For full-featured semver (||, prereleases on ranges, advanced behavior),
 * swap the implementation here for the `semver` npm package.
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

export function compare(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  // No pre vs pre: pre version is lower precedence
  if (a.pre.length === 0 && b.pre.length > 0) return 1
  if (a.pre.length > 0 && b.pre.length === 0) return -1
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const ai = a.pre[i]
    const bi = b.pre[i]
    if (ai === undefined) return -1
    if (bi === undefined) return 1
    const an = Number(ai)
    const bn = Number(bi)
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      if (an !== bn) return an - bn
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1
    }
  }
  return 0
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
    const lower: Comparator = { op: '>=', ver: v }
    let upper: ParsedVersion
    if (v.major > 0) upper = { major: v.major + 1, minor: 0, patch: 0, pre: [] }
    else if (v.minor > 0) upper = { major: 0, minor: v.minor + 1, patch: 0, pre: [] }
    else upper = { major: 0, minor: 0, patch: v.patch + 1, pre: [] }
    return [lower, { op: '<', ver: upper }]
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

export function satisfies(version: string, range: string): boolean {
  const v = parse(version)
  if (!v) return false
  // No `||` support in mini.
  const tokens = range.trim().split(/\s+/).filter(Boolean)
  const comparators: Comparator[] = []
  for (const t of tokens) {
    const cs = parseComparator(t)
    if (cs === null) return false
    comparators.push(...cs)
  }
  if (comparators.length === 0) return true
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
