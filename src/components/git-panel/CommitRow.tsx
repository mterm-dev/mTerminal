import type { GitLogEntry } from "../../lib/git-api";

interface Props {
  commit: GitLogEntry;
  selected?: boolean;
  onClick?: () => void;
  graph?: React.ReactNode;
}

function relativeDate(unix: number): string {
  if (!unix) return "";
  const now = Date.now() / 1000;
  const diff = now - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`;
  return `${Math.floor(diff / (86400 * 365))}y ago`;
}

export function CommitRow({ commit, selected, onClick, graph }: Props) {
  return (
    <div
      className={`git-commit-row ${selected ? "selected" : ""} ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      title={`${commit.sha}\n${commit.author} <${commit.authorEmail}>`}
    >
      {graph}
      <div className="git-commit-row-main">
        <div className="git-commit-row-subject">
          {commit.refs.length > 0 && (
            <span className="git-commit-refs">
              {commit.refs.map((r, i) => (
                <span key={i} className={`git-commit-ref ${refClass(r)}`}>
                  {refLabel(r)}
                </span>
              ))}
            </span>
          )}
          <span className="git-commit-subject-text">{commit.subject}</span>
        </div>
        <div className="git-commit-row-meta">
          <span className="git-commit-sha">{commit.shortSha}</span>
          <span className="git-commit-author">{commit.author}</span>
          <span className="git-commit-date">{relativeDate(commit.date)}</span>
        </div>
      </div>
    </div>
  );
}

function refClass(ref: string): string {
  if (ref.startsWith("HEAD")) return "head";
  if (ref.startsWith("tag:")) return "tag";
  if (ref.includes("/")) return "remote";
  return "local";
}

function refLabel(ref: string): string {
  if (ref.startsWith("tag: ")) return ref.slice(5);
  if (ref.startsWith("HEAD -> ")) return ref.slice(8);
  return ref;
}
