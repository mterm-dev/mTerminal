import { getCurrentWindow } from "../lib/ipc";
import { useMaximized } from "../hooks/useMaximized";

interface Props {
  title: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function isMacPlatform(): boolean {
  return (window as { mt?: { platform?: string } }).mt?.platform === "darwin";
}

export function Titlebar({ title, sidebarCollapsed, onToggleSidebar }: Props) {
  const win = getCurrentWindow();
  const maximized = useMaximized();
  const isMac = isMacPlatform();

  return (
    <div className="term-titlebar" data-app-drag data-platform={isMac ? "mac" : ""}>
      {isMac && <div className="mac-traffic-spacer" data-app-drag />}
      <div className="term-titlebar-lead">
        <button
          className="titlebar-toggle"
          aria-label={sidebarCollapsed ? "show sidebar" : "hide sidebar"}
          aria-pressed={!sidebarCollapsed}
          title={
            sidebarCollapsed
              ? "Show sidebar (Ctrl+B)"
              : "Hide sidebar (Ctrl+B)"
          }
          onClick={onToggleSidebar}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="12"
              height="10"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <line
              x1="6.5"
              y1="3"
              x2="6.5"
              y2="13"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            {!sidebarCollapsed && (
              <rect x="2.7" y="3.7" width="3.1" height="8.6" fill="currentColor" opacity="0.4" />
            )}
          </svg>
        </button>
      </div>
      <div className="term-title" data-app-drag>
        {title}
      </div>
      {!isMac && (
        <div className="term-winctl">
          <button
            className="winctl-btn"
            aria-label="minimize"
            title="Minimize"
            onClick={() => win.minimize()}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className="winctl-btn"
            aria-label={maximized ? "restore" : "maximize"}
            title={maximized ? "Restore" : "Maximize"}
            onClick={() => win.toggleMaximize()}
          >
            {maximized ? (
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <rect
                  x="4.5" y="4.5" width="7" height="7"
                  fill="none" stroke="currentColor" strokeWidth="1.1"
                />
                <path
                  d="M6 4.5V3h7v7h-1.5"
                  fill="none" stroke="currentColor" strokeWidth="1.1"
                />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <rect
                  x="3.5" y="3.5" width="9" height="9"
                  fill="none" stroke="currentColor" strokeWidth="1.1"
                />
              </svg>
            )}
          </button>
          <button
            className="winctl-btn winctl-close"
            aria-label="close"
            title="Close"
            onClick={() => win.close()}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
