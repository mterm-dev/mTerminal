import type { PointerEvent as RPointerEvent } from "react";
import { InlineEdit } from "./InlineEdit";

interface Props {
  label: string;
  sub?: string;
  isSolo: boolean;
  onSolo: () => void;
  onRename: () => void;
  onClose: () => void;
  onDragStart?: (e: RPointerEvent<HTMLDivElement>) => void;
  dragging?: boolean;
  editing?: boolean;
  setEditing?: (b: boolean) => void;
  onCommitRename?: (next: string) => void;
}

export function GridTabToolbar({
  label,
  sub,
  isSolo,
  onSolo,
  onRename,
  onClose,
  onDragStart,
  dragging,
  editing,
  setEditing,
  onCommitRename,
}: Props) {
  const stopButton = (e: RPointerEvent<HTMLElement>) => e.stopPropagation();
  return (
    <div
      className={`grid-toolbar${dragging ? " dragging" : ""}`}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        className="grid-toolbar-handle"
        onPointerDown={editing ? undefined : onDragStart}
        onDoubleClick={() => setEditing?.(true)}
        title="drag to swap with another terminal"
        aria-label="drag handle"
      >
        <svg
          className="grid-toolbar-grip"
          width="10"
          height="14"
          viewBox="0 0 10 14"
          aria-hidden="true"
        >
          <circle cx="2.5" cy="3" r="1" fill="currentColor" />
          <circle cx="7.5" cy="3" r="1" fill="currentColor" />
          <circle cx="2.5" cy="7" r="1" fill="currentColor" />
          <circle cx="7.5" cy="7" r="1" fill="currentColor" />
          <circle cx="2.5" cy="11" r="1" fill="currentColor" />
          <circle cx="7.5" cy="11" r="1" fill="currentColor" />
        </svg>
        {onCommitRename && setEditing ? (
          <InlineEdit
            className="grid-toolbar-label"
            value={label}
            editing={!!editing}
            setEditing={setEditing}
            onCommit={onCommitRename}
          />
        ) : (
          <span className="grid-toolbar-label">{label}</span>
        )}
        {sub ? <span className="grid-toolbar-sub">{sub}</span> : null}
      </div>
      <div className="grid-toolbar-buttons" onPointerDown={stopButton}>
        <button
          className="grid-toolbar-btn"
          title={isSolo ? "exit fullscreen (Esc)" : "fullscreen this terminal"}
          aria-label={isSolo ? "exit fullscreen" : "fullscreen"}
          onClick={onSolo}
        >
          {isSolo ? (
            <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M6 2v4H2M14 6h-4V2M2 10h4v4M10 14v-4h4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
        <button
          className="grid-toolbar-btn"
          title="rename"
          aria-label="rename"
          onClick={onRename}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M11 2.5l2.5 2.5L5.5 13H3v-2.5l8-8z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className="grid-toolbar-btn grid-toolbar-close"
          title="close tab"
          aria-label="close tab"
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
