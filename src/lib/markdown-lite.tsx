import { Fragment, type ReactNode } from "react";
import { CodeBlock } from "../components/CodeBlock";

interface Props {
  text: string;
}

const FENCE_RE = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)(?:```|$)/g;

export function MarkdownLite({ text }: Props) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  FENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE_RE.exec(text)) !== null) {
    const start = m.index;
    if (start > cursor) {
      parts.push(
        <Fragment key={key++}>{renderInline(text.slice(cursor, start))}</Fragment>,
      );
    }
    const lang = m[1] || undefined;
    const body = m[2] ?? "";
    parts.push(<CodeBlock key={key++} code={body.replace(/\n$/, "")} lang={lang} />);
    cursor = m.index + m[0].length;
  }

  if (cursor < text.length) {
    parts.push(<Fragment key={key++}>{renderInline(text.slice(cursor))}</Fragment>);
  }

  return <>{parts}</>;
}

function renderInline(s: string): ReactNode[] {
  if (!s) return [];
  const out: ReactNode[] = [];
  let i = 0;
  let buf = "";
  let key = 0;
  while (i < s.length) {
    if (s[i] === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i) {
        if (buf) {
          out.push(buf);
          buf = "";
        }
        out.push(
          <code key={`ic-${key++}`} className="inline-code">
            {s.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    buf += s[i];
    i++;
  }
  if (buf) out.push(buf);
  return out;
}
