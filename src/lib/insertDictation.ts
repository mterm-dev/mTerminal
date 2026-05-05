import { invoke } from "./tauri-shim";

export type DictationTarget = "input" | "pty" | "none";

export interface InsertOptions {
  activeTabPtyId?: number | null;
  autoSpace: boolean;
}

function isXtermElement(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (cur.classList && cur.classList.contains("xterm")) return true;
    cur = cur.parentElement;
  }
  return false;
}

function isTextLike(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase();
    return (
      t === "text" ||
      t === "search" ||
      t === "url" ||
      t === "email" ||
      t === "tel" ||
      t === "password" ||
      t === "number" ||
      t === ""
    );
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

export async function insertDictation(
  rawText: string,
  opts: InsertOptions,
): Promise<DictationTarget> {
  const text = rawText.trim();
  if (!text) return "none";

  const el = document.activeElement;

  if (isTextLike(el) && !isXtermElement(el)) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const before = el.value.slice(0, start);
      const needLead =
        opts.autoSpace && before.length > 0 && !/\s$/.test(before);
      const insertion = (needLead ? " " : "") + text;
      try {
        el.setRangeText(insertion, start, end, "end");
      } catch {
        el.value = before + insertion + el.value.slice(end);
        const pos = before.length + insertion.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {}
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return "input";
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        return "input";
      }
    }
  }

  if (opts.activeTabPtyId != null) {
    const data = opts.autoSpace ? text + " " : text;
    try {
      await invoke("pty_write", { id: opts.activeTabPtyId, data });
      return "pty";
    } catch {
      return "none";
    }
  }
  return "none";
}
