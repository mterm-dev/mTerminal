import type { CursorStyle } from "../useSettings";
import { Field, Toggle, type SectionProps } from "./_shared";

export function TerminalPanel({ settings, update }: SectionProps) {
  return (
    <>
      <Field label="Font family" hint="Monospace font for terminal content">
        <input
          type="text"
          value={settings.fontFamily}
          onChange={(e) => update("fontFamily", e.target.value)}
          placeholder='"JetBrains Mono", monospace'
        />
      </Field>
      <Field label="Font size" hint={`${settings.fontSize}px`}>
        <input
          type="range"
          min={9}
          max={24}
          step={1}
          value={settings.fontSize}
          onChange={(e) => update("fontSize", Number(e.target.value))}
        />
      </Field>
      <Field label="Line height" hint={settings.lineHeight.toFixed(2)}>
        <input
          type="range"
          min={1}
          max={2}
          step={0.05}
          value={settings.lineHeight}
          onChange={(e) => update("lineHeight", Number(e.target.value))}
        />
      </Field>
      <Field label="Cursor style">
        <div className="seg-control">
          {(["block", "bar", "underline"] as CursorStyle[]).map((s) => (
            <button
              key={s}
              className={settings.cursorStyle === s ? "active" : ""}
              onClick={() => update("cursorStyle", s)}
            >
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Cursor blink">
        <Toggle
          checked={settings.cursorBlink}
          onChange={(b) => update("cursorBlink", b)}
        />
      </Field>
      <Field label="Scrollback lines" hint={`${settings.scrollback}`}>
        <input
          type="number"
          min={0}
          max={100000}
          step={500}
          value={settings.scrollback}
          onChange={(e) =>
            update("scrollback", Math.max(0, Math.min(100000, Number(e.target.value) || 0)))
          }
        />
      </Field>
    </>
  );
}
