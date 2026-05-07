export interface HotkeySpec {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

function isMacPlatform(): boolean {
  if (typeof window !== "undefined" && (window as { mt?: { platform?: string } }).mt?.platform) {
    return (window as { mt: { platform: string } }).mt.platform === "darwin";
  }
  if (typeof navigator !== "undefined" && typeof navigator.platform === "string") {
    return navigator.platform.toLowerCase().includes("mac");
  }
  return false;
}

export function parseHotkey(s: string): HotkeySpec | null {
  if (!s) return null;
  const parts = s.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const spec: HotkeySpec = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  for (const p of parts) {
    const lp = p.toLowerCase();
    if (lp === "ctrl" || lp === "control") spec.ctrl = true;
    else if (lp === "shift") spec.shift = true;
    else if (lp === "alt" || lp === "option") spec.alt = true;
    else if (lp === "cmd" || lp === "meta" || lp === "command" || lp === "super") spec.meta = true;
    else spec.key = p;
  }
  if (!spec.key) return null;
  return spec;
}

export function formatHotkey(spec: HotkeySpec | null): string {
  if (!spec || !spec.key) return "";
  const mac = isMacPlatform();
  const parts: string[] = [];
  if (mac) {
    if (spec.ctrl) parts.push("⌃");
    if (spec.alt) parts.push("⌥");
    if (spec.shift) parts.push("⇧");
    if (spec.meta) parts.push("⌘");
    parts.push(normalizeKey(spec.key));
    return parts.join("");
  }
  if (spec.ctrl) parts.push("Ctrl");
  if (spec.meta) parts.push("Meta");
  if (spec.shift) parts.push("Shift");
  if (spec.alt) parts.push("Alt");
  parts.push(normalizeKey(spec.key));
  return parts.join("+");
}

function normalizeKey(k: string): string {
  if (k.length === 1) return k.toUpperCase();
  return k;
}

const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "OS",
  "AltGraph",
]);

export function specFromKeyboardEvent(e: KeyboardEvent): HotkeySpec | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  return {
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
    key: normalizeKey(e.key),
  };
}

export function matchHotkey(e: KeyboardEvent, hotkey: string): boolean {
  const spec = parseHotkey(hotkey);
  if (!spec) return false;
  if (e.ctrlKey !== spec.ctrl) return false;
  if (e.shiftKey !== spec.shift) return false;
  if (e.altKey !== spec.alt) return false;
  if (e.metaKey !== spec.meta) return false;
  const want = spec.key.toLowerCase();
  const got = e.key.toLowerCase();
  if (want === got) return true;
  return want.length === 1 && got.length === 1 && want === got.toLowerCase();
}
