import { useEffect } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface Props {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  useEscapeKey(onCancel, { preventDefault: true });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm]);

  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="confirm-dialog">
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="confirm-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="confirm-btn confirm-btn-primary"
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
