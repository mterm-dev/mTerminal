import type { CursorStyle } from "../useSettings";
import { Group, SectionLabel, type SectionProps } from "./_shared";
import { NumberRow, SegmentedRow, SliderRow, TextRow, ToggleRow } from "./_rows";

const CURSOR_OPTIONS: { label: string; value: CursorStyle; icon: string }[] = [
  { label: "Block", value: "block", icon: "▮" },
  { label: "Bar", value: "bar", icon: "│" },
  { label: "Underline", value: "underline", icon: "_" },
];

export function TerminalPanel({ settings, update }: SectionProps) {
  return (
    <>
      <SectionLabel>Typography</SectionLabel>
      <Group>
        <TextRow
          label="Font family"
          desc="Any font family list valid in CSS; leave the fallback chain to keep glyph coverage"
          value={settings.fontFamily}
          placeholder='"JetBrains Mono", monospace'
          onChange={(v) => update("fontFamily", v)}
          grow
        />
        <SliderRow
          label="Font size"
          desc="Terminal cell size; takes effect immediately on all open tabs"
          value={settings.fontSize}
          min={9}
          max={24}
          step={1}
          format={(v) => `${v}px`}
          onChange={(v) => update("fontSize", v)}
        />
        <SliderRow
          label="Line height"
          desc="Multiplier applied to terminal font size"
          value={settings.lineHeight}
          min={1}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update("lineHeight", v)}
        />
      </Group>

      <SectionLabel>Cursor</SectionLabel>
      <Group>
        <SegmentedRow
          label="Cursor style"
          desc="How the active cell is drawn in each tab"
          value={settings.cursorStyle}
          options={CURSOR_OPTIONS}
          onChange={(v) => update("cursorStyle", v)}
        />
        <ToggleRow
          label="Cursor blink"
          desc="Animate the cursor when the terminal has focus"
          checked={settings.cursorBlink}
          onChange={(b) => update("cursorBlink", b)}
        />
      </Group>

      <SectionLabel>Buffer</SectionLabel>
      <Group>
        <NumberRow
          label="Scrollback"
          desc="Lines kept in memory above the visible viewport, per tab"
          value={settings.scrollback}
          min={0}
          max={100000}
          step={500}
          suffix="lines"
          onChange={(v) => update("scrollback", v)}
        />
      </Group>

      <SectionLabel>Shell</SectionLabel>
      <Group>
        <TextRow
          label="Shell override"
          desc="Path to the shell binary used for new tabs; leave empty to use $SHELL"
          value={settings.shellOverride}
          placeholder="/usr/bin/fish"
          onChange={(v) => update("shellOverride", v)}
          grow
        />
        <TextRow
          label="Shell arguments"
          desc="Space-separated flags appended to the spawn command for new tabs"
          value={settings.shellArgs}
          placeholder="--login -i"
          onChange={(v) => update("shellArgs", v)}
          grow
        />
      </Group>
    </>
  );
}
