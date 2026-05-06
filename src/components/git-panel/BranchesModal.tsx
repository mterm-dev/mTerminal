import { useEffect, useMemo, useState } from "react";
import { getGitApi, type GitBranch } from "../../lib/git-api";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import {
  CheckIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
} from "./icons";

interface Props {
  cwd: string;
  onClose: () => void;
  onChanged: (info?: string) => void;
  onError: (msg: string) => void;
}

type DraftMode =
  | { kind: "none" }
  | { kind: "create"; fromRef?: string }
  | { kind: "rename"; oldName: string };

export function BranchesModal({ cwd, onClose, onChanged, onError }: Props) {
  const [branches, setBranches] = useState<GitBranch[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftMode>({ kind: "none" });
  const [draftName, setDraftName] = useState("");

  useEscapeKey(onClose, { enabled: busy === null });

  const reload = async () => {
    const api = getGitApi();
    if (!api) {
      setLoadError("git api unavailable");
      return;
    }
    try {
      const list = await api.branches(cwd);
      setBranches(list);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  const { local, remote } = useMemo(() => {
    const all = branches ?? [];
    const f = filter.trim().toLowerCase();
    const filt = (b: GitBranch) =>
      !f || b.name.toLowerCase().includes(f) || b.lastCommitSubject.toLowerCase().includes(f);
    const local = all.filter((b) => !b.isRemote && filt(b));
    const remote = all.filter((b) => b.isRemote && filt(b));
    local.sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : a.name.localeCompare(b.name)));
    remote.sort((a, b) => a.name.localeCompare(b.name));
    return { local, remote };
  }, [branches, filter]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      await reload();
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const checkoutBranch = (b: GitBranch) =>
    run(`checkout-${b.name}`, async () => {
      const api = getGitApi();
      if (!api) throw new Error("git api unavailable");
      if (b.isRemote) {
        const localName = b.name.includes("/") ? b.name.split("/").slice(1).join("/") : b.name;
        const exists = (branches ?? []).some((x) => !x.isRemote && x.name === localName);
        if (exists) {
          await api.checkout(cwd, localName);
        } else {
          await api.checkout(cwd, b.name);
        }
      } else {
        await api.checkout(cwd, b.name);
      }
      onChanged(`switched to ${b.name}`);
      onClose();
    });

  const deleteBranch = (b: GitBranch, force: boolean) =>
    run(`delete-${b.name}`, async () => {
      const api = getGitApi();
      if (!api) throw new Error("git api unavailable");
      await api.branchDelete(cwd, b.name, force);
      onChanged(`deleted ${b.name}`);
    });

  const startRename = (b: GitBranch) => {
    setDraft({ kind: "rename", oldName: b.name });
    setDraftName(b.name);
  };

  const startCreate = (fromRef?: string) => {
    setDraft({ kind: "create", fromRef });
    setDraftName("");
  };

  const cancelDraft = () => {
    setDraft({ kind: "none" });
    setDraftName("");
  };

  const submitDraft = async () => {
    const name = draftName.trim();
    if (!name) return;
    if (draft.kind === "create") {
      await run(`create-${name}`, async () => {
        const api = getGitApi();
        if (!api) throw new Error("git api unavailable");
        await api.branchCreate(cwd, name, draft.fromRef, true);
        onChanged(`created ${name}`);
      });
      cancelDraft();
    } else if (draft.kind === "rename") {
      await run(`rename-${draft.oldName}`, async () => {
        const api = getGitApi();
        if (!api) throw new Error("git api unavailable");
        await api.branchRename(cwd, draft.oldName, name);
        onChanged(`renamed ${draft.oldName} → ${name}`);
      });
      cancelDraft();
    }
  };

  return (
    <div className="git-diff-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="git-diff-modal git-branches-modal"
        role="dialog"
        aria-label="branches"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="git-diff-modal-h">
          <div className="git-diff-modal-title">
            <span className="git-diff-modal-badge staged">branches</span>
          </div>
          <div className="git-diff-modal-actions">
            <input
              type="text"
              className="git-branches-search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter…"
              spellCheck={false}
              autoFocus
            />
            <button
              className="git-btn"
              onClick={() => startCreate()}
              disabled={busy !== null}
              title="new branch from HEAD"
            >
              <PlusIcon />
              <span>new</span>
            </button>
            <button
              type="button"
              className="winctl-btn"
              onClick={onClose}
              aria-label="close"
              disabled={busy !== null}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div className="git-diff-modal-body git-branches-body">
          {loadError && <div className="git-diff-error">{loadError}</div>}
          {!branches && !loadError && <div className="git-diff-loading">loading…</div>}

          {draft.kind !== "none" && (
            <div className="git-branch-draft">
              <span className="git-branch-draft-label">
                {draft.kind === "create"
                  ? draft.fromRef
                    ? `new branch from ${draft.fromRef}`
                    : "new branch from HEAD"
                  : `rename ${draft.oldName} →`}
              </span>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="branch name"
                spellCheck={false}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitDraft();
                  if (e.key === "Escape") cancelDraft();
                }}
              />
              <button className="git-btn primary" onClick={() => void submitDraft()}>
                <CheckIcon />
              </button>
              <button className="git-btn" onClick={cancelDraft}>
                cancel
              </button>
            </div>
          )}

          {branches && (
            <>
              <div className="git-branch-section-h">local ({local.length})</div>
              {local.length === 0 && (
                <div className="git-branch-empty">no local branches match</div>
              )}
              {local.map((b) => (
                <BranchRow
                  key={b.name}
                  branch={b}
                  busy={busy}
                  onCheckout={() => void checkoutBranch(b)}
                  onCreateFrom={() => startCreate(b.name)}
                  onRename={() => startRename(b)}
                  onDelete={() => void deleteBranch(b, false)}
                  onForceDelete={() => void deleteBranch(b, true)}
                />
              ))}

              <div className="git-branch-section-h">remote ({remote.length})</div>
              {remote.length === 0 && (
                <div className="git-branch-empty">no remote branches match</div>
              )}
              {remote.map((b) => (
                <BranchRow
                  key={b.name}
                  branch={b}
                  busy={busy}
                  onCheckout={() => void checkoutBranch(b)}
                  onCreateFrom={() => startCreate(b.name)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  branch: GitBranch;
  busy: string | null;
  onCheckout: () => void;
  onCreateFrom: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onForceDelete?: () => void;
}

function BranchRow({
  branch,
  busy,
  onCheckout,
  onCreateFrom,
  onRename,
  onDelete,
  onForceDelete,
}: RowProps) {
  const isBusy = busy?.endsWith(branch.name) ?? false;
  return (
    <div
      className={`git-branch-row ${branch.isCurrent ? "current" : ""} ${isBusy ? "busy" : ""}`}
      onDoubleClick={() => {
        if (busy === null && !branch.isCurrent) onCheckout();
      }}
    >
      <span className="git-branch-marker" aria-hidden="true">
        {branch.isCurrent ? "●" : "○"}
      </span>
      <button
        className="git-branch-name"
        onClick={onCheckout}
        disabled={busy !== null || branch.isCurrent}
        title={branch.isCurrent ? "current branch" : "checkout (or double-click row)"}
      >
        {branch.name}
      </button>
      {!branch.isRemote && branch.upstream && (
        <span className="git-branch-upstream" title={`upstream: ${branch.upstream}`}>
          ↳ {branch.upstream}
        </span>
      )}
      {(branch.ahead > 0 || branch.behind > 0) && (
        <span className="git-branch-track">
          {branch.ahead > 0 && (
            <span className="ahead" title={`${branch.ahead} ahead`}>
              ↑{branch.ahead}
            </span>
          )}
          {branch.behind > 0 && (
            <span className="behind" title={`${branch.behind} behind`}>
              ↓{branch.behind}
            </span>
          )}
        </span>
      )}
      <span className="git-branch-subject" title={branch.lastCommitSubject}>
        {branch.lastCommitSubject}
      </span>
      <span className="git-branch-actions">
        {isBusy && <SpinnerIcon />}
        <button
          className="ghost-btn git-icon-btn"
          onClick={onCreateFrom}
          disabled={busy !== null}
          title="new branch from this"
          aria-label={`new branch from ${branch.name}`}
        >
          <PlusIcon />
        </button>
        {onRename && (
          <button
            className="ghost-btn git-icon-btn"
            onClick={onRename}
            disabled={busy !== null || branch.isCurrent}
            title={branch.isCurrent ? "cannot rename current branch" : "rename"}
            aria-label={`rename ${branch.name}`}
          >
            <PencilIcon />
          </button>
        )}
        {onDelete && (
          <button
            className="ghost-btn git-icon-btn danger"
            onClick={(e) => (e.shiftKey ? onForceDelete?.() : onDelete())}
            disabled={busy !== null || branch.isCurrent}
            title={
              branch.isCurrent
                ? "cannot delete current branch"
                : "delete (shift+click to force)"
            }
            aria-label={`delete ${branch.name}`}
          >
            <TrashIcon />
          </button>
        )}
      </span>
    </div>
  );
}
