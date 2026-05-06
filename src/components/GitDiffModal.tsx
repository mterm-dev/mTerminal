import { Fragment, useEffect, useMemo, useState } from "react";
import { parseUnifiedDiffSideBySide, type DiffRow, type DiffSpan } from "../lib/diff-parse";
import { getGitApi } from "../lib/git-api";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface Props {
  cwd: string;
  path: string;
  staged: boolean;
  status?: { indexStatus: string; worktreeStatus: string; untracked: boolean };
  onClose: () => void;
}

const FULL_CONTEXT = 1_000_000;

function statusLabel(
  staged: boolean,
  status?: Props["status"],
): { text: string; cls: string } {
  if (status?.untracked) return { text: "untracked", cls: "untracked" };
  if (staged) return { text: "staged", cls: "staged" };
  return { text: "unstaged", cls: "unstaged" };
}

export function GitDiffModal({ cwd, path, staged, status, onClose }: Props) {
  const [view, setView] = useState<"side" | "unified">("side");
  const [text, setText] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const api = getGitApi();
    if (!api) {
      setError("git api unavailable");
      setLoading(false);
      return;
    }
    setLoading(true);
    setText("");
    setError(null);
    api
      .diff(cwd, path, staged, view === "side" ? FULL_CONTEXT : undefined)
      .then((res) => {
        if (!active) return;
        setText(res.text);
        setTruncated(res.truncated);
      })
      .catch((e: Error) => {
        if (!active) return;
        setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cwd, path, staged, view]);

  useEscapeKey(onClose);

  const rows = useMemo<DiffRow[]>(
    () => (view === "side" && text ? parseUnifiedDiffSideBySide(text) : []),
    [view, text],
  );

  const isEmpty = !error && !loading && text.trim().length === 0;
  const badge = statusLabel(staged, status);

  return (
    <div
      className="git-diff-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="git-diff-modal"
        role="dialog"
        aria-label={`diff ${path}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="git-diff-modal-h">
          <div className="git-diff-modal-title" title={path}>
            <span className={`git-diff-modal-badge ${badge.cls}`}>{badge.text}</span>
            <span className="git-diff-modal-path">{path}</span>
          </div>
          <div className="git-diff-modal-actions">
            <button
              type="button"
              className="git-btn"
              onClick={() => setView(view === "side" ? "unified" : "side")}
              title={view === "side" ? "switch to unified view" : "switch to side-by-side"}
            >
              {view === "side" ? "unified" : "side-by-side"}
            </button>
            <button
              type="button"
              className="winctl-btn"
              onClick={onClose}
              aria-label="close"
              title="close (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="git-diff-modal-body">
          {error && <div className="git-diff-error">{error}</div>}
          {!error && loading && <div className="git-diff-loading">loading…</div>}
          {isEmpty && <div className="git-diff-empty">no changes</div>}
          {!error && !loading && !isEmpty && view === "side" && (
            <div className="git-diff-cols" role="presentation">
              {rows.map((row, i) => (
                <SideRow key={i} row={row} />
              ))}
            </div>
          )}
          {!error && !loading && !isEmpty && view === "unified" && (
            <pre className="git-diff-modal-pre">
              {text.split("\n").map((line, i) => {
                let cls = "git-diff-line";
                if (line.startsWith("+++") || line.startsWith("---")) cls += " head";
                else if (line.startsWith("@@")) cls += " hunk";
                else if (line.startsWith("+")) cls += " add";
                else if (line.startsWith("-")) cls += " del";
                else if (line.startsWith("diff ")) cls += " head";
                return (
                  <span key={i} className={cls}>
                    {line}
                    {"\n"}
                  </span>
                );
              })}
            </pre>
          )}
          {truncated && (
            <div className="git-diff-truncated">diff truncated (size limit reached)</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SideRow({ row }: { row: DiffRow }) {
  if (row.type === "hunk") {
    return (
      <div className="git-diff-row hunk" role="presentation">
        <span className="git-diff-hunk-text">{row.hunkHeader}</span>
      </div>
    );
  }

  const leftCls = `git-diff-cell left ${cellClass(row, "left")}`;
  const rightCls = `git-diff-cell right ${cellClass(row, "right")}`;

  return (
    <Fragment>
      <div className={leftCls}>
        <span className="ln">{row.leftNo ?? ""}</span>
        <span className="text">
          {renderText(row.leftSpans, row.leftText, "left")}
        </span>
      </div>
      <div className={rightCls}>
        <span className="ln">{row.rightNo ?? ""}</span>
        <span className="text">
          {renderText(row.rightSpans, row.rightText, "right")}
        </span>
      </div>
    </Fragment>
  );
}

function cellClass(row: DiffRow, side: "left" | "right"): string {
  if (row.type === "context") return "context";
  if (row.type === "add") return side === "right" ? "add" : "empty";
  if (row.type === "del") return side === "left" ? "del" : "empty";
  if (row.type === "change") return `change ${side}`;
  return "";
}

function renderText(
  spans: DiffSpan[] | undefined,
  fallback: string | undefined,
  side: "left" | "right",
) {
  if (spans && spans.length > 0) {
    return spans.map((s, i) =>
      s.changed ? (
        <span key={i} className={`ws-changed ${side}`}>
          {s.text}
        </span>
      ) : (
        <span key={i}>{s.text}</span>
      ),
    );
  }
  return fallback ?? "";
}
