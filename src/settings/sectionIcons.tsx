import type { ReactNode } from "react";

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export const SECTION_ICONS: Record<string, ReactNode> = {
  appearance: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a4 4 0 0 0 0 8 4 4 0 0 1 0 8" />
      <circle cx="6.5" cy="9" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="15" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="9" cy="6" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  ),
  terminal: (
    <svg {...ICON_PROPS}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3" />
      <path d="M13 15h4" />
    </svg>
  ),
  general: (
    <svg {...ICON_PROPS}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2" fill="var(--bg-base)" />
      <circle cx="15" cy="12" r="2" fill="var(--bg-base)" />
      <circle cx="8" cy="17" r="2" fill="var(--bg-base)" />
    </svg>
  ),
  vault: (
    <svg {...ICON_PROPS}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
      <line x1="12" y1="16" x2="12" y2="18" />
    </svg>
  ),
  ai: (
    <svg {...ICON_PROPS}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
      <path d="M18 15l0.7 1.8L20.5 17.5l-1.8 0.7L18 20l-0.7-1.8L15.5 17.5l1.8-0.7z" />
    </svg>
  ),
  voice: (
    <svg {...ICON_PROPS}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  ),
  extensions: (
    <svg {...ICON_PROPS}>
      <path d="M9 4h2v3h3v2h3v3a2 2 0 0 1-2 2h-1v3a2 2 0 0 1-2 2h-3v-3H7a2 2 0 0 1-2-2v-3h3V9a2 2 0 0 1 2-2V4z" />
    </svg>
  ),
  danger: (
    <svg {...ICON_PROPS}>
      <path d="M12 3L2 20h20L12 3z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <circle cx="12" cy="17" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  ),
  about: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="8" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  ),
};
