import type { CSSProperties } from "react";
import { THEMES } from "../themes";
import { Field, Group, SectionLabel, type SectionProps } from "./_shared";
import { SliderRow } from "./_rows";

export function Appearance({ settings, update }: SectionProps) {
  return (
    <>
      <SectionLabel>Theme</SectionLabel>
      <Group>
        <Field
          label="Color palette"
          desc="Applies to UI chrome and terminal colors"
          stack
        >
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
      </Group>

      <SectionLabel>Chrome</SectionLabel>
      <Group>
        <SliderRow
          label="UI font size"
          desc="Affects sidebar, settings, status bar, and other UI chrome"
          value={settings.uiFontSize}
          min={11}
          max={16}
          step={1}
          format={(v) => `${v}px`}
          onChange={(v) => update("uiFontSize", v)}
        />
        <SliderRow
          label="Window opacity"
          desc="Lower values let the desktop show through behind the terminal"
          value={settings.windowOpacity}
          min={0.6}
          max={1}
          step={0.02}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => update("windowOpacity", v)}
        />
      </Group>
    </>
  );
}
