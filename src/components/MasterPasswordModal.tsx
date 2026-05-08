import { useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";

const MIN_DECRYPT_VISIBLE_MS = 600;
const SUCCESS_HOLD_MS = 600;

export type MasterPasswordMode = "init" | "unlock" | "change";
export type MasterPasswordPhase = "input" | "decrypting" | "success";

interface Props {
  mode: MasterPasswordMode;
  phase?: MasterPasswordPhase;
  onClose: () => void;
  onInit: (password: string) => Promise<void>;
  onUnlock: (password: string) => Promise<void>;
  onChange?: (oldPassword: string, newPassword: string) => Promise<void>;
  onPhaseChange?: (phase: MasterPasswordPhase) => void;
}

export function MasterPasswordModal({
  mode,
  phase: phaseProp,
  onClose,
  onInit,
  onUnlock,
  onChange,
  onPhaseChange,
}: Props) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [localPhase, setLocalPhase] = useState<MasterPasswordPhase>("input");

  const phase: MasterPasswordPhase =
    localPhase !== "input" ? localPhase : (phaseProp ?? "input");
  const busy = phase !== "input";

  useEscapeKey(onClose, { enabled: !busy, preventDefault: true });

  const setPhase = (next: MasterPasswordPhase) => {
    setLocalPhase(next);
    onPhaseChange?.(next);
  };

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
    setPhase("decrypting");
    await new Promise<void>((r) => setTimeout(r, 0));
    const minDelay = new Promise<void>((r) =>
      setTimeout(r, MIN_DECRYPT_VISIBLE_MS),
    );
    try {
      const work =
        mode === "init"
          ? onInit(pw)
          : mode === "unlock"
            ? onUnlock(pw)
            : onChange
              ? onChange(oldPw, pw)
              : Promise.reject(new Error("change handler missing"));
      await Promise.all([work, minDelay]);
      setPhase("success");
      setTimeout(onClose, SUCCESS_HOLD_MS);
    } catch (err) {
      setPhase("input");
      setError(String(err));
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
        <div className="settings-scroll vault-body">
          {phase === "decrypting" ? (
            <div className="vault-busy-panel" role="status" aria-live="polite">
              <div className="vault-busy-spinner" aria-hidden="true" />
              <div className="vault-busy-label">
                {mode === "init"
                  ? "encrypting vault…"
                  : mode === "change"
                    ? "re-encrypting vault…"
                    : "decrypting vault…"}
              </div>
            </div>
          ) : phase === "success" ? (
            <div className="vault-busy-panel" role="status" aria-live="polite">
              <div className="vault-success-check" aria-hidden="true">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    opacity="0.6"
                  />
                  <path
                    d="M7 12.5l3.2 3.2L17 9"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="vault-busy-label">unlocked</div>
            </div>
          ) : (
            <form onSubmit={submit}>
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
                <button type="button" className="confirm-btn" onClick={onClose}>
                  cancel
                </button>
                <button
                  type="submit"
                  className="confirm-btn confirm-btn-primary"
                >
                  {mode === "unlock" ? "unlock" : "save"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
