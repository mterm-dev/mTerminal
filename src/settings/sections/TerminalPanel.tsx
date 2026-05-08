import type { CursorStyle } from "../useSettings";
import { Group, SectionLabel, type SectionProps } from "./_shared";
import { NumberRow, SegmentedRow, SliderRow, TextRow, ToggleRow } from "./_rows";

const CURSOR_OPTIONS: { label: string; value: CursorStyle; icon: string }[] = [
  { label: "block", value: "block", icon: "▮" },
  { label: "bar", value: "bar", icon: "│" },
  { label: "underline", value: "underline", icon: "_" },
];

export function TerminalPanel({ settings, update }: SectionProps) {
  return (
    <>
      <SectionLabel>typography</SectionLabel>
      <Group>
        <TextRow
          label="font family"
          desc="any font family list valid in css; leave the fallback chain to keep glyph coverage"
          value={settings.fontFamily}
          placeholder='"JetBrains Mono", monospace'
          onChange={(v) => update("fontFamily", v)}
          grow
        />
        <SliderRow
          label="font size"
          desc="terminal cell size; takes effect immediately on all open tabs"
          value={settings.fontSize}
          min={9}
          max={24}
          step={1}
          format={(v) => `${v}px`}
          onChange={(v) => update("fontSize", v)}
        />
        <SliderRow
          label="line height"
          desc="multiplier applied to terminal font size"
          value={settings.lineHeight}
          min={1}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update("lineHeight", v)}
        />
      </Group>

      <SectionLabel>cursor</SectionLabel>
      <Group>
        <SegmentedRow
          label="cursor style"
          desc="how the active cell is drawn in each tab"
          value={settings.cursorStyle}
          options={CURSOR_OPTIONS}
          onChange={(v) => update("cursorStyle", v)}
        />
        <ToggleRow
          label="cursor blink"
          desc="animate the cursor when the terminal has focus"
          checked={settings.cursorBlink}
          onChange={(b) => update("cursorBlink", b)}
        />
      </Group>

      <SectionLabel>buffer</SectionLabel>
      <Group>
        <NumberRow
          label="scrollback"
          desc="lines kept in memory above the visible viewport, per tab"
          value={settings.scrollback}
          min={0}
          max={100000}
          step={500}
          suffix="lines"
          onChange={(v) => update("scrollback", v)}
        />
      </Group>

      <SectionLabel>shell</SectionLabel>
      <Group>
        <TextRow
          label="shell override"
          desc="path to the shell binary used for new tabs; leave empty to use $SHELL"
          value={settings.shellOverride}
          placeholder="/usr/bin/fish"
          onChange={(v) => update("shellOverride", v)}
          grow
        />
        <TextRow
          label="shell arguments"
          desc="space-separated flags appended to the spawn command for new tabs"
          value={settings.shellArgs}
          placeholder="--login -i"
          onChange={(v) => update("shellArgs", v)}
          grow
        />
      </Group>
    </>
  );
}
