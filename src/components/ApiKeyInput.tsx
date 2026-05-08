import { useState } from "react";
import { ensureStyles } from "../settings/sections/ai/styles";

/**
 * Shared password-input UX for assigning an API key.
 *
 * Used in two places:
 *   1. Settings → AI → ProviderCard — vault-stored keys (`ai_keys.<provider>`)
 *      that the host vault gates behind a master password.
 *   2. Settings → Extensions → <ext> → AiBindingCard custom mode — per-binding
 *      secrets stored via `ctx.secrets` (OS keychain).
 *
 * Both contexts get identical visuals (`aip-row-control` styling) so the user
 * sees one consistent "this is how you assign an API key" surface.
 *
 * `locked` + `onRequestUnlock` are only relevant when the key lives behind the
 * vault. For OS-keychain secrets pass `locked={false}`.
 */

interface Props {
  hasKey: boolean;
  providerLabel: string;
  onSetKey: (key: string) => Promise<void>;
  onClearKey: () => Promise<void>;
  locked?: boolean;
  onRequestUnlock?: () => void;
  link?: string;
  placeholder?: string;
}

export function ApiKeyInput({
  hasKey,
  providerLabel,
  onSetKey,
  onClearKey,
  locked = false,
  onRequestUnlock,
  link,
  placeholder,
}: Props) {
  ensureStyles();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const v = draft.trim();
    if (!v) return;
    setBusy(true);
    try {
      await onSetKey(v);
      setDraft("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const clear = async (): Promise<void> => {
    setBusy(true);
    try {
      await onClearKey();
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (): void => {
    if (locked) {
      onRequestUnlock?.();
      return;
    }
    setEditing(true);
  };

  return (
    <div className="aip-row">
      <div className="aip-row-label">
        API key
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="aip-row-link"
          >
            get one ↗
          </a>
        )}
      </div>

      {editing ? (
        <div className="aip-row-control">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder ?? `paste ${providerLabel} API key`}
            autoFocus
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
              if (e.key === "Escape") {
                setEditing(false);
                setDraft("");
              }
            }}
          />
          <button
            className="ghost-btn"
            onClick={() => void submit()}
            disabled={busy || draft.trim() === ""}
          >
            save
          </button>
          <button
            className="ghost-btn"
            onClick={() => {
              setEditing(false);
              setDraft("");
            }}
            disabled={busy}
          >
            cancel
          </button>
        </div>
      ) : (
        <div className="aip-row-control aip-row-status">
          <span className={`aip-key-status ${hasKey ? "ok" : "empty"}`}>
            {hasKey ? "key saved" : locked ? "vault locked" : "no key set"}
          </span>
          <span className="aip-spacer" />
          <button className="ghost-btn" onClick={startEdit} disabled={busy}>
            {hasKey ? "replace" : locked ? "unlock to set" : "set key"}
          </button>
          {hasKey && !locked && (
            <button
              className="ghost-btn"
              onClick={() => void clear()}
              disabled={busy}
            >
              remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
