interface Props {
  isSolo: boolean;
  onSolo: () => void;
  onRename: () => void;
  onClose: () => void;
}

export function GridTabToolbar({ isSolo, onSolo, onRename, onClose }: Props) {
  return (
    <div
      className="grid-toolbar"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
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
  );
}
