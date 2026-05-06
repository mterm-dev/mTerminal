import { Fragment, useMemo } from "react";
import hljs from "highlight.js/lib/common";
import {
  parseUnifiedDiffSideBySide,
  langFromFilename,
  type DiffRow,
  type DiffSpan,
} from "../../lib/diff-parse";

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
        <UnifiedView text={text} />
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
  const lang = langFromFilename(row.filename);
  const leftHasChange = hasChangedSpans(row.leftSpans);
  const rightHasChange = hasChangedSpans(row.rightSpans);

  return (
    <Fragment>
      <div className={leftCls}>
        <span className="ln">{row.leftNo ?? ""}</span>
        <span className="text">
          {leftHasChange
            ? renderText(row.leftSpans, row.leftText, "left")
            : renderHighlighted(row.leftText, lang)}
        </span>
      </div>
      <div className={rightCls}>
        <span className="ln">{row.rightNo ?? ""}</span>
        <span className="text">
          {rightHasChange
            ? renderText(row.rightSpans, row.rightText, "right")
            : renderHighlighted(row.rightText, lang)}
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

function hasChangedSpans(spans: DiffSpan[] | undefined): boolean {
  if (!spans || spans.length === 0) return false;
  for (const s of spans) if (s.changed) return true;
  return false;
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

function renderHighlighted(text: string | undefined, lang: string | undefined) {
  if (!text) return text ?? "";
  const html = highlightSafe(text, lang);
  if (html == null) return text;
  return (
    <span
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function highlightSafe(code: string, lang: string | undefined): string | null {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
  } catch {
    return null;
  }
  return null;
}

function UnifiedView({ text }: { text: string }) {
  const items = useMemo(() => {
    const out: { line: string; cls: string; lang?: string }[] = [];
    let currentFile: string | undefined;
    const lines = text.split("\n");
    for (const line of lines) {
      const gh = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (gh) currentFile = gh[2];

      let cls = "git-diff-line";
      let isHeader = false;
      if (line.startsWith("+++") || line.startsWith("---")) {
        cls += " head";
        isHeader = true;
      } else if (line.startsWith("@@")) {
        cls += " hunk";
        isHeader = true;
      } else if (line.startsWith("diff ")) {
        cls += " head";
        isHeader = true;
      } else if (line.startsWith("+")) {
        cls += " add";
      } else if (line.startsWith("-")) {
        cls += " del";
      }
      out.push({
        line,
        cls,
        lang: isHeader ? undefined : langFromFilename(currentFile),
      });
    }
    return out;
  }, [text]);

  return (
    <pre className="git-diff-modal-pre">
      {items.map((it, i) => {
        const sign = it.line.charAt(0);
        const isBody =
          !it.cls.includes("head") &&
          !it.cls.includes("hunk") &&
          (sign === "+" || sign === "-" || sign === " ");
        if (!isBody || !it.lang) {
          return (
            <span key={i} className={it.cls}>
              {it.line}
              {"\n"}
            </span>
          );
        }
        const body = it.line.slice(1);
        const html = highlightSafe(body, it.lang);
        if (html == null) {
          return (
            <span key={i} className={it.cls}>
              {it.line}
              {"\n"}
            </span>
          );
        }
        return (
          <span key={i} className={it.cls}>
            {sign}
            <span dangerouslySetInnerHTML={{ __html: html }} />
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}
