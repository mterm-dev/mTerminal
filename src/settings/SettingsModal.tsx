import { useEffect, useRef, useState } from "react";
import { THEMES } from "./themes";
import type { AiProviderId, CursorStyle, Settings, VoiceEngineId } from "./useSettings";
import { DEFAULT_COMMIT_PROMPT } from "./useSettings";
import { useAIKeys } from "../hooks/useAIKeys";
import { listModels, type ModelInfo } from "../hooks/useAI";
import { open as openDialog } from "../lib/tauri-shim";
import { formatHotkey, specFromKeyboardEvent } from "../lib/hotkey";

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
              ["git", "Git Panel"],
              ["ai", "AI"],
              ["voice", "Voice to Text"],
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
            {section === "git" && (
              <GitSettingsPanel
                settings={settings}
                update={update}
                vaultUnlocked={vaultUnlocked}
                vaultExists={vaultExists}
                onRequestVault={onRequestVault}
              />
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
            {section === "voice" && (
              <VoicePanel
                settings={settings}
                update={update}
                vaultUnlocked={vaultUnlocked}
                vaultExists={vaultExists}
                onRequestVault={onRequestVault}
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
    git: "Git Panel",
    ai: "AI",
    voice: "Voice to Text",
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

function GitSettingsPanel({
  settings,
  update,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
}: {
  settings: Settings;
  update: Props["update"];
  vaultUnlocked: boolean;
  vaultExists: boolean;
  onRequestVault: () => void;
}) {
  const { hasKey, setKey, clearKey } = useAIKeys(vaultUnlocked);
  const [models, setModels] = useState<
    Record<string, ModelInfo[] | "loading" | "error">
  >({});
  const [keyDraftActive, setKeyDraftActive] = useState(false);
  const [keyDraftValue, setKeyDraftValue] = useState("");

  const baseUrlFor = (p: AiProviderId): string | undefined =>
    p === "openai"
      ? settings.gitCommitOpenaiBaseUrl
      : p === "ollama"
        ? settings.gitCommitOllamaBaseUrl
        : undefined;

  const modelKeyFor = (
    p: AiProviderId,
  ): "gitCommitAnthropicModel" | "gitCommitOpenaiModel" | "gitCommitOllamaModel" =>
    p === "anthropic"
      ? "gitCommitAnthropicModel"
      : p === "openai"
        ? "gitCommitOpenaiModel"
        : "gitCommitOllamaModel";

  const fetchModels = async (provider: AiProviderId) => {
    setModels((m) => ({ ...m, [provider]: "loading" }));
    try {
      const list = await listModels(provider, baseUrlFor(provider));
      setModels((m) => ({ ...m, [provider]: list }));
    } catch {
      setModels((m) => ({ ...m, [provider]: "error" }));
    }
  };

  useEffect(() => {
    if (!models[settings.gitCommitProvider]) {
      void fetchModels(settings.gitCommitProvider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.gitCommitProvider]);

  const provider = settings.gitCommitProvider;
  const modelKey = modelKeyFor(provider);
  const modelValue = settings[modelKey];
  const modelsState = models[provider];
  const needsKey = provider === "anthropic" || provider === "openai";
  const providerHasKey = needsKey ? !!hasKey[provider] : true;

  const submitKey = async () => {
    if (!needsKey || !keyDraftValue.trim()) return;
    await setKey(provider as "anthropic" | "openai", keyDraftValue.trim());
    setKeyDraftValue("");
    setKeyDraftActive(false);
  };

  const vaultBadge = !vaultExists
    ? "vault not initialised — click to create"
    : !vaultUnlocked
      ? "vault locked — click to unlock"
      : null;

  return (
    <>
      <Field
        label="Git panel"
        hint="show a git status, commit and push panel in the sidebar for the active terminal's working directory"
      >
        <Toggle
          checked={settings.gitPanelEnabled}
          onChange={(b) => update("gitPanelEnabled", b)}
        />
      </Field>

      <Field label="Default tree view" hint="show files as a directory tree by default">
        <Toggle
          checked={settings.gitPanelTreeView}
          onChange={(b) => update("gitPanelTreeView", b)}
        />
      </Field>

      <div className="settings-section-h">commit message ai</div>

      <Field
        label="Provider"
        hint="model used by the ✨ generate button next to the commit textarea"
      >
        <div className="seg-control">
          {(["anthropic", "openai", "ollama"] as AiProviderId[]).map((p) => (
            <button
              key={p}
              className={settings.gitCommitProvider === p ? "active" : ""}
              onClick={() => update("gitCommitProvider", p)}
            >
              {p}
            </button>
          ))}
        </div>
      </Field>

      {provider !== "anthropic" && (
        <Field
          label="Base URL"
          hint={
            provider === "ollama"
              ? "OpenAI-compatible endpoint (Ollama defaults to /v1)"
              : "OpenAI-compatible endpoint"
          }
        >
          <input
            type="text"
            value={
              provider === "openai"
                ? settings.gitCommitOpenaiBaseUrl
                : settings.gitCommitOllamaBaseUrl
            }
            onChange={(e) =>
              update(
                provider === "openai"
                  ? "gitCommitOpenaiBaseUrl"
                  : "gitCommitOllamaBaseUrl",
                e.target.value,
              )
            }
            placeholder="https://api.openai.com/v1"
          />
        </Field>
      )}

      {needsKey && (
        <Field
          label="API key"
          hint={
            providerHasKey
              ? "key saved in vault ✓ — same vault entry as the AI tab"
              : vaultUnlocked
                ? "no key set yet — paste your API key below"
                : "vault locked — unlock to manage keys"
          }
        >
          <div className="settings-key-wrap">
            {vaultBadge && (
              <div
                className="settings-note"
                style={{ cursor: "pointer", marginTop: 0 }}
                onClick={onRequestVault}
              >
                {vaultBadge}. keys are encrypted (Argon2id +
                XChaCha20-Poly1305) in the same vault as the AI tab.
              </div>
            )}
            {!keyDraftActive && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="ghost-btn"
                  onClick={() => setKeyDraftActive(true)}
                  disabled={!vaultUnlocked}
                >
                  {providerHasKey ? "replace key" : "set key"}
                </button>
                {providerHasKey && (
                  <button
                    className="ghost-btn"
                    onClick={() =>
                      void clearKey(provider as "anthropic" | "openai")
                    }
                    disabled={!vaultUnlocked}
                  >
                    remove key
                  </button>
                )}
              </div>
            )}
            {keyDraftActive && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="password"
                  value={keyDraftValue}
                  onChange={(e) => setKeyDraftValue(e.target.value)}
                  placeholder={
                    provider === "anthropic"
                      ? "sk-ant-…"
                      : "sk-…"
                  }
                  autoFocus
                  style={{ flex: 1 }}
                />
                <button className="ghost-btn" onClick={() => void submitKey()}>
                  save
                </button>
                <button
                  className="ghost-btn"
                  onClick={() => {
                    setKeyDraftActive(false);
                    setKeyDraftValue("");
                  }}
                >
                  cancel
                </button>
              </div>
            )}
          </div>
        </Field>
      )}

      <Field
        label="Model"
        hint={
          needsKey
            ? providerHasKey
              ? "fetched live from the provider — pick from the list"
              : "set an API key first to fetch available models"
            : "no key needed — runs against the daemon at base URL"
        }
      >
        <div className="settings-model-picker">
          <div className="settings-model-row">
            <input
              type="text"
              value={modelValue}
              onChange={(e) => update(modelKey, e.target.value)}
              placeholder="model id"
            />
            <button
              className="ghost-btn"
              onClick={() => void fetchModels(provider)}
              disabled={modelsState === "loading"}
            >
              {modelsState === "loading" ? "loading…" : "refresh list"}
            </button>
          </div>
          {modelsState === "error" && (
            <div className="settings-note">
              failed to fetch models — check api key (AI tab) or base URL
            </div>
          )}
          {Array.isArray(modelsState) && modelsState.length === 0 && (
            <div className="settings-note">no models returned</div>
          )}
          {Array.isArray(modelsState) && modelsState.length > 0 && (
            <div className="settings-model-list">
              {modelsState.map((m) => (
                <button
                  key={m.id}
                  className={`ghost-btn small ${m.id === modelValue ? "active" : ""}`}
                  onClick={() => update(modelKey, m.id)}
                  title={m.name}
                >
                  {m.id}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      <Field
        label="System prompt"
        hint="instructs the model how to write the commit message"
      >
        <div className="settings-prompt-wrap">
          <textarea
            className="settings-textarea"
            value={settings.gitCommitSystemPrompt}
            onChange={(e) => update("gitCommitSystemPrompt", e.target.value)}
            rows={8}
            spellCheck={false}
          />
          <button
            className="ghost-btn small"
            onClick={() => update("gitCommitSystemPrompt", DEFAULT_COMMIT_PROMPT)}
            disabled={settings.gitCommitSystemPrompt === DEFAULT_COMMIT_PROMPT}
          >
            reset to default
          </button>
        </div>
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

function VoicePanel({
  settings,
  update,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
}: {
  settings: Settings;
  update: Props["update"];
  vaultUnlocked: boolean;
  vaultExists: boolean;
  onRequestVault: () => void;
}) {
  const { hasKey } = useAIKeys(vaultUnlocked);

  const pickFile = async (
    key: "voiceWhisperCppBinPath" | "voiceWhisperCppModelPath",
    title: string,
  ) => {
    try {
      const picked = await openDialog({ title });
      if (typeof picked === "string" && picked.length > 0) {
        update(key, picked);
      }
    } catch {}
  };

  const onHotkeyKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      update("voiceHotkey", "");
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") return;
    e.preventDefault();
    e.stopPropagation();
    const spec = specFromKeyboardEvent(e.nativeEvent);
    if (!spec) return;
    update("voiceHotkey", formatHotkey(spec));
  };

  const openaiKeyOk = hasKey.openai === true;
  const showOpenAi = settings.voiceEngine === "openai";
  const showWhisper = settings.voiceEngine === "whisper-cpp";

  return (
    <>
      <Field label="Enable voice to text" hint="Master switch for dictation">
        <Toggle
          checked={settings.voiceEnabled}
          onChange={(b) => update("voiceEnabled", b)}
        />
      </Field>

      {settings.voiceEnabled && (
        <>
          <Field label="Engine" hint="Local whisper.cpp or OpenAI Whisper API">
            <div className="seg-control">
              {(["whisper-cpp", "openai"] as VoiceEngineId[]).map((p) => (
                <button
                  key={p}
                  className={settings.voiceEngine === p ? "active" : ""}
                  onClick={() => update("voiceEngine", p)}
                >
                  {p === "whisper-cpp" ? "whisper.cpp (local)" : "OpenAI Whisper"}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Language"
            hint='ISO code (e.g. "pl", "en") or "auto" to detect'
          >
            <input
              type="text"
              value={settings.voiceLanguage}
              onChange={(e) => update("voiceLanguage", e.target.value)}
              placeholder="auto"
            />
          </Field>

          <Field
            label="Hotkey"
            hint="Press a key combo to set, Backspace clears"
          >
            <input
              type="text"
              value={settings.voiceHotkey}
              onKeyDown={onHotkeyKey}
              onChange={() => {}}
              placeholder="Ctrl+Shift+M"
              readOnly
              style={{ caretColor: "transparent" }}
            />
          </Field>

          <Field label="Show microphone in status bar">
            <Toggle
              checked={settings.voiceShowMicButton}
              onChange={(b) => update("voiceShowMicButton", b)}
            />
          </Field>

          <Field
            label="Auto-insert space"
            hint="Adds a space before/after dictation when needed"
          >
            <Toggle
              checked={settings.voiceAutoSpace}
              onChange={(b) => update("voiceAutoSpace", b)}
            />
          </Field>

          {showWhisper && (
            <>
              <div className="settings-note">
                whisper.cpp runs fully offline. Build it from{" "}
                <a
                  href="https://github.com/ggml-org/whisper.cpp"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/ggml-org/whisper.cpp
                </a>{" "}
                and download a model (<code>ggml-base.bin</code> works well for many
                languages including Polish).
              </div>

              <Field
                label="whisper.cpp binary"
                hint="Path to whisper-cli (or main) executable"
              >
                <div style={{ display: "flex", gap: 8, flex: 1 }}>
                  <input
                    type="text"
                    value={settings.voiceWhisperCppBinPath}
                    onChange={(e) =>
                      update("voiceWhisperCppBinPath", e.target.value)
                    }
                    placeholder="/path/to/whisper.cpp/build/bin/whisper-cli"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="ghost-btn"
                    onClick={() =>
                      pickFile("voiceWhisperCppBinPath", "select whisper-cli binary")
                    }
                  >
                    pick…
                  </button>
                </div>
              </Field>

              <Field
                label="whisper.cpp model"
                hint="Path to ggml-*.bin model file"
              >
                <div style={{ display: "flex", gap: 8, flex: 1 }}>
                  <input
                    type="text"
                    value={settings.voiceWhisperCppModelPath}
                    onChange={(e) =>
                      update("voiceWhisperCppModelPath", e.target.value)
                    }
                    placeholder="/path/to/whisper.cpp/models/ggml-base.bin"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="ghost-btn"
                    onClick={() =>
                      pickFile(
                        "voiceWhisperCppModelPath",
                        "select whisper.cpp model file",
                      )
                    }
                  >
                    pick…
                  </button>
                </div>
              </Field>
            </>
          )}

          {showOpenAi && (
            <>
              {!vaultExists && (
                <div
                  className="settings-note"
                  style={{ cursor: "pointer" }}
                  onClick={onRequestVault}
                >
                  vault not initialised — click to create. OpenAI key is read from
                  the same vault as the AI panel.
                </div>
              )}
              {vaultExists && !vaultUnlocked && (
                <div
                  className="settings-note"
                  style={{ cursor: "pointer" }}
                  onClick={onRequestVault}
                >
                  vault locked — click to unlock so the OpenAI key can be used.
                </div>
              )}
              {vaultUnlocked && !openaiKeyOk && (
                <div className="settings-note">
                  no OpenAI API key — set one in Settings → AI first.
                </div>
              )}
              {vaultUnlocked && openaiKeyOk && (
                <div className="settings-note">OpenAI key found ✓</div>
              )}

              <Field label="Whisper model" hint="Default: whisper-1">
                <input
                  type="text"
                  value={settings.voiceOpenaiModel}
                  onChange={(e) => update("voiceOpenaiModel", e.target.value)}
                  placeholder="whisper-1"
                />
              </Field>

              <Field label="OpenAI base URL">
                <input
                  type="text"
                  value={settings.voiceOpenaiBaseUrl}
                  onChange={(e) => update("voiceOpenaiBaseUrl", e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </Field>
            </>
          )}

          <div className="settings-note">
            click the microphone in the status bar (or press the hotkey) to start
            recording, click again to stop. text goes to the focused input/textarea,
            or to the active terminal if no input is focused.
          </div>
        </>
      )}
    </>
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
