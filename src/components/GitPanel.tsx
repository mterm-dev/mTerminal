import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGitStatus, type GitFile } from "../hooks/useGitStatus";
import { GitDiffModal } from "./GitDiffModal";
import { useAI } from "../hooks/useAI";
import type { Settings } from "../settings/useSettings";
import {
  buildTree,
  collectDirPaths,
  collectFilePaths,
  compactTree,
  dirCheckState,
  type CheckState,
  type TreeNode,
} from "../lib/git-tree";

interface Props {
  cwd: string | undefined;
  collapsed: boolean;
  onToggleCollapsed: (b: boolean) => void;
  treeView: boolean;
  onToggleTreeView: (b: boolean) => void;
  settings: Settings;
}

interface DiffTarget {
  path: string;
  staged: boolean;
  status: { indexStatus: string; worktreeStatus: string; untracked: boolean };
}

function fileBadge(f: GitFile): { letter: string; cls: string; title: string } {
  if (f.untracked) return { letter: "?", cls: "untracked", title: "untracked" };
  const idx = f.indexStatus;
  const wt = f.worktreeStatus;
  const code = idx !== "." ? idx : wt;
  switch (code) {
    case "A": return { letter: "A", cls: "added", title: "added" };
    case "M": return { letter: "M", cls: "modified", title: "modified" };
    case "D": return { letter: "D", cls: "deleted", title: "deleted" };
    case "R": return { letter: "R", cls: "modified", title: "renamed" };
    case "C": return { letter: "C", cls: "modified", title: "copied" };
    case "T": return { letter: "T", cls: "modified", title: "type changed" };
    case "U": return { letter: "U", cls: "deleted", title: "unmerged" };
    default: return { letter: code || "·", cls: "modified", title: "changed" };
  }
}

interface CheckboxProps {
  state: CheckState;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
  onClick?: (e: React.MouseEvent) => void;
}

function Checkbox({ state, onChange, disabled, ariaLabel, onClick }: CheckboxProps) {
  return (
    <span
      className={`git-checkbox ${state}`}
      data-state={state}
      role="checkbox"
      aria-checked={state === "indeterminate" ? "mixed" : state === "checked"}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={(e) => {
        if (disabled) return;
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.stopPropagation();
        onChange();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange();
        }
      }}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        {state === "checked" && (
          <path
            d="M2.5 6.2 L4.8 8.5 L9.5 3.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {state === "indeterminate" && (
          <path
            d="M3 6 H9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}

function ChevronToggle({ collapsed }: { collapsed: boolean }) {
  return (
    <span className={`git-chevron ${collapsed ? "collapsed" : ""}`} aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path
          d="M2.5 3.5 L5 6 L7.5 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function GitPanel({
  cwd,
  collapsed,
  onToggleCollapsed,
  treeView,
  onToggleTreeView,
  settings,
}: Props) {
  const enabled = !!cwd;
  const { status, error, refresh, runMutation, api } = useGitStatus(cwd, enabled);
  const ai = useAI();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [diffOpen, setDiffOpen] = useState<DiffTarget | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiCancelRef = useRef<(() => Promise<void>) | null>(null);

  const files = status?.files ?? [];

  useEffect(() => {
    setChecked((prev) => {
      const next = new Set<string>();
      const present = new Set(files.map((f) => f.path));
      for (const p of prev) if (present.has(p)) next.add(p);
      for (const f of files) {
        if (f.staged && !prev.has(f.path) && !next.has(f.path)) next.add(f.path);
      }
      return next;
    });
  }, [files]);

  const tree = useMemo(() => compactTree(buildTree(files)), [files]);
  const allDirPaths = useMemo(() => collectDirPaths(tree), [tree]);

  const checkedPaths = useMemo(
    () => files.filter((f) => checked.has(f.path)).map((f) => f.path),
    [files, checked],
  );

  const setPathsChecked = (paths: string[], shouldCheck: boolean) => {
    setChecked((prev) => {
      const n = new Set(prev);
      for (const p of paths) {
        if (shouldCheck) n.add(p);
        else n.delete(p);
      }
      return n;
    });
  };

  const toggleFile = async (f: GitFile) => {
    const isChecked = checked.has(f.path);
    setPathsChecked([f.path], !isChecked);
    try {
      await runMutation((api) =>
        isChecked ? api.unstage(cwd!, [f.path]) : api.stage(cwd!, [f.path]),
      );
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const toggleDir = async (node: TreeNode) => {
    const paths = collectFilePaths(node);
    if (paths.length === 0) return;
    const state = dirCheckState(node, checked);
    const shouldCheck = state !== "checked";
    setPathsChecked(paths, shouldCheck);
    try {
      await runMutation((api) =>
        shouldCheck ? api.stage(cwd!, paths) : api.unstage(cwd!, paths),
      );
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const allFilePaths = useMemo(() => files.map((f) => f.path), [files]);

  const selectAllState: CheckState = useMemo(() => {
    if (allFilePaths.length === 0) return "unchecked";
    let n = 0;
    for (const p of allFilePaths) if (checked.has(p)) n++;
    if (n === 0) return "unchecked";
    if (n === allFilePaths.length) return "checked";
    return "indeterminate";
  }, [allFilePaths, checked]);

  const toggleAll = async () => {
    if (allFilePaths.length === 0) return;
    const shouldCheck = selectAllState !== "checked";
    setPathsChecked(allFilePaths, shouldCheck);
    try {
      await runMutation((api) =>
        shouldCheck
          ? api.stage(cwd!, allFilePaths)
          : api.unstage(cwd!, allFilePaths),
      );
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const toggleDirCollapse = (path: string) => {
    setCollapsedDirs((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  };

  const expandAll = () => setCollapsedDirs(new Set());
  const collapseAll = () => setCollapsedDirs(new Set(allDirPaths));

  const runAction = async (
    name: string,
    fn: () => Promise<void>,
  ): Promise<boolean> => {
    setBusyAction(name);
    setActionError(null);
    setActionInfo(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setActionError((e as Error).message);
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const doCommit = async (alsoPush: boolean) => {
    if (!cwd) return;
    if (!message.trim()) return;
    if (checkedPaths.length === 0) return;
    const ok = await runAction(alsoPush ? "commit-push" : "commit", async () => {
      await runMutation(async (api) => {
        const toStage = files
          .filter((f) => checked.has(f.path) && !f.staged)
          .map((f) => f.path);
        if (toStage.length > 0) await api.stage(cwd, toStage);
        await api.commit(cwd, message, checkedPaths);
      });
      setMessage("");
      setActionInfo("commit created");
    });
    if (ok && alsoPush) {
      await runAction("push", async () => {
        try {
          await runMutation((api) => api.push(cwd, false).then(() => undefined));
          setActionInfo("pushed");
        } catch (e) {
          const msg = (e as Error).message;
          if (/no upstream|set-upstream|has no upstream/i.test(msg)) {
            await runMutation((api) => api.push(cwd, true).then(() => undefined));
            setActionInfo("pushed (set upstream)");
          } else {
            throw e;
          }
        }
      });
    }
  };

  const doFetch = () =>
    runAction("fetch", async () => {
      await runMutation((api) => api.fetch(cwd!).then(() => undefined));
      setActionInfo("fetched");
    });

  const doPull = () =>
    runAction("pull", async () => {
      await runMutation((api) => api.pull(cwd!).then(() => undefined));
      setActionInfo("pulled");
    });

  const generateCommitMessage = async () => {
    if (aiBusy) {
      try {
        await aiCancelRef.current?.();
      } finally {
        aiCancelRef.current = null;
        setAiBusy(false);
      }
      return;
    }
    if (!cwd || !api) return;
    setAiError(null);
    const paths =
      checkedPaths.length > 0 ? checkedPaths : files.map((f) => f.path);
    if (paths.length === 0) {
      setAiError("nothing to summarize");
      return;
    }

    const provider = settings.gitCommitProvider;
    const model =
      provider === "anthropic"
        ? settings.gitCommitAnthropicModel
        : provider === "openai"
          ? settings.gitCommitOpenaiModel
          : settings.gitCommitOllamaModel;
    if (!model.trim()) {
      setAiError("pick a model in settings → git panel");
      return;
    }
    const baseUrl =
      provider === "openai"
        ? settings.gitCommitOpenaiBaseUrl
        : provider === "ollama"
          ? settings.gitCommitOllamaBaseUrl
          : undefined;

    const MAX = 30_000;
    let payload = "";
    let truncated = false;
    for (const p of paths) {
      const f = files.find((x) => x.path === p);
      const useStaged = f ? f.staged && !f.unstaged : true;
      try {
        const { text } = await api.diff(cwd, p, useStaged);
        const chunk = `--- ${p} ---\n${text}\n`;
        if (payload.length + chunk.length > MAX) {
          truncated = true;
          break;
        }
        payload += chunk;
      } catch {
        // skip unreadable file
      }
    }
    if (!payload) {
      setAiError("no diff to summarize");
      return;
    }
    if (truncated) payload += "\n[diff truncated]\n";

    setAiBusy(true);
    setMessage("");
    try {
      const handle = await ai.complete({
        provider,
        model,
        baseUrl,
        system: settings.gitCommitSystemPrompt,
        messages: [
          {
            role: "user",
            content: `Generate a commit message for the following staged changes:\n\n${payload}`,
          },
        ],
        maxTokens: 500,
        temperature: 0.2,
        onDelta: (d) => setMessage((prev) => prev + d),
        onDone: () => {
          aiCancelRef.current = null;
          setAiBusy(false);
        },
        onError: (e) => {
          aiCancelRef.current = null;
          setAiBusy(false);
          setAiError(e);
        },
      });
      aiCancelRef.current = handle.cancel;
    } catch (e) {
      setAiBusy(false);
      setAiError((e as Error).message);
    }
  };

  if (!cwd) {
    return (
      <div className="term-side-git">
        <div
          className="term-side-git-h"
          onClick={() => onToggleCollapsed(!collapsed)}
          role="button"
          aria-expanded={!collapsed}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onToggleCollapsed(!collapsed);
          }}
        >
          <ChevronToggle collapsed={collapsed} />
          <span className="git-title">git</span>
          <span className="git-empty-note">no terminal</span>
        </div>
      </div>
    );
  }

  const branchLabel = status?.branch ?? "(detached)";
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const isRepo = status?.isRepo ?? null;
  const showBody = !collapsed && isRepo;

  return (
    <div className="term-side-git">
      <div
        className="term-side-git-h"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest(".git-h-actions")) return;
          onToggleCollapsed(!collapsed);
        }}
        role="button"
        aria-expanded={!collapsed}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleCollapsed(!collapsed);
          }
        }}
      >
        <ChevronToggle collapsed={collapsed} />
        <span className="git-title">git</span>
        {isRepo === false ? (
          <span className="git-empty-note">not a repo</span>
        ) : (
          <>
            <span className="branch" title={status?.upstream ?? undefined}>
              {branchLabel}
            </span>
            {ahead > 0 && <span className="ahead" title="ahead">↑{ahead}</span>}
            {behind > 0 && <span className="behind" title="behind">↓{behind}</span>}
            {files.length > 0 && (
              <span className="git-count" title={`${files.length} changed`}>
                {files.length}
              </span>
            )}
          </>
        )}
        <div className="git-h-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="ghost-btn small"
            title="refresh"
            onClick={() => void refresh()}
            disabled={busyAction !== null}
          >
            ⟲
          </button>
        </div>
      </div>

      {showBody && (
        <div className="term-side-git-body">
          <div className="term-side-git-toolbar" role="toolbar">
            <button
              className={`ghost-btn small ${treeView ? "active" : ""}`}
              title={treeView ? "switch to flat list" : "switch to directory tree"}
              onClick={() => onToggleTreeView(!treeView)}
              disabled={busyAction !== null}
            >
              {treeView ? "tree" : "list"}
            </button>
            {treeView && (
              <>
                <button
                  className="ghost-btn small"
                  title="expand all directories"
                  onClick={expandAll}
                  disabled={busyAction !== null || allDirPaths.length === 0}
                >
                  expand
                </button>
                <button
                  className="ghost-btn small"
                  title="collapse all directories"
                  onClick={collapseAll}
                  disabled={busyAction !== null || allDirPaths.length === 0}
                >
                  collapse
                </button>
              </>
            )}
            <span className="toolbar-sep" />
            <button
              className="ghost-btn small"
              title="git fetch"
              onClick={() => void doFetch()}
              disabled={busyAction !== null}
            >
              fetch
            </button>
            <button
              className="ghost-btn small"
              title="git pull --ff-only"
              onClick={() => void doPull()}
              disabled={busyAction !== null}
            >
              pull
            </button>
          </div>

          {files.length === 0 ? (
            <div className="git-empty-state">working tree clean</div>
          ) : (
            <div
              className="term-side-git-selectall"
              onClick={() => void toggleAll()}
              role="presentation"
            >
              <Checkbox
                state={selectAllState}
                onChange={() => void toggleAll()}
                disabled={busyAction !== null}
                ariaLabel={
                  selectAllState === "checked"
                    ? "deselect all files"
                    : "select all files"
                }
              />
              <span className="term-side-git-selectall-label">
                {selectAllState === "checked"
                  ? `all ${files.length} selected`
                  : selectAllState === "indeterminate"
                    ? `${checkedPaths.length} of ${files.length} selected`
                    : `select all (${files.length})`}
              </span>
            </div>
          )}

          {files.length > 0 && (
            <div className="term-side-git-files" role="list">
              {treeView
                ? renderTree(tree, 0, true, {
                    checked,
                    collapsedDirs,
                    busy: busyAction !== null,
                    onToggleFile: toggleFile,
                    onToggleDir: toggleDir,
                    onToggleDirCollapse: toggleDirCollapse,
                    onOpenDiff: (f) =>
                      setDiffOpen({
                        path: f.path,
                        staged: f.staged && !f.unstaged,
                        status: {
                          indexStatus: f.indexStatus,
                          worktreeStatus: f.worktreeStatus,
                          untracked: f.untracked,
                        },
                      }),
                  })
                : files.map((f) => (
                    <FileRow
                      key={f.path}
                      file={f}
                      depth={0}
                      checked={checked.has(f.path)}
                      busy={busyAction !== null}
                      onToggle={() => void toggleFile(f)}
                      onOpenDiff={() =>
                        setDiffOpen({
                          path: f.path,
                          staged: f.staged && !f.unstaged,
                          status: {
                            indexStatus: f.indexStatus,
                            worktreeStatus: f.worktreeStatus,
                            untracked: f.untracked,
                          },
                        })
                      }
                    />
                  ))}
            </div>
          )}

          <div className="term-side-git-msg">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="commit message…"
              rows={3}
              spellCheck={false}
            />
            <button
              type="button"
              className={`git-msg-ai-btn ${aiBusy ? "busy" : ""}`}
              title={
                aiBusy
                  ? "cancel"
                  : "generate commit message with ai"
              }
              aria-label={
                aiBusy ? "cancel ai generation" : "generate commit message with ai"
              }
              onClick={() => void generateCommitMessage()}
              disabled={!cwd || busyAction !== null}
            >
              {aiBusy ? "✕" : "✨"}
            </button>
          </div>
          {aiError && (
            <div className="git-msg-ai-err" onClick={() => setAiError(null)}>
              {aiError}
            </div>
          )}

          <div className="term-side-git-actions">
            <button
              className="git-btn primary"
              disabled={
                busyAction !== null ||
                checkedPaths.length === 0 ||
                !message.trim()
              }
              onClick={() => void doCommit(false)}
              title="commit selected files"
            >
              {busyAction === "commit" ? "committing…" : "commit"}
            </button>
            <button
              className="git-btn"
              disabled={
                busyAction !== null ||
                checkedPaths.length === 0 ||
                !message.trim()
              }
              onClick={() => void doCommit(true)}
              title="commit + push"
            >
              {busyAction === "commit-push" || busyAction === "push"
                ? "pushing…"
                : "commit & push"}
            </button>
          </div>

          {(actionError || error) && (
            <div className="git-error" onClick={() => setActionError(null)}>
              {actionError ?? error}
            </div>
          )}
          {actionInfo && !actionError && (
            <div className="git-info" onClick={() => setActionInfo(null)}>
              {actionInfo}
            </div>
          )}
        </div>
      )}

      {diffOpen && cwd && (
        <GitDiffModal
          cwd={cwd}
          path={diffOpen.path}
          staged={diffOpen.staged}
          status={diffOpen.status}
          onClose={() => setDiffOpen(null)}
        />
      )}
    </div>
  );
}

interface RenderCtx {
  checked: Set<string>;
  collapsedDirs: Set<string>;
  busy: boolean;
  onToggleFile: (f: GitFile) => void;
  onToggleDir: (n: TreeNode) => void;
  onToggleDirCollapse: (path: string) => void;
  onOpenDiff: (f: GitFile) => void;
}

function renderTree(
  node: TreeNode,
  depth: number,
  isRoot: boolean,
  ctx: RenderCtx,
): ReactNode {
  if (isRoot) {
    return node.children.map((c) => (
      <Fragment key={c.fullPath}>{renderTree(c, 0, false, ctx)}</Fragment>
    ));
  }
  if (node.isDir) {
    const isCollapsed = ctx.collapsedDirs.has(node.fullPath);
    const state = dirCheckState(node, ctx.checked);
    const fileCount = collectFilePaths(node).length;
    return (
      <Fragment>
        <div
          className="git-tree-row dir"
          style={{ paddingLeft: depth * 14 + 4 }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest(".git-checkbox")) return;
            ctx.onToggleDirCollapse(node.fullPath);
          }}
          role="treeitem"
          aria-expanded={!isCollapsed}
        >
          <ChevronToggle collapsed={isCollapsed} />
          <Checkbox
            state={state}
            onChange={() => ctx.onToggleDir(node)}
            disabled={ctx.busy}
            ariaLabel={`stage ${node.fullPath}`}
          />
          <FolderIcon open={!isCollapsed} />
          <span className="git-tree-dir-name" title={node.fullPath}>
            {node.name}
          </span>
          <span className="git-tree-dir-count">{fileCount}</span>
        </div>
        {!isCollapsed &&
          node.children.map((c) => (
            <Fragment key={c.fullPath}>{renderTree(c, depth + 1, false, ctx)}</Fragment>
          ))}
      </Fragment>
    );
  }
  const f = node.file!;
  return (
    <FileRow
      file={f}
      depth={depth}
      checked={ctx.checked.has(f.path)}
      busy={ctx.busy}
      onToggle={() => ctx.onToggleFile(f)}
      onOpenDiff={() => ctx.onOpenDiff(f)}
      displayName={node.name}
      withChevronSpacer
    />
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <span className="git-folder-icon" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 16 16">
        {open ? (
          <path
            d="M2 4 V12 H14 L15 6 H4 L3 4 Z"
            fill="currentColor"
            opacity="0.85"
          />
        ) : (
          <path
            d="M2 4 V12 H14 V5 H8 L7 4 Z"
            fill="currentColor"
            opacity="0.85"
          />
        )}
      </svg>
    </span>
  );
}

interface FileRowProps {
  file: GitFile;
  depth: number;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onOpenDiff: () => void;
  displayName?: string;
  withChevronSpacer?: boolean;
}

function FileRow({
  file,
  depth,
  checked,
  busy,
  onToggle,
  onOpenDiff,
  displayName,
  withChevronSpacer,
}: FileRowProps) {
  const badge = fileBadge(file);
  return (
    <div
      className="git-tree-row file"
      style={{ paddingLeft: depth * 14 + 4 }}
      role="listitem"
      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
    >
      {withChevronSpacer && <span className="git-chevron-spacer" aria-hidden="true" />}
      <Checkbox
        state={checked ? "checked" : "unchecked"}
        onChange={onToggle}
        disabled={busy}
        ariaLabel={`stage ${file.path}`}
      />
      <span className={`badge ${badge.cls}`} title={badge.title} aria-label={badge.title}>
        {badge.letter}
      </span>
      <span className="git-file-path" onClick={onOpenDiff}>
        {displayName ?? file.path}
      </span>
    </div>
  );
}
