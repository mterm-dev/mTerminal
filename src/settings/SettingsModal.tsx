import { useRef, useState } from "react";
import type { Settings } from "./useSettings";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { Appearance } from "./sections/Appearance";
import { TerminalPanel } from "./sections/TerminalPanel";
import { ShellPanel } from "./sections/ShellPanel";
import { BehaviorPanel } from "./sections/BehaviorPanel";
import { GitSettingsPanel } from "./sections/GitSettingsPanel";
import { RemotePanel } from "./sections/RemotePanel";
import { AIPanel } from "./sections/AIPanel";
import { VoicePanel } from "./sections/VoicePanel";
import { About } from "./sections/About";

interface Props {
  settings: Settings;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  reset: () => void;
  onClose: () => void;
  vaultUnlocked: boolean;
  vaultExists: boolean;
  onRequestVault: () => void;
  mcpStatus?: { running: boolean; socketPath: string | null };
}

type Section =
  | "appearance"
  | "terminal"
  | "shell"
  | "behavior"
  | "git"
  | "ai"
  | "voice"
  | "remote"
  | "about";

const SECTIONS: ReadonlyArray<readonly [Section, string]> = [
  ["appearance", "Appearance"],
  ["terminal", "Terminal"],
  ["shell", "Shell"],
  ["behavior", "Behavior"],
  ["git", "Git Panel"],
  ["ai", "AI"],
  ["voice", "Voice to Text"],
  ["remote", "Remote"],
  ["about", "About"],
];

export function SettingsModal({
  settings,
  update,
  reset,
  onClose,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
  mcpStatus,
}: Props) {
  const [section, setSection] = useState<Section>("appearance");
  const downOnOverlay = useRef(false);

  useEscapeKey(onClose);

  const vaultProps = { vaultUnlocked, vaultExists, onRequestVault };

  return (
    <div
      className="settings-overlay"
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnOverlay.current && e.target === e.currentTarget) onClose();
        downOnOverlay.current = false;
      }}
    >
      <div className="settings-dialog" role="dialog" aria-label="Settings">
        <aside className="settings-nav">
          <div className="settings-nav-h">Settings</div>
          {SECTIONS.map(([k, label]) => (
            <button
              key={k}
              className={`settings-nav-item ${section === k ? "active" : ""}`}
              onClick={() => setSection(k)}
            >
              {label}
            </button>
          ))}
          <div className="settings-nav-foot">
            <button className="ghost-btn" onClick={reset}>
              reset all
            </button>
          </div>
        </aside>

        <main className="settings-body">
          <header className="settings-body-h">
            <span>{labelFor(section)}</span>
            <button className="winctl-btn" aria-label="close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>

          <div className="settings-scroll">
            {section === "appearance" && (
              <Appearance settings={settings} update={update} />
            )}
            {section === "terminal" && (
              <TerminalPanel settings={settings} update={update} />
            )}
            {section === "shell" && (
              <ShellPanel settings={settings} update={update} />
            )}
            {section === "behavior" && (
              <BehaviorPanel settings={settings} update={update} />
            )}
            {section === "git" && (
              <GitSettingsPanel settings={settings} update={update} {...vaultProps} />
            )}
            {section === "ai" && (
              <AIPanel
                settings={settings}
                update={update}
                {...vaultProps}
                mcpStatus={mcpStatus}
              />
            )}
            {section === "voice" && (
              <VoicePanel settings={settings} update={update} {...vaultProps} />
            )}
            {section === "remote" && (
              <RemotePanel settings={settings} update={update} />
            )}
            {section === "about" && <About />}
          </div>
        </main>
      </div>
    </div>
  );
}

function labelFor(s: Section): string {
  return SECTIONS.find(([k]) => k === s)?.[1] ?? s;
}
