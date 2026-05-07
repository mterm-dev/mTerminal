import { Fragment, useMemo, useRef } from "react";
import hljs from "highlight.js/lib/common";
import {
  parseUnifiedDiffSideBySide,
  langFromFilename,
  type DiffRow,
  type DiffSpan,
} from "../lib/diff-parse";

interface Props {
  text: string;
  view: "side" | "unified";
  loading?: boolean;
  error?: string | null;
  truncated?: boolean;
  emptyText?: string;
}

type MarkerType = "add" | "del" | "change";
interface Marker {
  type: MarkerType;
  start: number;
  end: number;
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

  const sideMarkers = useMemo<Marker[]>(
    () => (view === "side" ? markersFromRows(rows) : []),
    [view, rows],
  );
  const unifiedMarkers = useMemo<Marker[]>(
    () => (view === "unified" && text ? markersFromUnified(text) : []),
    [view, text],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  return (
    <>
      {error && <div className="git-diff-error">{error}</div>}
      {!error && loading && <div className="git-diff-loading">loading…</div>}
      {isEmpty && <div className="git-diff-empty">{emptyText}</div>}
      {!error && !loading && !isEmpty && view === "side" && (
        <div className="git-diff-wrap">
          <div className="git-diff-cols" role="presentation" ref={scrollRef}>
            {rows.map((row, i) => (
              <SideRow key={i} row={row} />
            ))}
          </div>
          <DiffMinimap
            markers={sideMarkers}
            onJump={(frac) => scrollTo(scrollRef.current, frac)}
          />
        </div>
      )}
      {!error && !loading && !isEmpty && view === "unified" && (
        <div className="git-diff-wrap">
          <UnifiedView text={text} preRef={preRef} />
          <DiffMinimap
            markers={unifiedMarkers}
            onJump={(frac) => scrollTo(preRef.current, frac)}
          />
        </div>
      )}
      {truncated && (
        <div className="git-diff-truncated">diff truncated (size limit reached)</div>
      )}
    </>
  );
}

function scrollTo(el: HTMLElement | null, frac: number) {
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  el.scrollTo({ top: max * frac, behavior: "smooth" });
}

function DiffMinimap({
  markers,
  onJump,
}: {
  markers: Marker[];
  onJump: (frac: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  if (markers.length === 0) {
    return <div className="git-diff-minimap" aria-hidden="true" />;
  }
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onJump(frac);
  };
  return (
    <div
      className="git-diff-minimap"
      ref={ref}
      onClick={handleClick}
      role="presentation"
      aria-hidden="true"
    >
      {markers.map((m, i) => {
        const top = m.start * 100;
        const height = Math.max(0.4, (m.end - m.start) * 100);
        return (
          <div
            key={i}
            className={`git-diff-minimap-marker ${m.type}`}
            style={{ top: `${top}%`, height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

function markersFromRows(rows: DiffRow[]): Marker[] {
  const total = rows.length;
  if (total === 0) return [];
  const out: Marker[] = [];
  let i = 0;
  while (i < total) {
    const t = rowMarkerType(rows[i]!);
    if (!t) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < total && rowMarkerType(rows[j]!) === t) j++;
    out.push({ type: t, start: i / total, end: j / total });
    i = j;
  }
  return out;
}

function rowMarkerType(row: DiffRow): MarkerType | null {
  if (row.type === "add" || row.type === "del" || row.type === "change") {
    return row.type;
  }
  return null;
}

function markersFromUnified(text: string): Marker[] {
  const lines = text.split("\n");
  const total = lines.length;
  if (total === 0) return [];
  const out: Marker[] = [];
  let i = 0;
  while (i < total) {
    const t = lineMarkerType(lines[i]!);
    if (!t) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < total && lineMarkerType(lines[j]!) === t) j++;
    out.push({ type: t, start: i / total, end: j / total });
    i = j;
  }
  return out;
}

function lineMarkerType(line: string): MarkerType | null {
  if (line.startsWith("+++") || line.startsWith("---")) return null;
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return null;
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

function UnifiedView({
  text,
  preRef,
}: {
  text: string;
  preRef: React.MutableRefObject<HTMLPreElement | null>;
}) {
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
    <pre className="git-diff-modal-pre" ref={preRef}>
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
