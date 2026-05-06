const ICON_PROPS = {
  width: 13,
  height: 13,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function RefreshIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="8" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="20" y2="12" />
      <line x1="8" y1="18" x2="20" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

export function TreeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="3" y="3" width="8" height="6" rx="1" />
      <rect x="13" y="15" width="8" height="6" rx="1" />
      <rect x="3" y="15" width="8" height="6" rx="1" />
      <path d="M7 9v3h10v3" />
      <path d="M7 12v3" />
    </svg>
  );
}

export function ChevronsDownIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="7 6 12 11 17 6" />
      <polyline points="7 13 12 18 17 13" />
    </svg>
  );
}

export function ChevronsUpIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="17 11 12 6 7 11" />
      <polyline points="17 18 12 13 7 18" />
    </svg>
  );
}

export function FetchIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M17 18a4 4 0 1 0-1-7.9 6 6 0 0 0-11 1.9A3.5 3.5 0 0 0 6 19h1" />
      <line x1="12" y1="11" x2="12" y2="20" />
      <polyline points="8.5 16.5 12 20 15.5 16.5" />
    </svg>
  );
}

export function PullIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="12" y1="3" x2="12" y2="17" />
      <polyline points="6 12 12 18 18 12" />
      <line x1="5" y1="21" x2="19" y2="21" />
    </svg>
  );
}

export function PushIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="5" y1="3" x2="19" y2="3" />
      <line x1="12" y1="7" x2="12" y2="21" />
      <polyline points="6 12 12 6 18 12" />
    </svg>
  );
}

export function SparklesIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function CommitIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3.5" />
      <line x1="3" y1="12" x2="8.5" y2="12" />
      <line x1="15.5" y1="12" x2="21" y2="12" />
    </svg>
  );
}

export function CommitPushIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="14.5" r="3" />
      <line x1="3" y1="14.5" x2="9" y2="14.5" />
      <line x1="15" y1="14.5" x2="21" y2="14.5" />
      <polyline points="8.5 6 12 2.5 15.5 6" />
      <line x1="12" y1="2.5" x2="12" y2="9" />
    </svg>
  );
}

export function SpinnerIcon() {
  return (
    <svg {...ICON_PROPS} className="git-spin">
      <path d="M21 12a9 9 0 1 1-9-9" />
    </svg>
  );
}

export function ChevronToggle({ collapsed }: { collapsed: boolean }) {
  return (
    <span className={`git-chevron ${collapsed ? "collapsed" : ""}`} aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path
          d="M2.5 3.5 L5 6 L7.5 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function FolderIcon({ open }: { open: boolean }) {
  return (
    <span className="git-folder-icon" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 16 16">
        {open ? (
          <path d="M2 4 V12 H14 L15 6 H4 L3 4 Z" fill="currentColor" opacity="0.85" />
        ) : (
          <path d="M2 4 V12 H14 V5 H8 L7 4 Z" fill="currentColor" opacity="0.85" />
        )}
      </svg>
    </span>
  );
}
