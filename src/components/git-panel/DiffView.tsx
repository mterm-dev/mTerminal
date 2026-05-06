import { Fragment, useMemo } from "react";
import { parseUnifiedDiffSideBySide, type DiffRow, type DiffSpan } from "../../lib/diff-parse";

interface Props {
  text: string;
  view: "side" | "unified";
  loading?: boolean;
  error?: string | null;
  truncated?: boolean;
  emptyText?: string;
}

export function DiffView({
  text,
  view,
  loading,
  error,
  truncated,
  emptyText = "no changes",
}: Props) {
  const rows = useMemo<DiffRow[]>(
    () => (view === "side" && text ? parseUnifiedDiffSideBySide(text) : []),
    [view, text],
  );

  const isEmpty = !error && !loading && text.trim().length === 0;

  return (
    <>
      {error && <div className="git-diff-error">{error}</div>}
      {!error && loading && <div className="git-diff-loading">loading…</div>}
      {isEmpty && <div className="git-diff-empty">{emptyText}</div>}
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
    </>
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
