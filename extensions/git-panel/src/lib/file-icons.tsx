import React from 'react'

const sw = 1.6

interface IconProps {
  className?: string
}

function Svg({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function IconFileGeneric(): React.JSX.Element {
  return (
    <Svg>
      <path d="M4 2.5A1.5 1.5 0 0 1 5.5 1H10l3.5 3.5V13.5A1.5 1.5 0 0 1 12 15H5.5A1.5 1.5 0 0 1 4 13.5v-11z" />
      <path d="M10 1v3.5h3.5" />
    </Svg>
  )
}

export function IconCode(): React.JSX.Element {
  return (
    <Svg>
      <path d="M4 2.5A1.5 1.5 0 0 1 5.5 1H10l3.5 3.5V13.5A1.5 1.5 0 0 1 12 15H5.5A1.5 1.5 0 0 1 4 13.5v-11z" />
      <path d="M10 1v3.5h3.5" />
      <path d="M7.5 8.5L6 10l1.5 1.5" />
      <path d="M10 8.5L11.5 10 10 11.5" />
    </Svg>
  )
}

export function IconMarkup(): React.JSX.Element {
  return (
    <Svg>
      <path d="M4 2.5A1.5 1.5 0 0 1 5.5 1H10l3.5 3.5V13.5A1.5 1.5 0 0 1 12 15H5.5A1.5 1.5 0 0 1 4 13.5v-11z" />
      <path d="M10 1v3.5h3.5" />
      <path d="M7.2 8.5L5.8 10l1.4 1.5" />
      <path d="M10.4 8.5L11.8 10l-1.4 1.5" />
      <path d="M9.6 8L8.4 12" />
    </Svg>
  )
}

export function IconStyle(): React.JSX.Element {
  return (
    <Svg>
      <path d="M4 2.5A1.5 1.5 0 0 1 5.5 1H10l3.5 3.5V13.5A1.5 1.5 0 0 1 12 15H5.5A1.5 1.5 0 0 1 4 13.5v-11z" />
      <path d="M10 1v3.5h3.5" />
      <path d="M6 9h5" />
      <path d="M6 11h3.5" />
    </Svg>
  )
}

export function IconConfig(): React.JSX.Element {
  return (
    <Svg>
      <circle cx="8" cy="8.5" r="2.2" />
      <path d="M8 4.5v1" />
      <path d="M8 11.5v1" />
      <path d="M11.5 8.5h-1" />
      <path d="M5.5 8.5h-1" />
      <path d="M10.5 6l-.7.7" />
      <path d="M6.2 10.8l-.7.7" />
      <path d="M10.5 11l-.7-.7" />
      <path d="M6.2 6.2L5.5 5.5" />
    </Svg>
  )
}

export function IconShell(): React.JSX.Element {
  return (
    <Svg>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M5 7l1.5 1.5L5 10" />
      <path d="M8.5 10.5h3" />
    </Svg>
  )
}

export function IconDocker(): React.JSX.Element {
  return (
    <Svg>
      <rect x="3" y="7" width="2" height="2" />
      <rect x="6" y="7" width="2" height="2" />
      <rect x="9" y="7" width="2" height="2" />
      <rect x="6" y="4" width="2" height="2" />
      <path d="M2 9h11c0 2-1.5 3.5-4 3.5H6c-2.5 0-4-1.5-4-3.5z" />
    </Svg>
  )
}

export function IconImage(): React.JSX.Element {
  return (
    <Svg>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="6" cy="7" r="1.2" />
      <path d="M3 12l3-3 2 2 3-4 4 5" />
    </Svg>
  )
}

export function IconArchive(): React.JSX.Element {
  return (
    <Svg>
      <rect x="2.5" y="3" width="11" height="3" rx="0.5" />
      <path d="M3.5 6v6.5A1.5 1.5 0 0 0 5 14h6a1.5 1.5 0 0 0 1.5-1.5V6" />
      <path d="M7 8h2" />
      <path d="M7 10.5h2" />
    </Svg>
  )
}

export function IconLock(): React.JSX.Element {
  return (
    <Svg>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </Svg>
  )
}

export function IconGit(): React.JSX.Element {
  return (
    <Svg>
      <circle cx="5" cy="5" r="1.5" />
      <circle cx="5" cy="11" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <path d="M5 6.5v3" />
      <path d="M5 8c3 0 4-1 4.5-1.5" />
    </Svg>
  )
}

export function IconBinary(): React.JSX.Element {
  return (
    <Svg>
      <rect x="3" y="3.5" width="10" height="9" rx="1" />
      <path d="M5.5 6.5v3" />
      <path d="M5.5 6.5h.7" />
      <rect x="9" y="6" width="2.2" height="3.5" rx="0.4" />
    </Svg>
  )
}

export function IconDoc(): React.JSX.Element {
  return (
    <Svg>
      <path d="M4 2.5A1.5 1.5 0 0 1 5.5 1H10l3.5 3.5V13.5A1.5 1.5 0 0 1 12 15H5.5A1.5 1.5 0 0 1 4 13.5v-11z" />
      <path d="M10 1v3.5h3.5" />
      <path d="M6 8.5h5" />
      <path d="M6 10.5h5" />
      <path d="M6 12.5h3" />
    </Svg>
  )
}

export function IconData(): React.JSX.Element {
  return (
    <Svg>
      <ellipse cx="8" cy="4.5" rx="5" ry="1.5" />
      <path d="M3 4.5v7c0 .8 2.2 1.5 5 1.5s5-.7 5-1.5v-7" />
      <path d="M3 8c0 .8 2.2 1.5 5 1.5s5-.7 5-1.5" />
    </Svg>
  )
}

export interface FileIconDef {
  color: string
  Icon: React.FC<IconProps>
}

const DEFAULT: FileIconDef = { color: 'var(--fg-dim)', Icon: IconFileGeneric }

const SPECIAL_NAMES: Record<string, FileIconDef> = {
  dockerfile: { color: 'var(--c-blue)', Icon: IconDocker },
  'docker-compose.yml': { color: 'var(--c-blue)', Icon: IconDocker },
  'docker-compose.yaml': { color: 'var(--c-blue)', Icon: IconDocker },
  makefile: { color: 'var(--fg-muted)', Icon: IconConfig },
  'package.json': { color: 'var(--c-amber)', Icon: IconConfig },
  'package-lock.json': { color: 'var(--fg-disabled)', Icon: IconLock },
  'pnpm-lock.yaml': { color: 'var(--fg-disabled)', Icon: IconLock },
  'yarn.lock': { color: 'var(--fg-disabled)', Icon: IconLock },
  'cargo.lock': { color: 'var(--fg-disabled)', Icon: IconLock },
  'cargo.toml': { color: 'var(--c-orange)', Icon: IconConfig },
  'go.sum': { color: 'var(--fg-disabled)', Icon: IconLock },
  'go.mod': { color: 'var(--c-cyan)', Icon: IconConfig },
  '.gitignore': { color: 'var(--fg-disabled)', Icon: IconGit },
  '.gitattributes': { color: 'var(--fg-disabled)', Icon: IconGit },
  '.gitmodules': { color: 'var(--fg-disabled)', Icon: IconGit },
  '.env': { color: 'var(--c-emerald)', Icon: IconConfig },
  license: { color: 'var(--fg-muted)', Icon: IconDoc },
  'license.md': { color: 'var(--fg-muted)', Icon: IconDoc },
  'license.txt': { color: 'var(--fg-muted)', Icon: IconDoc },
  readme: { color: 'var(--fg)', Icon: IconDoc },
  'readme.md': { color: 'var(--fg)', Icon: IconDoc },
}

const EXT_MAP: Record<string, FileIconDef> = {
  ts: { color: 'var(--c-blue)', Icon: IconCode },
  tsx: { color: 'var(--c-blue)', Icon: IconCode },
  mts: { color: 'var(--c-blue)', Icon: IconCode },
  cts: { color: 'var(--c-blue)', Icon: IconCode },
  'd.ts': { color: 'var(--c-sky)', Icon: IconCode },
  js: { color: 'var(--c-amber)', Icon: IconCode },
  mjs: { color: 'var(--c-amber)', Icon: IconCode },
  cjs: { color: 'var(--c-amber)', Icon: IconCode },
  jsx: { color: 'var(--c-amber)', Icon: IconCode },
  py: { color: 'var(--c-emerald)', Icon: IconCode },
  pyi: { color: 'var(--c-emerald)', Icon: IconCode },
  rs: { color: 'var(--c-orange)', Icon: IconCode },
  go: { color: 'var(--c-cyan)', Icon: IconCode },
  c: { color: 'var(--c-blue)', Icon: IconCode },
  h: { color: 'var(--c-blue)', Icon: IconCode },
  cc: { color: 'var(--c-blue)', Icon: IconCode },
  cpp: { color: 'var(--c-blue)', Icon: IconCode },
  hpp: { color: 'var(--c-blue)', Icon: IconCode },
  rb: { color: 'var(--c-pink)', Icon: IconCode },
  php: { color: 'var(--c-violet)', Icon: IconCode },
  java: { color: 'var(--c-pink)', Icon: IconCode },
  kt: { color: 'var(--c-violet)', Icon: IconCode },
  swift: { color: 'var(--c-orange)', Icon: IconCode },
  html: { color: 'var(--c-orange)', Icon: IconMarkup },
  htm: { color: 'var(--c-orange)', Icon: IconMarkup },
  xml: { color: 'var(--c-orange)', Icon: IconMarkup },
  svg: { color: 'var(--c-violet)', Icon: IconImage },
  vue: { color: 'var(--c-emerald)', Icon: IconMarkup },
  md: { color: 'var(--fg)', Icon: IconDoc },
  mdx: { color: 'var(--fg)', Icon: IconDoc },
  rst: { color: 'var(--fg)', Icon: IconDoc },
  txt: { color: 'var(--fg-muted)', Icon: IconDoc },
  pdf: { color: 'var(--c-pink)', Icon: IconDoc },
  log: { color: 'var(--fg-disabled)', Icon: IconDoc },
  css: { color: 'var(--c-violet)', Icon: IconStyle },
  scss: { color: 'var(--c-pink)', Icon: IconStyle },
  sass: { color: 'var(--c-pink)', Icon: IconStyle },
  less: { color: 'var(--c-blue)', Icon: IconStyle },
  json: { color: 'var(--c-amber)', Icon: IconConfig },
  jsonc: { color: 'var(--c-amber)', Icon: IconConfig },
  yml: { color: 'var(--c-amber)', Icon: IconConfig },
  yaml: { color: 'var(--c-amber)', Icon: IconConfig },
  toml: { color: 'var(--c-orange)', Icon: IconConfig },
  ini: { color: 'var(--fg-muted)', Icon: IconConfig },
  cfg: { color: 'var(--fg-muted)', Icon: IconConfig },
  conf: { color: 'var(--fg-muted)', Icon: IconConfig },
  sh: { color: 'var(--c-cyan)', Icon: IconShell },
  bash: { color: 'var(--c-cyan)', Icon: IconShell },
  zsh: { color: 'var(--c-cyan)', Icon: IconShell },
  fish: { color: 'var(--c-cyan)', Icon: IconShell },
  ps1: { color: 'var(--c-blue)', Icon: IconShell },
  png: { color: 'var(--c-pink)', Icon: IconImage },
  jpg: { color: 'var(--c-pink)', Icon: IconImage },
  jpeg: { color: 'var(--c-pink)', Icon: IconImage },
  gif: { color: 'var(--c-pink)', Icon: IconImage },
  webp: { color: 'var(--c-pink)', Icon: IconImage },
  bmp: { color: 'var(--c-pink)', Icon: IconImage },
  ico: { color: 'var(--c-pink)', Icon: IconImage },
  avif: { color: 'var(--c-pink)', Icon: IconImage },
  zip: { color: 'var(--fg-muted)', Icon: IconArchive },
  tar: { color: 'var(--fg-muted)', Icon: IconArchive },
  gz: { color: 'var(--fg-muted)', Icon: IconArchive },
  tgz: { color: 'var(--fg-muted)', Icon: IconArchive },
  bz2: { color: 'var(--fg-muted)', Icon: IconArchive },
  xz: { color: 'var(--fg-muted)', Icon: IconArchive },
  '7z': { color: 'var(--fg-muted)', Icon: IconArchive },
  rar: { color: 'var(--fg-muted)', Icon: IconArchive },
  lock: { color: 'var(--fg-disabled)', Icon: IconLock },
  exe: { color: 'var(--fg-disabled)', Icon: IconBinary },
  dll: { color: 'var(--fg-disabled)', Icon: IconBinary },
  so: { color: 'var(--fg-disabled)', Icon: IconBinary },
  dylib: { color: 'var(--fg-disabled)', Icon: IconBinary },
  o: { color: 'var(--fg-disabled)', Icon: IconBinary },
  a: { color: 'var(--fg-disabled)', Icon: IconBinary },
  csv: { color: 'var(--c-cyan)', Icon: IconData },
  tsv: { color: 'var(--c-cyan)', Icon: IconData },
  sql: { color: 'var(--c-cyan)', Icon: IconData },
  db: { color: 'var(--c-cyan)', Icon: IconData },
  sqlite: { color: 'var(--c-cyan)', Icon: IconData },
}

export function getFileIcon(name: string): FileIconDef {
  if (!name) return DEFAULT
  const lower = name.toLowerCase()

  const special = SPECIAL_NAMES[lower]
  if (special) return special

  if (lower.startsWith('.env')) {
    return EXT_MAP['env'] ?? { color: 'var(--c-emerald)', Icon: IconConfig }
  }
  if (lower.endsWith('.dockerfile') || lower === 'containerfile') {
    return { color: 'var(--c-blue)', Icon: IconDocker }
  }

  const dotIdx = lower.lastIndexOf('.')
  if (dotIdx <= 0) return DEFAULT
  const ext = lower.slice(dotIdx + 1)

  if (ext === 'ts' && lower.endsWith('.d.ts')) {
    return EXT_MAP['d.ts'] ?? EXT_MAP['ts'] ?? DEFAULT
  }

  return EXT_MAP[ext] ?? DEFAULT
}
