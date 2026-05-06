import { useEffect, useState } from "react";
import {
  getGitApi,
  isLocalChangesPullConflict,
  isMergeConflictResult,
  type GitLogEntry,
  type GitPullStrategy,
} from "../../lib/git-api";
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
  onConflicts?: (info: string) => void;
}

type ResolveAction = "stash" | "discard" | null;

export function PullDialog({
  cwd,
  defaultStrategy,
  onSaveDefault,
  onClose,
  onComplete,
  onError,
  onConflicts,
}: Props) {
  const [strategy, setStrategy] = useState<GitPullStrategy>(defaultStrategy);
  const [remember, setRemember] = useState(false);
  const [incoming, setIncoming] = useState<GitLogEntry[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasUpstream, setHasUpstream] = useState<boolean | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [resolving, setResolving] = useState<ResolveAction>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const anyBusy = busy || resolving !== null;
  useEscapeKey(onClose, { enabled: !anyBusy });

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
      const msg = (e as Error).message;
      if (isLocalChangesPullConflict(msg)) {
        setConflict(msg);
        setBusy(false);
      } else if (isMergeConflictResult(msg) && onConflicts) {
        onConflicts(`pull (${strategy}) produced merge conflicts — resolve them`);
        onClose();
      } else {
        onError(msg);
        setBusy(false);
      }
    }
  };

  const resolveStash = async () => {
    const api = getGitApi();
    if (!api) return;
    setResolving("stash");
    let stashCreated = false;
    try {
      const stash = await api.stash(cwd, "mterminal: auto-stash before pull");
      stashCreated = stash.created;
      try {
        await api.pullStrategy(cwd, strategy);
      } catch (pullErr) {
        const msg = (pullErr as Error).message;
        if (isMergeConflictResult(msg) && onConflicts) {
          const note = stashCreated
            ? `pull (${strategy}) produced merge conflicts; stash preserved — resolve conflicts then run git stash pop`
            : `pull (${strategy}) produced merge conflicts — resolve them`;
          onConflicts(note);
          onClose();
          return;
        }
        throw pullErr;
      }
      if (remember) onSaveDefault(strategy);
      if (stashCreated) {
        const pop = await api.stashPop(cwd);
        if (pop.conflict) {
          if (onConflicts) {
            onConflicts(`pulled (${strategy}); stash pop produced conflicts — resolve them`);
            onClose();
            return;
          }
          onComplete(`pulled (${strategy}); stash kept due to pop conflict — resolve with git stash pop`);
        } else {
          onComplete(`pulled (${strategy}); local changes restored`);
        }
      } else {
        onComplete(`pulled (${strategy})`);
      }
      onClose();
    } catch (e) {
      onError((e as Error).message);
      setResolving(null);
    }
  };

  const resolveDiscard = async () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    const api = getGitApi();
    if (!api) return;
    setResolving("discard");
    try {
      await api.discardAll(cwd);
      await api.pullStrategy(cwd, strategy);
      if (remember) onSaveDefault(strategy);
      onComplete(`local changes discarded; pulled (${strategy})`);
      onClose();
    } catch (e) {
      onError((e as Error).message);
      setResolving(null);
      setConfirmDiscard(false);
    }
  };

  const loading = incoming === null && !fetchError;
  const empty = incoming !== null && incoming.length === 0;

  return (
    <div className="git-diff-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="git-diff-modal git-confirm-modal"
        role="dialog"
        aria-label={conflict ? "pull conflict" : "pull"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="git-diff-modal-h">
          <div className="git-diff-modal-title">
            <span className="git-diff-modal-badge staged">pull</span>
            <span className="git-diff-modal-path">
              {conflict ? "local changes block pull" : "incoming changes"}
            </span>
          </div>
          <div className="git-diff-modal-actions">
            <button
              type="button"
              className="winctl-btn"
              onClick={onClose}
              aria-label="close"
              title="close (Esc)"
              disabled={anyBusy}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="git-diff-modal-body git-confirm-body">
          {conflict ? (
            <ConflictResolver
              message={conflict}
              strategy={strategy}
              resolving={resolving}
              confirmDiscard={confirmDiscard}
              onStash={() => void resolveStash()}
              onDiscard={() => void resolveDiscard()}
              onCancelDiscard={() => setConfirmDiscard(false)}
              onCancel={onClose}
            />
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ResolverProps {
  message: string;
  strategy: GitPullStrategy;
  resolving: ResolveAction;
  confirmDiscard: boolean;
  onStash: () => void;
  onDiscard: () => void;
  onCancelDiscard: () => void;
  onCancel: () => void;
}

function ConflictResolver({
  message,
  strategy,
  resolving,
  confirmDiscard,
  onStash,
  onDiscard,
  onCancelDiscard,
  onCancel,
}: ResolverProps) {
  const busy = resolving !== null;
  return (
    <>
      <div className="git-confirm-warn">
        local changes would be overwritten by pull. choose how to proceed.
      </div>
      <pre className="git-conflict-output">{message}</pre>

      <div className="git-confirm-strategy">
        <div className="git-confirm-strategy-h">resolve</div>
        <div className="git-conflict-options">
          <button
            type="button"
            className="git-btn primary"
            onClick={onStash}
            disabled={busy}
            title="stash local changes, pull, then re-apply the stash"
          >
            {resolving === "stash" ? <SpinnerIcon /> : null}
            <span>
              {resolving === "stash" ? "stashing…" : `stash & pull (${strategy})`}
            </span>
          </button>

          {confirmDiscard ? (
            <div className="git-conflict-confirm-row">
              <button
                type="button"
                className="git-btn"
                onClick={onCancelDiscard}
                disabled={busy}
              >
                keep changes
              </button>
              <button
                type="button"
                className="git-btn danger"
                onClick={onDiscard}
                disabled={busy}
                title="permanently delete uncommitted changes and untracked files, then pull"
              >
                {resolving === "discard" ? <SpinnerIcon /> : null}
                <span>
                  {resolving === "discard" ? "discarding…" : "confirm: discard everything"}
                </span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="git-btn danger"
              onClick={onDiscard}
              disabled={busy}
              title="permanently delete uncommitted changes and untracked files, then pull"
            >
              <span>discard local changes & pull</span>
            </button>
          )}
        </div>
      </div>

      <div className="git-confirm-actions">
        <button className="git-btn" onClick={onCancel} disabled={busy}>
          cancel
        </button>
      </div>
    </>
  );
}
