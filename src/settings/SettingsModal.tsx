import { useEffect, useRef, useState } from "react";
import { THEMES } from "./themes";
import type { AiProviderId, CursorStyle, Settings } from "./useSettings";
import { useAIKeys } from "../hooks/useAIKeys";
import { listModels, type ModelInfo } from "../hooks/useAI";

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
  | "ai"
  | "remote"
  | "about";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          {(
            [
              ["appearance", "Appearance"],
              ["terminal", "Terminal"],
              ["shell", "Shell"],
              ["behavior", "Behavior"],
              ["ai", "AI"],
              ["remote", "Remote"],
              ["about", "About"],
            ] as [Section, string][]
          ).map(([k, label]) => (
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
            {section === "ai" && (
              <AIPanel
                settings={settings}
                update={update}
                vaultUnlocked={vaultUnlocked}
                vaultExists={vaultExists}
                onRequestVault={onRequestVault}
                mcpStatus={mcpStatus}
              />
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
  return {
    appearance: "Appearance",
    terminal: "Terminal",
    shell: "Shell",
    behavior: "Behavior",
    ai: "AI",
    remote: "Remote",
    about: "About",
  }[s];
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">
        <span>{label}</span>
        {hint && <span className="settings-field-hint">{hint}</span>}
      </div>
      <div className="settings-field-control">{children}</div>
    </div>
  );
}

function Appearance({ settings, update }: { settings: Settings; update: Props["update"] }) {
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
                } as React.CSSProperties
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

function TerminalPanel({ settings, update }: { settings: Settings; update: Props["update"] }) {
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

function ShellPanel({ settings, update }: { settings: Settings; update: Props["update"] }) {
  return (
    <>
      <Field
        label="Shell override"
        hint="Leave empty to use login shell from /etc/passwd"
      >
        <input
          type="text"
          value={settings.shellOverride}
          onChange={(e) => update("shellOverride", e.target.value)}
          placeholder="/bin/zsh"
        />
      </Field>
      <Field
        label="Shell arguments"
        hint="Space-separated. Example: -l for login shell"
      >
        <input
          type="text"
          value={settings.shellArgs}
          onChange={(e) => update("shellArgs", e.target.value)}
          placeholder=""
        />
      </Field>
      <div className="settings-note">
        Changes apply to <strong>new tabs</strong>. Existing tabs keep their current shell.
      </div>
    </>
  );
}

function BehaviorPanel({
  settings,
  update,
}: {
  settings: Settings;
  update: Props["update"];
}) {
  return (
    <>
      <Field
        label="Confirm close with multiple tabs"
        hint="Ask before quitting if more than one tab is open"
      >
        <Toggle
          checked={settings.confirmCloseMultipleTabs}
          onChange={(b) => update("confirmCloseMultipleTabs", b)}
        />
      </Field>
      <Field label="Copy on select" hint="Auto-copy selection to clipboard">
        <Toggle
          checked={settings.copyOnSelect}
          onChange={(b) => update("copyOnSelect", b)}
        />
      </Field>
      <Field
        label="mTerminal greeting"
        hint="Show themed banner on shell startup (fish only)"
      >
        <Toggle
          checked={settings.showGreeting}
          onChange={(b) => update("showGreeting", b)}
        />
      </Field>
    </>
  );
}

function RemotePanel({
  settings,
  update,
}: {
  settings: Settings;
  update: Props["update"];
}) {
  return (
    <>
      <Field
        label="Remote workspace"
        hint="adds an SSH workspace to the sidebar with saved hosts, key picker, and master-password protected vault for saved passwords"
      >
        <Toggle
          checked={settings.remoteWorkspaceEnabled}
          onChange={(b) => update("remoteWorkspaceEnabled", b)}
        />
      </Field>
      <div className="settings-note">
        when enabled, hosts are stored in <code>$XDG_CONFIG_HOME/mterminal/hosts.json</code>.
        saved passwords are encrypted with your master password
        (<code>vault.bin</code>) using Argon2id + XChaCha20-Poly1305.
        password auth requires <code>sshpass</code>; key auth and ssh-agent work without it.
        disabling this hides the sidebar section but does NOT delete saved data —
        re-enabling restores everything. running remote sessions are not killed.
      </div>
    </>
  );
}

function AIPanel({
  settings,
  update,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
  mcpStatus,
}: {
  settings: Settings;
  update: Props["update"];
  vaultUnlocked: boolean;
  vaultExists: boolean;
  onRequestVault: () => void;
  mcpStatus?: { running: boolean; socketPath: string | null };
}) {
  const { hasKey, setKey, clearKey } = useAIKeys(vaultUnlocked);
  type KeyedProvider = "anthropic" | "openai";
  const [keyDraft, setKeyDraft] = useState<{ provider: KeyedProvider | null }>({
    provider: null,
  });
  const [draftValue, setDraftValue] = useState("");
  const [models, setModels] = useState<Record<string, ModelInfo[] | "loading" | "error">>({});

  const fetchModels = async (provider: AiProviderId) => {
    setModels((m) => ({ ...m, [provider]: "loading" }));
    try {
      const baseUrl =
        provider === "openai"
          ? settings.aiOpenaiBaseUrl
          : provider === "ollama"
            ? settings.aiOllamaBaseUrl
            : undefined;
      const list = await listModels(provider, baseUrl);
      setModels((m) => ({ ...m, [provider]: list }));
    } catch {
      setModels((m) => ({ ...m, [provider]: "error" }));
    }
  };

  const submitKey = async () => {
    if (!keyDraft.provider || !draftValue.trim()) return;
    await setKey(keyDraft.provider, draftValue.trim());
    setDraftValue("");
    setKeyDraft({ provider: null });
  };

  const vaultBadge = !vaultExists
    ? "vault not initialised — click to create"
    : !vaultUnlocked
      ? "vault locked — click to unlock"
      : null;

  return (
    <>
      <Field label="Enable AI" hint="Master switch for AI features">
        <Toggle checked={settings.aiEnabled} onChange={(b) => update("aiEnabled", b)} />
      </Field>

      {settings.aiEnabled && (
        <>
          {vaultBadge && (
            <div className="settings-note" style={{ cursor: "pointer" }} onClick={onRequestVault}>
              {vaultBadge}. API keys are stored encrypted (Argon2id + XChaCha20-Poly1305) in the
              same vault as remote-host passwords.
            </div>
          )}

          <Field label="Default provider" hint="Used by command palette + chat panel by default">
            <div className="seg-control">
              {(["anthropic", "openai", "ollama"] as AiProviderId[]).map((p) => (
                <button
                  key={p}
                  className={settings.aiDefaultProvider === p ? "active" : ""}
                  onClick={() => update("aiDefaultProvider", p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </Field>

          <ProviderBlock
            label="Anthropic"
            provider="anthropic"
            hasKey={!!hasKey.anthropic}
            vaultUnlocked={vaultUnlocked}
            modelValue={settings.aiAnthropicModel}
            onModelChange={(v) => update("aiAnthropicModel", v)}
            keyDraftActive={keyDraft.provider === "anthropic"}
            onStartEdit={() => setKeyDraft({ provider: "anthropic" })}
            onCancelEdit={() => setKeyDraft({ provider: null })}
            draftValue={draftValue}
            setDraftValue={setDraftValue}
            onSubmitKey={submitKey}
            onClearKey={() => clearKey("anthropic")}
            modelsState={models.anthropic}
            onFetchModels={() => fetchModels("anthropic")}
          />

          <ProviderBlock
            label="OpenAI"
            provider="openai"
            hasKey={!!hasKey.openai}
            vaultUnlocked={vaultUnlocked}
            modelValue={settings.aiOpenaiModel}
            onModelChange={(v) => update("aiOpenaiModel", v)}
            baseUrlValue={settings.aiOpenaiBaseUrl}
            onBaseUrlChange={(v) => update("aiOpenaiBaseUrl", v)}
            keyDraftActive={keyDraft.provider === "openai"}
            onStartEdit={() => setKeyDraft({ provider: "openai" })}
            onCancelEdit={() => setKeyDraft({ provider: null })}
            draftValue={draftValue}
            setDraftValue={setDraftValue}
            onSubmitKey={submitKey}
            onClearKey={() => clearKey("openai")}
            modelsState={models.openai}
            onFetchModels={() => fetchModels("openai")}
          />

          <ProviderBlock
            label="Ollama (local)"
            provider="ollama"
            hasKey={true}
            vaultUnlocked={true}
            modelValue={settings.aiOllamaModel}
            onModelChange={(v) => update("aiOllamaModel", v)}
            baseUrlValue={settings.aiOllamaBaseUrl}
            onBaseUrlChange={(v) => update("aiOllamaBaseUrl", v)}
            modelsState={models.ollama}
            onFetchModels={() => fetchModels("ollama")}
            noKeyNeeded
          />

          <Field
            label="Attach context to chat"
            hint="Inject recent terminal output as context when asking AI"
          >
            <Toggle
              checked={settings.aiAttachContext}
              onChange={(b) => update("aiAttachContext", b)}
            />
          </Field>

          <Field
            label="Right-click explain"
            hint="Show 'explain' / 'ask AI' on text selection"
          >
            <Toggle
              checked={settings.aiExplainEnabled}
              onChange={(b) => update("aiExplainEnabled", b)}
            />
          </Field>

          <Field
            label="Detect Claude Code sessions"
            hint="Show badge on tabs running `claude` and notify on idle"
          >
            <Toggle
              checked={settings.claudeCodeDetectionEnabled}
              onChange={(b) => update("claudeCodeDetectionEnabled", b)}
            />
          </Field>

          <Field
            label="MCP server"
            hint="Expose mTerminal as a tool for external agents (Claude Code, Codex...)"
          >
            <Toggle
              checked={settings.mcpServerEnabled}
              onChange={(b) => update("mcpServerEnabled", b)}
            />
          </Field>
          {settings.mcpServerEnabled && mcpStatus && (
            <div className="settings-note">
              {mcpStatus.running && mcpStatus.socketPath ? (
                <>
                  <div>
                    socket: <code>{mcpStatus.socketPath}</code>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    add to claude code:
                    <pre
                      style={{
                        background: "color-mix(in oklch, currentColor 6%, transparent)",
                        padding: 6,
                        borderRadius: 4,
                        fontSize: 11,
                        overflow: "auto",
                        marginTop: 4,
                      }}
                    >
{`claude mcp add mterminal --transport stdio "socat - UNIX-CONNECT:${mcpStatus.socketPath}"`}
                    </pre>
                  </div>
                </>
              ) : (
                <span>starting MCP server...</span>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function ProviderBlock({
  label,
  hasKey,
  vaultUnlocked,
  modelValue,
  onModelChange,
  baseUrlValue,
  onBaseUrlChange,
  keyDraftActive,
  onStartEdit,
  onCancelEdit,
  draftValue,
  setDraftValue,
  onSubmitKey,
  onClearKey,
  modelsState,
  onFetchModels,
  noKeyNeeded,
}: {
  label: string;
  provider: AiProviderId;
  hasKey: boolean;
  vaultUnlocked: boolean;
  modelValue: string;
  onModelChange: (v: string) => void;
  baseUrlValue?: string;
  onBaseUrlChange?: (v: string) => void;
  keyDraftActive?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  draftValue?: string;
  setDraftValue?: (v: string) => void;
  onSubmitKey?: () => void;
  onClearKey?: () => void;
  modelsState?: ModelInfo[] | "loading" | "error";
  onFetchModels: () => void;
  noKeyNeeded?: boolean;
}) {
  return (
    <div className="settings-field" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="settings-field-label">
        <span style={{ fontWeight: 600 }}>{label}</span>
        {!noKeyNeeded && (
          <span className="settings-field-hint">
            {hasKey ? "key saved ✓" : vaultUnlocked ? "no key" : "vault locked"}
          </span>
        )}
      </div>

      <div className="settings-field-control" style={{ flexDirection: "column", gap: 8 }}>
        {!noKeyNeeded && !keyDraftActive && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ghost-btn" onClick={onStartEdit} disabled={!vaultUnlocked}>
              {hasKey ? "replace key" : "set key"}
            </button>
            {hasKey && (
              <button className="ghost-btn" onClick={onClearKey} disabled={!vaultUnlocked}>
                remove key
              </button>
            )}
          </div>
        )}

        {!noKeyNeeded && keyDraftActive && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              value={draftValue ?? ""}
              onChange={(e) => setDraftValue?.(e.target.value)}
              placeholder="paste API key"
              autoFocus
              style={{ flex: 1 }}
            />
            <button className="ghost-btn" onClick={onSubmitKey}>
              save
            </button>
            <button className="ghost-btn" onClick={onCancelEdit}>
              cancel
            </button>
          </div>
        )}

        {baseUrlValue !== undefined && (
          <input
            type="text"
            value={baseUrlValue}
            onChange={(e) => onBaseUrlChange?.(e.target.value)}
            placeholder="base url"
          />
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={modelValue}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="model id"
            style={{ flex: 1 }}
          />
          <button className="ghost-btn" onClick={onFetchModels}>
            list models
          </button>
        </div>

        {modelsState === "loading" && <div className="settings-note">loading...</div>}
        {modelsState === "error" && (
          <div className="settings-note">failed to fetch models</div>
        )}
        {Array.isArray(modelsState) && modelsState.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {modelsState.slice(0, 12).map((m) => (
              <button
                key={m.id}
                className="ghost-btn"
                onClick={() => onModelChange(m.id)}
                title={m.name}
                style={{ fontSize: 11 }}
              >
                {m.id}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function About() {
  return (
    <div className="settings-about">
      <div className="settings-about-name">mTerminal</div>
      <div className="settings-about-ver">v0.1.0</div>
      <p>Custom terminal emulator with grouped tabs.</p>
      <p className="dim">
        Built with Electron · React 19 · xterm.js · node-pty.
      </p>
      <p className="dim">
        <a
          href="https://github.com/arthurr0/mTerminal"
          target="_blank"
          rel="noreferrer"
        >
          github.com/arthurr0/mTerminal
        </a>
      </p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}
