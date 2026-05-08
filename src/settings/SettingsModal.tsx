import { useEffect, useRef, useState } from "react";
import type { Settings } from "./useSettings";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { Appearance } from "./sections/Appearance";
import { TerminalPanel } from "./sections/TerminalPanel";
import { GeneralPanel } from "./sections/GeneralPanel";
import { VaultPanel } from "./sections/VaultPanel";
import { AIPanel } from "./sections/AIPanel";
import { VoicePanel } from "./sections/VoicePanel";
import { DangerZone } from "./sections/DangerZone";
import {
  ExtensionsOverview,
  ExtensionSettingsForm,
} from "./sections/ExtensionsPanel";
import { About } from "./sections/About";
import { SECTION_ICONS } from "./sectionIcons";
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
  onOpenMarketplace?: () => void;
}

type CoreSection =
  | "appearance"
  | "terminal"
  | "general"
  | "vault"
  | "ai"
  | "voice"
  | "extensions"
  | "danger"
  | "about";

type Section = CoreSection | `extension:${string}`;

const SECTIONS: ReadonlyArray<readonly [CoreSection, string]> = [
  ["appearance", "appearance"],
  ["terminal", "terminal & shell"],
  ["general", "general"],
  ["vault", "vault"],
  ["ai", "ai"],
  ["voice", "voice"],
  ["extensions", "extensions"],
  ["danger", "danger zone"],
  ["about", "about"],
];

const SEPARATOR_BEFORE: ReadonlySet<CoreSection> = new Set(["danger"]);

export function SettingsModal({
  settings,
  update,
  reset,
  onClose,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
  mcpStatus,
  onOpenMarketplace,
}: Props) {
  const [section, setSection] = useState<Section>("appearance");
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const downOnOverlay = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!section.startsWith("extension:")) return;
    const id = section.slice("extension:".length);
    if (!extEntries.find((e) => e.extId === id)) {
      setSection("extensions");
    }
  }, [section, extEntries]);

  // Focus trap: Tab cycles within the dialog.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const arr = Array.from(focusable).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
      );
      if (arr.length === 0) return;
      const first = arr[0];
      const last = arr[arr.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKey);
    return () => dialog.removeEventListener("keydown", onKey);
  }, []);

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
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="settings"
      >
        <aside className="settings-nav">
          <div className="settings-nav-h">settings</div>
          {SECTIONS.map(([k, label]) => {
            const sep = SEPARATOR_BEFORE.has(k) ? (
              <div key={`sep-${k}`} className="settings-nav-sep" aria-hidden="true" />
            ) : null;

            const icon = SECTION_ICONS[k];

            if (k === "extensions") {
              const isActive = section === "extensions" || isExtensionSub;
              return (
                <div key={k}>
                  {sep}
                  <button
                    className={`settings-nav-item ${isActive ? "active" : ""}`}
                    onClick={() => {
                      setExtensionsOpen((v) => !v);
                      setSection("extensions");
                    }}
                    aria-expanded={extensionsOpen}
                  >
                    <span className="settings-nav-icon">{icon}</span>
                    <span style={{ flex: 1 }}>{label}</span>
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
                            <span className="settings-nav-icon" />
                            <span>{entry.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={k}>
                {sep}
                <button
                  className={`settings-nav-item ${section === k ? "active" : ""}`}
                  onClick={() => setSection(k)}
                >
                  <span className="settings-nav-icon">{icon}</span>
                  <span>{label}</span>
                </button>
              </div>
            );
          })}
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

          <div className="settings-scroll st-body">
            {section === "appearance" && (
              <Appearance settings={settings} update={update} />
            )}
            {section === "terminal" && (
              <TerminalPanel settings={settings} update={update} />
            )}
            {section === "general" && (
              <GeneralPanel settings={settings} update={update} />
            )}
            {section === "vault" && (
              <VaultPanel settings={settings} update={update} />
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
            {section === "extensions" && (
              <ExtensionsOverview
                onPickExtension={(extId) => {
                  setExtensionsOpen(true);
                  setSection(`extension:${extId}`);
                }}
                onOpenMarketplace={onOpenMarketplace}
              />
            )}
            {isExtensionSub && currentExtId && (
              <ExtensionSettingsForm
                extId={currentExtId}
                settings={settings}
                update={update}
              />
            )}
            {section === "danger" && <DangerZone onResetSettings={reset} />}
            {section === "about" && <About />}
          </div>
        </main>
      </div>
    </div>
  );
}

function headerLabel(s: Section, ext: SettingsSchemaEntry | null | undefined): string {
  if (s.startsWith("extension:")) {
    return `extensions › ${ext?.displayName ?? s.slice("extension:".length)}`;
  }
  return SECTIONS.find(([k]) => k === s)?.[1] ?? s;
}
