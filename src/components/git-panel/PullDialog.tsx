import { useEffect, useState } from "react";
import { getGitApi, type GitLogEntry, type GitPullStrategy } from "../../lib/git-api";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { CommitRow } from "./CommitRow";
import { Checkbox } from "./Checkbox";
import { CloseIcon, SpinnerIcon } from "./icons";

interface Props {
  cwd: string;
  defaultStrategy: GitPullStrategy;
  onSaveDefault: (s: GitPullStrategy) => void;
  onClose: () => void;
  onComplete: (info: string) => void;
  onError: (msg: string) => void;
}

export function PullDialog({
  cwd,
  defaultStrategy,
  onSaveDefault,
  onClose,
  onComplete,
  onError,
}: Props) {
  const [strategy, setStrategy] = useState<GitPullStrategy>(defaultStrategy);
  const [remember, setRemember] = useState(false);
  const [incoming, setIncoming] = useState<GitLogEntry[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasUpstream, setHasUpstream] = useState<boolean | null>(null);

  useEscapeKey(onClose, { enabled: !busy });

  useEffect(() => {
    let active = true;
    const api = getGitApi();
    if (!api) {
      setFetchError("git api unavailable");
      return;
    }
    setIncoming(null);
    setFetchError(null);
    (async () => {
      try {
        await api.fetch(cwd);
        if (!active) return;
        const list = await api.incoming(cwd);
        if (!active) return;
        setIncoming(list);
        const status = await api.status(cwd);
        if (!active) return;
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
      await api.pullStrategy(cwd, strategy);
      if (remember) onSaveDefault(strategy);
      onComplete(`pulled (${strategy})`);
      onClose();
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  };

  const loading = incoming === null && !fetchError;
  const empty = incoming !== null && incoming.length === 0;

  return (
    <div className="git-diff-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="git-diff-modal git-confirm-modal"
        role="dialog"
        aria-label="pull"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="git-diff-modal-h">
          <div className="git-diff-modal-title">
            <span className="git-diff-modal-badge staged">pull</span>
            <span className="git-diff-modal-path">incoming changes</span>
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
          {loading && <div className="git-diff-loading">fetching…</div>}
          {hasUpstream === false && (
            <div className="git-confirm-note">no upstream configured for current branch</div>
          )}
          {empty && hasUpstream !== false && (
            <div className="git-diff-empty">already up to date</div>
          )}
          {incoming && incoming.length > 0 && (
            <div className="git-confirm-commits">
              <div className="git-confirm-commits-h">
                {incoming.length} commit{incoming.length === 1 ? "" : "s"} to pull
              </div>
              {incoming.map((c) => (
                <CommitRow key={c.sha} commit={c} />
              ))}
            </div>
          )}

          <div className="git-confirm-strategy">
            <div className="git-confirm-strategy-h">strategy</div>
            <div className="seg-control">
              {(["ff-only", "merge", "rebase"] as const).map((s) => (
                <button
                  key={s}
                  className={strategy === s ? "active" : ""}
                  onClick={() => setStrategy(s)}
                  disabled={busy}
                >
                  {s}
                </button>
              ))}
            </div>
            <div
              className="git-confirm-remember"
              onClick={() => !busy && setRemember(!remember)}
              role="presentation"
            >
              <Checkbox
                state={remember ? "checked" : "unchecked"}
                onChange={() => setRemember(!remember)}
                disabled={busy}
                ariaLabel="remember as default"
              />
              <span>remember as default</span>
            </div>
          </div>

          <div className="git-confirm-actions">
            <button className="git-btn" onClick={onClose} disabled={busy}>
              cancel
            </button>
            <button
              className="git-btn primary"
              onClick={() => void confirm()}
              disabled={busy || loading || (incoming !== null && incoming.length === 0 && hasUpstream !== false)}
            >
              {busy ? <SpinnerIcon /> : null}
              <span>{busy ? "pulling…" : `pull (${strategy})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
