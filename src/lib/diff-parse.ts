export type DiffRowType = "context" | "add" | "del" | "change" | "hunk";

export interface DiffSpan {
  text: string;
  changed: boolean;
}

export interface DiffRow {
  type: DiffRowType;
  leftNo?: number;
  leftText?: string;
  leftSpans?: DiffSpan[];
  rightNo?: number;
  rightText?: string;
  rightSpans?: DiffSpan[];
  hunkHeader?: string;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

const FILE_HEADER_PREFIXES = [
  "diff ",
  "index ",
  "--- ",
  "+++ ",
  "new file mode",
  "deleted file mode",
  "old mode",
  "new mode",
  "similarity ",
  "dissimilarity ",
  "rename from",
  "rename to",
  "copy from",
  "copy to",
  "Binary files",
  "GIT binary patch",
];

function isFileHeader(line: string): boolean {
  for (const p of FILE_HEADER_PREFIXES) if (line.startsWith(p)) return true;
  return false;
}

interface PendingLine {
  text: string;
  no: number;
}

function tokenize(s: string): string[] {
  const re = /(\s+|[A-Za-z0-9_]+|.)/gu;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out.push(m[0]);
  return out;
}

const WORD_DIFF_TOKEN_LIMIT = 400;

function mergeSpans(spans: DiffSpan[]): DiffSpan[] {
  const out: DiffSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.changed === s.changed) last.text += s.text;
    else out.push({ text: s.text, changed: s.changed });
  }
  return out;
}

export function diffWords(a: string, b: string): { left: DiffSpan[]; right: DiffSpan[] } {
  if (a === b) {
    return {
      left: a.length ? [{ text: a, changed: false }] : [],
      right: b.length ? [{ text: b, changed: false }] : [],
    };
  }
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length > WORD_DIFF_TOKEN_LIMIT || tb.length > WORD_DIFF_TOKEN_LIMIT) {
    return {
      left: a.length ? [{ text: a, changed: true }] : [],
      right: b.length ? [{ text: b, changed: true }] : [],
    };
  }
  const n = ta.length;
  const m = tb.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (ta[i - 1] === tb[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
    }
  }
  const left: DiffSpan[] = [];
  const right: DiffSpan[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ta[i - 1] === tb[j - 1]) {
      left.unshift({ text: ta[i - 1]!, changed: false });
      right.unshift({ text: tb[j - 1]!, changed: false });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      right.unshift({ text: tb[j - 1]!, changed: true });
      j--;
    } else {
      left.unshift({ text: ta[i - 1]!, changed: true });
      i--;
    }
  }
  return { left: mergeSpans(left), right: mergeSpans(right) };
}

export function parseUnifiedDiffSideBySide(text: string): DiffRow[] {
  if (!text) return [];
  const rows: DiffRow[] = [];
  const lines = text.split("\n");
  let inHunk = false;
  let lNo = 0;
  let rNo = 0;
  const delBuf: PendingLine[] = [];
  const addBuf: PendingLine[] = [];

  const flush = () => {
    const pair = Math.min(delBuf.length, addBuf.length);
    for (let k = 0; k < pair; k++) {
      const d = delBuf[k]!;
      const a = addBuf[k]!;
      const { left, right } = diffWords(d.text, a.text);
      rows.push({
        type: "change",
        leftNo: d.no,
        leftText: d.text,
        leftSpans: left,
        rightNo: a.no,
        rightText: a.text,
        rightSpans: right,
      });
    }
    for (let k = pair; k < delBuf.length; k++) {
      const d = delBuf[k]!;
      rows.push({ type: "del", leftNo: d.no, leftText: d.text });
    }
    for (let k = pair; k < addBuf.length; k++) {
      const a = addBuf[k]!;
      rows.push({ type: "add", rightNo: a.no, rightText: a.text });
    }
    delBuf.length = 0;
    addBuf.length = 0;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;
    if (idx === lines.length - 1 && line === "") break;

    const hunkMatch = line.match(HUNK_RE);
    if (hunkMatch) {
      flush();
      lNo = parseInt(hunkMatch[1]!, 10);
      rNo = parseInt(hunkMatch[2]!, 10);
      rows.push({ type: "hunk", hunkHeader: line });
      inHunk = true;
      continue;
    }

    if (!inHunk) {
      if (isFileHeader(line)) continue;
      continue;
    }

    if (line.startsWith("\\")) continue;

    const ch = line.charAt(0);
    const rest = line.slice(1);
    if (ch === " ") {
      flush();
      rows.push({
        type: "context",
        leftNo: lNo,
        leftText: rest,
        rightNo: rNo,
        rightText: rest,
      });
      lNo++;
      rNo++;
    } else if (ch === "-") {
      delBuf.push({ text: rest, no: lNo });
      lNo++;
    } else if (ch === "+") {
      addBuf.push({ text: rest, no: rNo });
      rNo++;
    } else if (line === "") {
      flush();
      rows.push({
        type: "context",
        leftNo: lNo,
        leftText: "",
        rightNo: rNo,
        rightText: "",
      });
      lNo++;
      rNo++;
    } else {
      flush();
    }
  }

  flush();
  return rows;
}
