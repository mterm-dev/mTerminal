import { useEffect, useRef, useState } from "react";
import type { Settings } from "./useSettings";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { Appearance } from "./sections/Appearance";
import { TerminalPanel } from "./sections/TerminalPanel";
import { ShellPanel } from "./sections/ShellPanel";
import { BehaviorPanel } from "./sections/BehaviorPanel";
import { RemotePanel } from "./sections/RemotePanel";
import { AIPanel } from "./sections/AIPanel";
import { VoicePanel } from "./sections/VoicePanel";
import {
  ExtensionsOverview,
  ExtensionSettingsForm,
} from "./sections/ExtensionsPanel";
import { About } from "./sections/About";
import { getRendererHost } from "../extensions";
import {
  getSettingsSchemaRegistry,
  type SettingsSchemaEntry,
} from "../extensions/registries/settings-schema";

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

/**
 * Section identifiers. Top-level sections are flat strings; per-extension
 * sub-sections take the shape `extension:<id>` so navigation can stay in
 * useState<string>.
 */
type CoreSection =
  | "appearance"
  | "terminal"
  | "shell"
  | "behavior"
  | "ai"
  | "voice"
  | "remote"
  | "extensions"
  | "about";

type Section = CoreSection | `extension:${string}`;

const SECTIONS: ReadonlyArray<readonly [CoreSection, string]> = [
  ["appearance", "Appearance"],
  ["terminal", "Terminal"],
  ["shell", "Shell"],
  ["behavior", "Behavior"],
  ["ai", "AI"],
  ["voice", "Voice to Text"],
  ["remote", "Remote"],
  ["extensions", "Extensions"],
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
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const downOnOverlay = useRef(false);

  useEscapeKey(onClose);

  const [extEntries, setExtEntries] = useState<SettingsSchemaEntry[]>(() =>
    getSettingsSchemaRegistry().list(),
  );
  const [loadedCount, setLoadedCount] = useState<number>(
    () => getRendererHost().list().filter((s) => s.state === "active").length,
  );
  useEffect(() => {
    const offSchema = getSettingsSchemaRegistry().subscribe(() => {
      setExtEntries(getSettingsSchemaRegistry().list());
    }).dispose;
    const offHost = getRendererHost().subscribe(() => {
      setLoadedCount(
        getRendererHost().list().filter((s) => s.state === "active").length,
      );
    });
    return () => {
      offSchema();
      offHost();
    };
  }, []);

  // If the user is sitting on a per-extension page and that extension goes
  // away (uninstalled / disabled), bounce them back to the overview so the
  // dead `extension:<id>` doesn't render an empty page.
  useEffect(() => {
    if (!section.startsWith("extension:")) return;
    const id = section.slice("extension:".length);
    if (!extEntries.find((e) => e.extId === id)) {
      setSection("extensions");
    }
  }, [section, extEntries]);

  const vaultProps = { vaultUnlocked, vaultExists, onRequestVault };

  const isExtensionSub = section.startsWith("extension:");
  const currentExtId = isExtensionSub ? section.slice("extension:".length) : null;
  const currentExtEntry = currentExtId
    ? extEntries.find((e) => e.extId === currentExtId)
    : null;

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
          {SECTIONS.map(([k, label]) => {
            if (k === "extensions") {
              const isActive = section === "extensions" || isExtensionSub;
              return (
                <div key={k}>
                  <button
                    className={`settings-nav-item ${isActive ? "active" : ""}`}
                    onClick={() => {
                      setExtensionsOpen((v) => !v);
                      setSection("extensions");
                    }}
                    aria-expanded={extensionsOpen}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span>{label}</span>
                    <span
                      className="settings-nav-counter"
                      title={`${loadedCount} loaded`}
                    >
                      {loadedCount}
                    </span>
                  </button>
                  {extensionsOpen && (
                    <div className="settings-nav-sub">
                      {extEntries.length === 0 && (
                        <div className="settings-nav-empty">
                          no extension settings yet
                        </div>
                      )}
                      {extEntries.map((entry) => {
                        const subKey = `extension:${entry.extId}` as const;
                        return (
                          <button
                            key={entry.extId}
                            className={`settings-nav-item sub ${
                              section === subKey ? "active" : ""
                            }`}
                            onClick={() => setSection(subKey)}
                            title={entry.extId}
                          >
                            {entry.displayName}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={k}
                className={`settings-nav-item ${section === k ? "active" : ""}`}
                onClick={() => setSection(k)}
              >
                {label}
              </button>
            );
          })}
          <div className="settings-nav-foot">
            <button className="ghost-btn" onClick={reset}>
              reset all
            </button>
          </div>
        </aside>

        <main className="settings-body">
          <header className="settings-body-h">
            <span>{headerLabel(section, currentExtEntry)}</span>
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
            {section === "extensions" && (
              <ExtensionsOverview
                onPickExtension={(extId) => {
                  setExtensionsOpen(true);
                  setSection(`extension:${extId}`);
                }}
              />
            )}
            {isExtensionSub && currentExtId && (
              <ExtensionSettingsForm
                extId={currentExtId}
                settings={settings}
                update={update}
              />
            )}
            {section === "about" && <About />}
          </div>
        </main>
      </div>
    </div>
  );
}

function headerLabel(s: Section, ext: SettingsSchemaEntry | null | undefined): string {
  if (s.startsWith("extension:")) {
    return `Extensions › ${ext?.displayName ?? s.slice("extension:".length)}`;
  }
  return SECTIONS.find(([k]) => k === s)?.[1] ?? s;
}
