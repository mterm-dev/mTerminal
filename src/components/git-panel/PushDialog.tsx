import { useEffect, useState } from "react";
import { getGitApi, type GitLogEntry } from "../../lib/git-api";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { CommitRow } from "./CommitRow";
import { CloseIcon, SpinnerIcon } from "./icons";

interface Props {
  cwd: string;
  onClose: () => void;
  onComplete: (info: string) => void;
  onError: (msg: string) => void;
}

export function PushDialog({ cwd, onClose, onComplete, onError }: Props) {
  const [outgoing, setOutgoing] = useState<GitLogEntry[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [behind, setBehind] = useState(0);
  const [hasUpstream, setHasUpstream] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEscapeKey(onClose, { enabled: !busy });

  useEffect(() => {
    let active = true;
    const api = getGitApi();
    if (!api) {
      setFetchError("git api unavailable");
      return;
    }
    setOutgoing(null);
    setFetchError(null);
    (async () => {
      try {
        const list = await api.outgoing(cwd);
        if (!active) return;
        setOutgoing(list);
        const status = await api.status(cwd);
        if (!active) return;
        setBehind(status.behind ?? 0);
        setHasUpstream(!!status.upstream);
      } catch (e) {
        if (active) setFetchError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [cwd]);

  const confirm = async () => {
    const api = getGitApi();
    if (!api) return;
    setBusy(true);
    try {
      try {
        await api.push(cwd, false);
        onComplete("pushed");
      } catch (e) {
        const msg = (e as Error).message;
        if (/no upstream|set-upstream|has no upstream/i.test(msg)) {
          await api.push(cwd, true);
          onComplete("pushed (set upstream)");
        } else {
          throw e;
        }
      }
      onClose();
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  };

  const loading = outgoing === null && !fetchError;
  const empty = outgoing !== null && outgoing.length === 0;

  return (
    <div className="git-diff-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="git-diff-modal git-confirm-modal"
        role="dialog"
        aria-label="push"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="git-diff-modal-h">
          <div className="git-diff-modal-title">
            <span className="git-diff-modal-badge staged">push</span>
            <span className="git-diff-modal-path">outgoing changes</span>
          </div>
          <div className="git-diff-modal-actions">
            <button
              type="button"
              className="winctl-btn"
              onClick={onClose}
              aria-label="close"
              title="close (Esc)"
              disabled={busy}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="git-diff-modal-body git-confirm-body">
          {fetchError && <div className="git-diff-error">{fetchError}</div>}
          {loading && <div className="git-diff-loading">loading…</div>}
          {hasUpstream === false && (
            <div className="git-confirm-note">no upstream — push will set origin/&lt;branch&gt;</div>
          )}
          {behind > 0 && (
            <div className="git-confirm-warn">
              upstream has {behind} new commit{behind === 1 ? "" : "s"} — consider pulling first
            </div>
          )}
          {empty && hasUpstream !== false && (
            <div className="git-diff-empty">nothing to push</div>
          )}
          {outgoing && outgoing.length > 0 && (
            <div className="git-confirm-commits">
              <div className="git-confirm-commits-h">
                {outgoing.length} commit{outgoing.length === 1 ? "" : "s"} to push
              </div>
              {outgoing.map((c) => (
                <CommitRow key={c.sha} commit={c} />
              ))}
            </div>
          )}

          <div className="git-confirm-actions">
            <button className="git-btn" onClick={onClose} disabled={busy}>
              cancel
            </button>
            <button
              className="git-btn primary"
              onClick={() => void confirm()}
              disabled={busy || loading || (empty && hasUpstream !== false)}
            >
              {busy ? <SpinnerIcon /> : null}
              <span>{busy ? "pushing…" : "push"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
