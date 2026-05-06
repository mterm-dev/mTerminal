import type { CSSProperties } from "react";
import { THEMES } from "../themes";
import { Field, type SectionProps } from "./_shared";

export function Appearance({ settings, update }: SectionProps) {
  return (
    <>
      <Field label="Theme" hint="Color palette for UI and terminal">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-card ${settings.themeId === t.id ? "active" : ""}`}
              onClick={() => update("themeId", t.id)}
              style={
                {
                  "--p-bg": t.xterm.background,
                  "--p-fg": t.xterm.foreground,
                  "--p-accent": t.xterm.cursor,
                  "--p-red": t.xterm.red,
                  "--p-green": t.xterm.green,
                  "--p-blue": t.xterm.blue,
                  "--p-magenta": t.xterm.magenta,
                } as CSSProperties
              }
            >
              <div className="theme-preview">
                <span className="swatch swatch-red" />
                <span className="swatch swatch-green" />
                <span className="swatch swatch-yellow" style={{ background: t.xterm.yellow }} />
                <span className="swatch swatch-blue" />
                <span className="swatch swatch-magenta" />
              </div>
              <div className="theme-name">{t.name}</div>
            </button>
          ))}
        </div>
      </Field>

      <Field label="UI font size" hint={`${settings.uiFontSize}px`}>
        <input
          type="range"
          min={11}
          max={16}
          step={1}
          value={settings.uiFontSize}
          onChange={(e) => update("uiFontSize", Number(e.target.value))}
        />
      </Field>

      <Field label="Window opacity" hint={`${Math.round(settings.windowOpacity * 100)}%`}>
        <input
          type="range"
          min={0.6}
          max={1}
          step={0.02}
          value={settings.windowOpacity}
          onChange={(e) => update("windowOpacity", Number(e.target.value))}
        />
      </Field>
    </>
  );
}
