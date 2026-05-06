import { useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";

export type MasterPasswordMode = "init" | "unlock" | "change";

interface Props {
  mode: MasterPasswordMode;
  onClose: () => void;
  onInit: (password: string) => Promise<void>;
  onUnlock: (password: string) => Promise<void>;
  onChange?: (oldPassword: string, newPassword: string) => Promise<void>;
}

export function MasterPasswordModal({ mode, onClose, onInit, onUnlock, onChange }: Props) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEscapeKey(onClose, { enabled: !busy, preventDefault: true });

  const submit = async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (busy) return;
    setError(null);
    if (!pw) {
      setError("master password is required");
      return;
    }
    if (mode === "init") {
      if (pw.length < 8) {
        setError("master password must be at least 8 characters");
        return;
      }
      if (pw !== pw2) {
        setError("passwords do not match");
        return;
      }
    }
    if (mode === "change") {
      if (!oldPw) {
        setError("current password is required");
        return;
      }
      if (pw.length < 8) {
        setError("new password must be at least 8 characters");
        return;
      }
      if (pw !== pw2) {
        setError("new passwords do not match");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "init") {
        await onInit(pw);
      } else if (mode === "unlock") {
        await onUnlock(pw);
      } else if (mode === "change") {
        if (!onChange) throw new Error("change handler missing");
        await onChange(oldPw, pw);
      }
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "init"
      ? "set master password"
      : mode === "unlock"
        ? "unlock vault"
        : "change master password";
  const hint =
    mode === "init"
      ? "this password protects your saved SSH passwords. losing it = losing saved passwords (SSH keys keep working)."
      : mode === "unlock"
        ? "enter your master password to access saved SSH passwords."
        : "enter the current master password and choose a new one.";

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="settings-dialog vault-dialog">
        <div className="settings-body-h">
          <span className="settings-title">{title}</span>
          <button className="settings-close" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>
        <form className="settings-scroll vault-body" onSubmit={submit}>
          <p className="settings-note">{hint}</p>

          {mode === "change" && (
            <div className="settings-field">
              <label className="settings-field-label">current password</label>
              <div className="settings-field-control">
                <input
                  type="password"
                  className="settings-input"
                  value={oldPw}
                  onChange={(e) => setOldPw(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="settings-field">
            <label className="settings-field-label">
              {mode === "change" ? "new password" : "master password"}
            </label>
            <div className="settings-field-control">
              <input
                type="password"
                className="settings-input"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoFocus={mode !== "change"}
              />
            </div>
          </div>

          {(mode === "init" || mode === "change") && (
            <div className="settings-field">
              <label className="settings-field-label">confirm password</label>
              <div className="settings-field-control">
                <input
                  type="password"
                  className="settings-input"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && <div className="vault-error">{error}</div>}

          <div className="vault-actions">
            <button
              type="button"
              className="confirm-btn"
              onClick={onClose}
              disabled={busy}
            >
              cancel
            </button>
            <button
              type="submit"
              className="confirm-btn confirm-btn-primary"
              disabled={busy}
            >
              {busy ? "..." : mode === "unlock" ? "unlock" : "save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
