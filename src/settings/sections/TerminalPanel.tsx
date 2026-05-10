import { useEffect, useMemo, useState } from "react";
import type { CursorStyle, ShellProfile } from "../useSettings";
import { Field, Group, SectionLabel, type SectionProps } from "./_shared";
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
          desc="Path to the shell binary used for new tabs without a profile; leave empty to use $SHELL"
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

      <SectionLabel>Profiles</SectionLabel>
      <Group>
        <ShellProfilesEditor
          profiles={settings.shellProfiles}
          defaultId={settings.defaultShellProfileId}
          onChange={(profiles, defaultId) => {
            update("shellProfiles", profiles);
            update("defaultShellProfileId", defaultId);
          }}
        />
      </Group>
    </>
  );
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface ShellProfilesEditorProps {
  profiles: ShellProfile[];
  defaultId: string | null;
  onChange: (profiles: ShellProfile[], defaultId: string | null) => void;
}

function ShellProfilesEditor({
  profiles,
  defaultId,
  onChange,
}: ShellProfilesEditorProps) {
  const isWindows = useMemo(
    () => (typeof window !== "undefined" ? window.mt?.platform === "win32" : false),
    [],
  );
  const [showWslPicker, setShowWslPicker] = useState(false);
  const [distros, setDistros] = useState<
    Array<{ name: string; default: boolean; version: 1 | 2; state: string }>
  >([]);
  const [loadingDistros, setLoadingDistros] = useState(false);

  useEffect(() => {
    if (!showWslPicker) return;
    let cancelled = false;
    setLoadingDistros(true);
    window.mt.wsl
      .listDistros()
      .then((list) => {
        if (!cancelled) setDistros(list);
      })
      .catch(() => {
        if (!cancelled) setDistros([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDistros(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showWslPicker]);

  function commit(next: ShellProfile[], nextDefault: string | null) {
    const safeDefault =
      nextDefault && next.some((p) => p.id === nextDefault) ? nextDefault : null;
    onChange(next, safeDefault);
  }

  function updateProfile(id: string, patch: Partial<ShellProfile>) {
    const next = profiles.map((p) => (p.id === id ? { ...p, ...patch } : p));
    commit(next, defaultId);
  }

  function removeProfile(id: string) {
    const next = profiles.filter((p) => p.id !== id);
    commit(next, defaultId === id ? null : defaultId);
  }

  function setDefault(id: string | null) {
    commit(profiles, id);
  }

  function addCustom() {
    const id = makeId();
    const profile: ShellProfile = {
      id,
      name: "custom shell",
      kind: "native",
      shell: "",
      args: "",
    };
    commit([...profiles, profile], defaultId);
  }

  function addWsl(distroName: string) {
    const id = makeId();
    const profile: ShellProfile = {
      id,
      name: `WSL: ${distroName}`,
      kind: "wsl",
      shell: `wsl://${distroName}`,
      args: "",
      wslDistro: distroName,
    };
    commit([...profiles, profile], defaultId);
    setShowWslPicker(false);
  }

  return (
    <>
      {profiles.length === 0 && (
        <Field
          label="No profiles defined"
          desc="Profiles let you keep multiple shell configurations and switch between them per tab. Right-click + tab in the sidebar to pick a profile."
        >
          <span className="st-desc">—</span>
        </Field>
      )}
      {profiles.map((p) => (
        <Field
          key={p.id}
          label={p.name}
          desc={
            p.kind === "wsl"
              ? `WSL distro: ${p.wslDistro ?? "default"}`
              : "Custom shell"
          }
          stack
        >
          <div className="st-stack-row">
            <input
              className="st-input"
              value={p.name}
              onChange={(e) => updateProfile(p.id, { name: e.target.value })}
              placeholder="profile name"
            />
            {p.kind === "native" && (
              <input
                className="st-input"
                value={p.shell}
                onChange={(e) => updateProfile(p.id, { shell: e.target.value })}
                placeholder="shell path (e.g. C:\\Windows\\System32\\cmd.exe)"
              />
            )}
            <input
              className="st-input"
              value={p.args}
              onChange={(e) => updateProfile(p.id, { args: e.target.value })}
              placeholder="arguments (space-separated)"
            />
            <div className="st-stack-row st-stack-row-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setDefault(defaultId === p.id ? null : p.id)}
              >
                {defaultId === p.id ? "default ✓" : "set as default"}
              </button>
              <button
                type="button"
                className="ghost-btn danger"
                onClick={() => removeProfile(p.id)}
              >
                remove
              </button>
            </div>
          </div>
        </Field>
      ))}
      <Field label="Add profile" desc="Define a new shell profile">
        <div className="st-stack-row st-stack-row-actions">
          <button type="button" className="ghost-btn" onClick={addCustom}>
            add custom
          </button>
          {isWindows && (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setShowWslPicker((v) => !v)}
            >
              {showWslPicker ? "cancel" : "add WSL profile"}
            </button>
          )}
        </div>
      </Field>
      {isWindows && showWslPicker && (
        <Field
          label={loadingDistros ? "Loading distros…" : "Pick a WSL distro"}
          stack
        >
          {!loadingDistros && distros.length === 0 && (
            <span className="st-desc">
              No distros found. Install one via{" "}
              <code>wsl --install -d Ubuntu</code> from PowerShell first.
            </span>
          )}
          {distros.map((d) => (
            <button
              key={d.name}
              type="button"
              className="ghost-btn"
              onClick={() => addWsl(d.name)}
            >
              {d.name}
              {d.default ? " (default)" : ""} · v{d.version} · {d.state}
            </button>
          ))}
        </Field>
      )}
    </>
  );
}
