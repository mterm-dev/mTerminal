import { useEffect, useState } from "react";
import { getGitApi } from "../lib/git-api";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { DiffView } from "./git-panel/DiffView";

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
          <DiffView
            text={text}
            view={view}
            loading={loading}
            error={error}
            truncated={truncated}
          />
        </div>
      </div>
    </div>
  );
}
