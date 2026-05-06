import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getGitApi,
  type ConflictFile,
  type ConflictFileEntry,
  type ConflictSegment,
  type MergeStateKind,
} from "../../lib/git-api";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { CloseIcon, SpinnerIcon } from "./icons";

interface Props {
  cwd: string;
  initialPath?: string | null;
  onClose: () => void;
  onResolved: (info?: string) => void;
  onError: (msg: string) => void;
}

type BlockState = {
  text: string;
  resolved: boolean;
};

type FileState = {
  file: ConflictFile;
  blocks: Map<number, BlockState>;
};

const MARKER_LINE = /^(?:<{7}|={7}|>{7}|\|{7})(?:\s|$)/;

function blockHasMarkers(text: string): boolean {
  for (const line of text.split("\n")) {
    if (MARKER_LINE.test(line)) return true;
  }
  return false;
}

function initialBlockText(seg: Extract<ConflictSegment, { kind: "conflict" }>): string {
  const parts: string[] = [];
  parts.push(`<<<<<<< ${seg.labelOurs ?? "ours"}`);
  parts.push(...seg.ours);
  if (seg.base) {
    parts.push(`||||||| ${seg.labelBase ?? "base"}`);
    parts.push(...seg.base);
  }
  parts.push("=======");
  parts.push(...seg.theirs);
  parts.push(`>>>>>>> ${seg.labelTheirs ?? "theirs"}`);
  return parts.join("\n");
}

function makeFileState(file: ConflictFile): FileState {
  const blocks = new Map<number, BlockState>();
  for (const seg of file.segments) {
    if (seg.kind !== "conflict") continue;
    const text = initialBlockText(seg);
    blocks.set(seg.id, { text, resolved: !blockHasMarkers(text) });
  }
  return { file, blocks };
}

function assembleContent(state: FileState): string {
  const out: string[] = [];
  for (const seg of state.file.segments) {
    if (seg.kind === "common") {
      out.push(seg.lines.join("\n"));
    } else {
      const b = state.blocks.get(seg.id);
      out.push(b ? b.text : "");
    }
  }
  return out.join("\n");
}

function countResolved(state: FileState | null): { resolved: number; total: number } {
  if (!state) return { resolved: 0, total: 0 };
  let r = 0;
  let t = 0;
  for (const seg of state.file.segments) {
    if (seg.kind !== "conflict") continue;
    t++;
    const b = state.blocks.get(seg.id);
    if (b?.resolved) r++;
  }
  return { resolved: r, total: t };
}

export function ConflictResolverModal({
  cwd,
  initialPath,
  onClose,
  onResolved,
  onError,
}: Props) {
  const [conflicts, setConflicts] = useState<ConflictFileEntry[] | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [fileStates, setFileStates] = useState<Map<string, FileState>>(new Map());
  const [resolvedPaths, setResolvedPaths] = useState<Set<string>>(new Set());
  const [loadingFile, setLoadingFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mergeState, setMergeState] = useState<MergeStateKind>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileLoadKey = useRef(0);

  useEscapeKey(onClose, { enabled: !busy });

  useEffect(() => {
    let active = true;
    const api = getGitApi();
    if (!api) {
      setLoadError("git api unavailable");
      return;
    }
    (async () => {
      try {
        const [list, state] = await Promise.all([
          api.listConflicts(cwd),
          api.mergeState(cwd),
        ]);
        if (!active) return;
        setConflicts(list);
        setMergeState(state);
        const start =
          (initialPath && list.some((f) => f.path === initialPath) && initialPath) ||
          list[0]?.path ||
          null;
        setActivePath(start);
      } catch (e) {
        if (active) setLoadError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [cwd, initialPath]);

  useEffect(() => {
    if (!activePath) return;
    if (fileStates.has(activePath)) return;
    const api = getGitApi();
    if (!api) return;
    const key = ++fileLoadKey.current;
    setLoadingFile(true);
    (async () => {
      try {
        const f = (await api.readConflictFile(cwd, activePath)) as ConflictFile;
        if (key !== fileLoadKey.current) return;
        setFileStates((prev) => {
          if (prev.has(activePath)) return prev;
          const next = new Map(prev);
          next.set(activePath, makeFileState(f));
          return next;
        });
      } catch (e) {
        if (key === fileLoadKey.current) onError((e as Error).message);
      } finally {
        if (key === fileLoadKey.current) setLoadingFile(false);
      }
    })();
  }, [activePath, cwd, fileStates, onError]);

  const activeState = activePath ? fileStates.get(activePath) ?? null : null;

  const updateBlock = useCallback(
    (blockId: number, text: string) => {
      if (!activePath) return;
      setFileStates((prev) => {
        const cur = prev.get(activePath);
        if (!cur) return prev;
        const blocks = new Map(cur.blocks);
        blocks.set(blockId, { text, resolved: !blockHasMarkers(text) });
        const next = new Map(prev);
        next.set(activePath, { file: cur.file, blocks });
        return next;
      });
    },
    [activePath],
  );

  const applyChoice = useCallback(
    (
      seg: Extract<ConflictSegment, { kind: "conflict" }>,
      choice: "ours" | "theirs" | "both" | "both-rev" | "clear",
    ) => {
      let text: string;
      if (choice === "ours") text = seg.ours.join("\n");
      else if (choice === "theirs") text = seg.theirs.join("\n");
      else if (choice === "both") text = [...seg.ours, ...seg.theirs].join("\n");
      else if (choice === "both-rev") text = [...seg.theirs, ...seg.ours].join("\n");
      else text = "";
      updateBlock(seg.id, text);
    },
    [updateBlock],
  );

  const totals = useMemo(() => countResolved(activeState), [activeState]);

  const allFilesProgress = useMemo(() => {
    if (!conflicts) return { resolved: 0, total: 0, files: 0 };
    let r = 0;
    let t = 0;
    for (const c of conflicts) {
      const s = fileStates.get(c.path);
      if (!s) {
        if (resolvedPaths.has(c.path)) r += 1;
        t += 1;
        continue;
      }
      const ct = countResolved(s);
      if (ct.total === 0) {
        t += 1;
        if (resolvedPaths.has(c.path)) r += 1;
      } else {
        t += ct.total;
        r += ct.resolved;
      }
    }
    return { resolved: r, total: t, files: conflicts.length };
  }, [conflicts, fileStates, resolvedPaths]);

  const canSaveActive = !!activeState && totals.resolved === totals.total && totals.total > 0;

  const saveActive = async (advance: boolean) => {
    if (!activeState || !activePath) return;
    const api = getGitApi();
    if (!api) return;
    const content = assembleContent(activeState);
    setBusy(true);
    try {
      await api.resolveFile(cwd, activePath, content);
      setResolvedPaths((prev) => {
        const n = new Set(prev);
        n.add(activePath);
        return n;
      });
      if (advance && conflicts) {
        const remaining = conflicts.find(
          (c) => c.path !== activePath && !resolvedPaths.has(c.path),
        );
        if (remaining) {
          setActivePath(remaining.path);
        } else {
          onResolved("all conflicts resolved — ready to commit");
          onClose();
          return;
        }
      } else if (conflicts && conflicts.every((c) => resolvedPaths.has(c.path) || c.path === activePath)) {
        onResolved("all conflicts resolved — ready to commit");
        onClose();
        return;
      }
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const abort = async () => {
    const api = getGitApi();
    if (!api) return;
    setBusy(true);
    try {
      await api.mergeAbort(cwd);
      onResolved(`${mergeState ?? "merge"} aborted`);
      onClose();
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="git-diff-modal-backdrop" onClick={busy ? undefined : onClose} role="presentation">
      <div
        className="git-diff-modal conflict-modal"
        role="dialog"
        aria-label="resolve conflicts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="git-diff-modal-h">
          <div className="git-diff-modal-title">
            <span className="git-diff-modal-badge unstaged">
              {mergeState ?? "conflicts"}
            </span>
            <span className="git-diff-modal-path">resolve conflicts</span>
            {allFilesProgress.total > 0 && (
              <span className="conflict-progress">
                {allFilesProgress.resolved}/{allFilesProgress.total}
              </span>
            )}
          </div>
          <div className="git-diff-modal-actions">
            <button
              type="button"
              className="git-btn danger"
              onClick={() => void abort()}
              disabled={busy || mergeState === null}
              title="abort the in-progress merge/rebase"
            >
              abort {mergeState ?? "merge"}
            </button>
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

        <div className="conflict-files">
          {loadError && <div className="git-diff-error">{loadError}</div>}
          {conflicts && conflicts.length === 0 && (
            <div className="git-diff-empty">no conflicts</div>
          )}
          {conflicts &&
            conflicts.map((c) => {
              const s = fileStates.get(c.path);
              const ct = s ? countResolved(s) : null;
              const done = resolvedPaths.has(c.path);
              return (
                <button
                  key={c.path}
                  type="button"
                  className={
                    "conflict-file-tab" +
                    (c.path === activePath ? " active" : "") +
                    (done ? " done" : "")
                  }
                  onClick={() => setActivePath(c.path)}
                  disabled={busy}
                  title={c.path}
                >
                  <span className="conflict-file-path">{c.path}</span>
                  {done ? (
                    <span className="conflict-file-badge ok">✓</span>
                  ) : ct && ct.total > 0 ? (
                    <span className="conflict-file-badge">
                      {ct.resolved}/{ct.total}
                    </span>
                  ) : null}
                </button>
              );
            })}
        </div>

        <div className="conflict-3pane-h">
          <div>ours (yours)</div>
          <div>result</div>
          <div>theirs (incoming)</div>
        </div>

        <div className="conflict-3pane-body">
          {loadingFile && <div className="git-diff-loading">loading…</div>}
          {!loadingFile && activeState?.file.binary && (
            <div className="git-confirm-warn">
              binary file — resolve manually with the terminal, then mark as resolved
            </div>
          )}
          {!loadingFile && activeState && !activeState.file.binary && (
            <div className="conflict-grid">
              {activeState.file.segments.map((seg, idx) =>
                seg.kind === "common" ? (
                  <CommonRow key={`c-${idx}`} lines={seg.lines} />
                ) : (
                  <ConflictRow
                    key={`x-${seg.id}`}
                    seg={seg}
                    text={activeState.blocks.get(seg.id)?.text ?? ""}
                    resolved={activeState.blocks.get(seg.id)?.resolved ?? false}
                    onChange={(t) => updateBlock(seg.id, t)}
                    onApply={(c) => applyChoice(seg, c)}
                    disabled={busy}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <div className="git-confirm-actions">
          <button className="git-btn" onClick={onClose} disabled={busy}>
            close
          </button>
          <button
            className="git-btn"
            onClick={() => void saveActive(false)}
            disabled={busy || !canSaveActive}
            title={canSaveActive ? "save and stage current file" : "resolve all blocks first"}
          >
            {busy ? <SpinnerIcon /> : null}
            <span>save file</span>
          </button>
          <button
            className="git-btn primary"
            onClick={() => void saveActive(true)}
            disabled={busy || !canSaveActive}
          >
            {busy ? <SpinnerIcon /> : null}
            <span>save & next</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CommonRow({ lines }: { lines: string[] }) {
  const text = lines.join("\n");
  return (
    <>
      <pre className="conflict-cell common left">{text}</pre>
      <pre className="conflict-cell common center">{text}</pre>
      <pre className="conflict-cell common right">{text}</pre>
    </>
  );
}

interface ConflictRowProps {
  seg: Extract<ConflictSegment, { kind: "conflict" }>;
  text: string;
  resolved: boolean;
  disabled: boolean;
  onChange: (t: string) => void;
  onApply: (choice: "ours" | "theirs" | "both" | "both-rev" | "clear") => void;
}

function ConflictRow({ seg, text, resolved, disabled, onChange, onApply }: ConflictRowProps) {
  return (
    <>
      <div className="conflict-cell conflict left">
        <div className="conflict-cell-head">
          <span>ours{seg.labelOurs ? ` · ${seg.labelOurs}` : ""}</span>
          <button
            type="button"
            className="conflict-mini-btn"
            onClick={() => onApply("ours")}
            disabled={disabled}
            title="accept ours"
          >
            »
          </button>
        </div>
        <pre className="conflict-side ours">{seg.ours.join("\n") || " "}</pre>
      </div>

      <div className={"conflict-cell conflict center" + (resolved ? " resolved" : "")}>
        <div className="conflict-cell-head">
          <span>{resolved ? "resolved" : "unresolved"}</span>
          <div className="conflict-actions">
            <button
              type="button"
              className="conflict-mini-btn"
              onClick={() => onApply("ours")}
              disabled={disabled}
              title="take ours"
            >
              ours
            </button>
            <button
              type="button"
              className="conflict-mini-btn"
              onClick={() => onApply("theirs")}
              disabled={disabled}
              title="take theirs"
            >
              theirs
            </button>
            <button
              type="button"
              className="conflict-mini-btn"
              onClick={() => onApply("both")}
              disabled={disabled}
              title="ours then theirs"
            >
              both
            </button>
            <button
              type="button"
              className="conflict-mini-btn"
              onClick={() => onApply("both-rev")}
              disabled={disabled}
              title="theirs then ours"
            >
              both ⇅
            </button>
            <button
              type="button"
              className="conflict-mini-btn"
              onClick={() => onApply("clear")}
              disabled={disabled}
              title="clear (delete this section)"
            >
              clear
            </button>
          </div>
        </div>
        <textarea
          className="conflict-result-edit"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          disabled={disabled}
          rows={Math.max(seg.ours.length, seg.theirs.length, text.split("\n").length, 3)}
        />
      </div>

      <div className="conflict-cell conflict right">
        <div className="conflict-cell-head">
          <button
            type="button"
            className="conflict-mini-btn"
            onClick={() => onApply("theirs")}
            disabled={disabled}
            title="accept theirs"
          >
            «
          </button>
          <span>theirs{seg.labelTheirs ? ` · ${seg.labelTheirs}` : ""}</span>
        </div>
        <pre className="conflict-side theirs">{seg.theirs.join("\n") || " "}</pre>
      </div>
    </>
  );
}
