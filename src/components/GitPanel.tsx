import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
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
import { Checkbox } from "./git-panel/Checkbox";
import { FileRow, renderTree } from "./git-panel/FileTree";
import {
  BranchIcon,
  ChevronToggle,
  ChevronsDownIcon,
  ChevronsUpIcon,
  CloseIcon,
  CommitIcon,
  CommitPushIcon,
  FetchIcon,
  HistoryIcon,
  ListIcon,
  PullIcon,
  PushIcon,
  RefreshIcon,
  SparklesIcon,
  SpinnerIcon,
  TreeIcon,
} from "./git-panel/icons";
import { BranchesModal } from "./git-panel/BranchesModal";
import { HistoryModal } from "./git-panel/HistoryModal";
import { PullDialog } from "./git-panel/PullDialog";
import { PushDialog } from "./git-panel/PushDialog";

interface Props {
  cwd: string | undefined;
  collapsed: boolean;
  onToggleCollapsed: (b: boolean) => void;
  treeView: boolean;
  onToggleTreeView: (b: boolean) => void;
  settings: Settings;
  height: number;
  onResizeHeight: (h: number) => void;
  onUpdatePullStrategy?: (s: "ff-only" | "merge" | "rebase") => void;
  onEnsureVaultUnlocked?: (after: () => void) => boolean;
}

interface DiffTarget {
  path: string;
  staged: boolean;
  status: { indexStatus: string; worktreeStatus: string; untracked: boolean };
}


export function GitPanel({
  cwd,
  collapsed,
  onToggleCollapsed,
  treeView,
  onToggleTreeView,
  settings,
  height,
  onResizeHeight,
  onUpdatePullStrategy,
  onEnsureVaultUnlocked,
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
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const aiCancelRef = useRef<(() => Promise<void>) | null>(null);

  const files = status?.files ?? [];

  useEffect(() => {
    if (!actionInfo) return;
    const t = setTimeout(() => setActionInfo(null), 3000);
    return () => clearTimeout(t);
  }, [actionInfo]);

  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 6000);
    return () => clearTimeout(t);
  }, [actionError]);

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

  const doPull = () => {
    if (!cwd) return;
    setActionError(null);
    setActionInfo(null);
    setPullOpen(true);
  };

  const doPush = () => {
    if (!cwd) return;
    setActionError(null);
    setActionInfo(null);
    setPushOpen(true);
  };

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
    if (
      (provider === "anthropic" || provider === "openai") &&
      onEnsureVaultUnlocked &&
      !onEnsureVaultUnlocked(() => void generateCommitMessage())
    ) {
      return;
    }
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
          if (
            /vault.*locked/i.test(e) &&
            onEnsureVaultUnlocked &&
            !onEnsureVaultUnlocked(() => void generateCommitMessage())
          ) {
            return;
          }
          setAiError(e);
        },
      });
      aiCancelRef.current = handle.cancel;
    } catch (e) {
      setAiBusy(false);
      const msg = (e as Error).message;
      if (
        /vault.*locked/i.test(msg) &&
        onEnsureVaultUnlocked &&
        !onEnsureVaultUnlocked(() => void generateCommitMessage())
      ) {
        return;
      }
      setAiError(msg);
    }
  };

  const onResizeHeightStart = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const max = Math.max(160, Math.floor(window.innerHeight * 0.85));
      const next = Math.max(120, Math.min(max, startH + (startY - ev.clientY)));
      onResizeHeight(next);
    };
    const up = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {}
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing-git-panel");
    };
    document.body.classList.add("resizing-git-panel");
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const showResize = !collapsed;
  const panelStyle = !collapsed ? { height } : undefined;

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
    <div className="term-side-git" style={panelStyle}>
      {showResize && (
        <div
          className="term-side-git-resize"
          role="separator"
          aria-label="resize git panel"
          aria-orientation="horizontal"
          onPointerDown={onResizeHeightStart}
          onDoubleClick={() => onResizeHeight(340)}
          title="drag to resize · double-click to reset"
        />
      )}
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
            <button
              className="branch branch-clickable"
              title={status?.upstream ?? "click to manage branches"}
              onClick={(e) => {
                e.stopPropagation();
                setBranchesOpen(true);
              }}
            >
              {branchLabel}
            </button>
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
            className="ghost-btn git-icon-btn"
            title="refresh"
            aria-label="refresh"
            onClick={() => void refresh()}
            disabled={busyAction !== null}
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      {showBody && (
        <div className="term-side-git-body">
          <div className="term-side-git-toolbar" role="toolbar">
            <button
              className={`ghost-btn git-icon-btn ${treeView ? "active" : ""}`}
              title={treeView ? "switch to flat list" : "switch to directory tree"}
              aria-label={treeView ? "switch to flat list" : "switch to directory tree"}
              onClick={() => onToggleTreeView(!treeView)}
              disabled={busyAction !== null}
            >
              {treeView ? <TreeIcon /> : <ListIcon />}
            </button>
            {treeView && (
              <>
                <button
                  className="ghost-btn git-icon-btn"
                  title="expand all directories"
                  aria-label="expand all directories"
                  onClick={expandAll}
                  disabled={busyAction !== null || allDirPaths.length === 0}
                >
                  <ChevronsDownIcon />
                </button>
                <button
                  className="ghost-btn git-icon-btn"
                  title="collapse all directories"
                  aria-label="collapse all directories"
                  onClick={collapseAll}
                  disabled={busyAction !== null || allDirPaths.length === 0}
                >
                  <ChevronsUpIcon />
                </button>
              </>
            )}
            <span className="toolbar-sep" />
            <button
              className="ghost-btn git-icon-btn"
              title="branches"
              aria-label="branches"
              onClick={() => setBranchesOpen(true)}
              disabled={busyAction !== null}
            >
              <BranchIcon />
            </button>
            <button
              className="ghost-btn git-icon-btn"
              title="history"
              aria-label="history"
              onClick={() => setHistoryOpen(true)}
              disabled={busyAction !== null}
            >
              <HistoryIcon />
            </button>
            <span className="toolbar-sep" />
            <button
              className="ghost-btn git-icon-btn"
              title="git fetch"
              aria-label="git fetch"
              onClick={() => void doFetch()}
              disabled={busyAction !== null}
            >
              {busyAction === "fetch" ? <SpinnerIcon /> : <FetchIcon />}
            </button>
            <button
              className="ghost-btn git-icon-btn"
              title="git pull --ff-only"
              aria-label="git pull"
              onClick={() => void doPull()}
              disabled={busyAction !== null}
            >
              {busyAction === "pull" ? <SpinnerIcon /> : <PullIcon />}
            </button>
            <button
              className="ghost-btn git-icon-btn"
              title="git push"
              aria-label="git push"
              onClick={() => void doPush()}
              disabled={busyAction !== null}
            >
              {busyAction === "push" ? <SpinnerIcon /> : <PushIcon />}
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
              {aiBusy ? <CloseIcon /> : <SparklesIcon />}
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
              {busyAction === "commit" ? <SpinnerIcon /> : <CommitIcon />}
              <span>{busyAction === "commit" ? "committing…" : "commit"}</span>
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
              {busyAction === "commit-push" || busyAction === "push" ? (
                <SpinnerIcon />
              ) : (
                <CommitPushIcon />
              )}
              <span>
                {busyAction === "commit-push" || busyAction === "push"
                  ? "pushing…"
                  : "commit & push"}
              </span>
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

      {branchesOpen && cwd && (
        <BranchesModal
          cwd={cwd}
          onClose={() => setBranchesOpen(false)}
          onChanged={(info) => {
            if (info) setActionInfo(info);
            void refresh();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {historyOpen && cwd && (
        <HistoryModal cwd={cwd} onClose={() => setHistoryOpen(false)} />
      )}

      {pullOpen && cwd && (
        <PullDialog
          cwd={cwd}
          defaultStrategy={settings.gitPullStrategy}
          onSaveDefault={(s) => onUpdatePullStrategy?.(s)}
          onClose={() => setPullOpen(false)}
          onComplete={(info) => {
            setActionInfo(info);
            void refresh();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}

      {pushOpen && cwd && (
        <PushDialog
          cwd={cwd}
          onClose={() => setPushOpen(false)}
          onComplete={(info) => {
            setActionInfo(info);
            void refresh();
          }}
          onError={(msg) => setActionError(msg)}
        />
      )}
    </div>
  );
}

