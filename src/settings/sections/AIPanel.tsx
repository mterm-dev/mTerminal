import { useState } from "react";
import { useAIKeys } from "../../hooks/useAIKeys";
import { listModels, type ModelInfo } from "../../hooks/useAI";
import { useAiProviders } from "../../lib/ai-availability";
import { Field, Toggle, type VaultSectionProps } from "./_shared";
import { ProviderBlock } from "./ProviderBlock";
import { ModelPicker } from "../../extensions/components/ModelPicker";

interface Props extends VaultSectionProps {
  mcpStatus?: { running: boolean; socketPath: string | null };
}

/**
 * Known first-party SDK provider extensions. Settings shows an "Install"
 * button per entry when the matching provider hasn't been registered yet.
 * Third-party AI provider extensions installed from the marketplace appear
 * automatically below this list once they activate.
 *
 * `marketplaceId` matches the extension manifest id (what
 * `marketplace.install(id)` accepts), not the npm package name. The npm
 * publish names live in the mTerminal-extensions monorepo as
 * `@mterminal/ext-provider-<id>`.
 */
const KNOWN_SDK_EXTENSIONS: Array<{
  marketplaceId: string;
  providerId: string;
  label: string;
  description: string;
}> = [
  {
    marketplaceId: "provider-anthropic",
    providerId: "anthropic",
    label: "Anthropic",
    description: "Claude via the official @anthropic-ai/sdk package",
  },
  {
    marketplaceId: "provider-openai-codex",
    providerId: "openai-codex",
    label: "OpenAI Codex",
    description: "Codex agent SDK (@openai/codex-sdk) — text + agentic flows",
  },
  {
    marketplaceId: "provider-ollama",
    providerId: "ollama",
    label: "Ollama",
    description: "Local LLMs via the official ollama-js package",
  },
];

export function AIPanel({
  settings,
  update,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
  mcpStatus,
}: Props) {
  const providers = useAiProviders();
  const { hasKey, setKey, clearKey } = useAIKeys(vaultUnlocked);
  const [keyDraftFor, setKeyDraftFor] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [models, setModels] = useState<Record<string, ModelInfo[] | "loading" | "error">>({});

  const fetchModels = async (providerId: string) => {
    setModels((m) => ({ ...m, [providerId]: "loading" }));
    try {
      const list = await listModels(providerId);
      setModels((m) => ({ ...m, [providerId]: list }));
    } catch {
      setModels((m) => ({ ...m, [providerId]: "error" }));
    }
  };

  const submitKey = async (providerId: string) => {
    if (!draftValue.trim()) return;
    await setKey(providerId, draftValue.trim());
    setDraftValue("");
    setKeyDraftFor(null);
  };

  const installSdk = async (marketplaceId: string) => {
    const mt = (window as unknown as { mt?: { marketplace?: { install: (id: string, version?: string) => Promise<unknown> } } }).mt;
    if (!mt?.marketplace) {
      alert("Marketplace API not available — install the provider extension manually.");
      return;
    }
    try {
      await mt.marketplace.install(marketplaceId);
    } catch (err) {
      console.error(`[settings] install ${marketplaceId} failed:`, err);
      alert(`Install failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const ensureProviderConfig = (providerId: string, patch: { model?: string; baseUrl?: string }) => {
    const next = { ...(settings.aiProviderConfig ?? {}) };
    next[providerId] = { ...next[providerId], ...patch };
    update("aiProviderConfig", next);
  };

  const vaultBadge = !vaultExists
    ? "vault not initialised — click to create"
    : !vaultUnlocked
      ? "vault locked — click to unlock"
      : null;

  const currentCfg = settings.aiProviderConfig?.[settings.aiDefaultProvider] ?? {};

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

          {providers.length === 0 ? (
            <div className="settings-note">
              No AI providers installed. Install one of the official SDK extensions
              below to enable chat, command palette, and explain features.
            </div>
          ) : (
            <Field
              label="Default provider"
              hint="Picks the provider + model used by command palette and the chat panel"
            >
              <ModelPicker
                value={{
                  provider: settings.aiDefaultProvider,
                  model: currentCfg.model ?? "",
                  baseUrl: currentCfg.baseUrl,
                }}
                onChange={(v) => {
                  if (v.provider !== settings.aiDefaultProvider) {
                    update("aiDefaultProvider", v.provider);
                  }
                  ensureProviderConfig(v.provider, { model: v.model, baseUrl: v.baseUrl });
                }}
              />
            </Field>
          )}

          <div className="settings-section-h">SDK providers</div>

          {KNOWN_SDK_EXTENSIONS.map((sdk) => {
            const installed = providers.find((p) => p.id === sdk.providerId);
            if (!installed) {
              return (
                <div
                  key={sdk.marketplaceId}
                  className="settings-field"
                  style={{ flexDirection: "column", alignItems: "stretch" }}
                >
                  <div className="settings-field-label">
                    <span style={{ fontWeight: 600 }}>{sdk.label}</span>
                    <span className="settings-field-hint">not installed</span>
                  </div>
                  <div className="settings-field-control" style={{ flexDirection: "column", gap: 4 }}>
                    <div className="settings-note" style={{ marginBottom: 4 }}>
                      {sdk.description}
                    </div>
                    <button
                      className="ghost-btn"
                      style={{ alignSelf: "flex-start" }}
                      onClick={() => void installSdk(sdk.marketplaceId)}
                    >
                      install {sdk.label} SDK
                    </button>
                  </div>
                </div>
              );
            }
            const cfg = settings.aiProviderConfig?.[sdk.providerId] ?? {};
            const noKeyNeeded = installed.requiresVault === false;
            return (
              <ProviderBlock
                key={sdk.providerId}
                label={sdk.label}
                provider={sdk.providerId}
                hasKey={!!hasKey[sdk.providerId]}
                vaultUnlocked={vaultUnlocked}
                modelValue={cfg.model ?? ""}
                onModelChange={(v) => ensureProviderConfig(sdk.providerId, { model: v })}
                baseUrlValue={installed.requiresVault === false ? cfg.baseUrl ?? "" : undefined}
                onBaseUrlChange={(v) => ensureProviderConfig(sdk.providerId, { baseUrl: v })}
                keyDraftActive={keyDraftFor === sdk.providerId}
                onStartEdit={() => setKeyDraftFor(sdk.providerId)}
                onCancelEdit={() => setKeyDraftFor(null)}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                onSubmitKey={() => submitKey(sdk.providerId)}
                onClearKey={() => clearKey(sdk.providerId)}
                modelsState={models[sdk.providerId]}
                onFetchModels={() => fetchModels(sdk.providerId)}
                noKeyNeeded={noKeyNeeded}
                onRequestVault={onRequestVault}
              />
            );
          })}

          {/* Third-party providers (anything registered that we don't have a known card for). */}
          {providers
            .filter((p) => !KNOWN_SDK_EXTENSIONS.some((k) => k.providerId === p.id))
            .map((p) => {
              const cfg = settings.aiProviderConfig?.[p.id] ?? {};
              const noKeyNeeded = p.requiresVault === false;
              return (
                <ProviderBlock
                  key={p.id}
                  label={`${p.label} (${p.source})`}
                  provider={p.id}
                  hasKey={!!hasKey[p.id]}
                  vaultUnlocked={vaultUnlocked}
                  modelValue={cfg.model ?? ""}
                  onModelChange={(v) => ensureProviderConfig(p.id, { model: v })}
                  baseUrlValue={p.requiresVault === false ? cfg.baseUrl ?? "" : undefined}
                  onBaseUrlChange={(v) => ensureProviderConfig(p.id, { baseUrl: v })}
                  keyDraftActive={keyDraftFor === p.id}
                  onStartEdit={() => setKeyDraftFor(p.id)}
                  onCancelEdit={() => setKeyDraftFor(null)}
                  draftValue={draftValue}
                  setDraftValue={setDraftValue}
                  onSubmitKey={() => submitKey(p.id)}
                  onClearKey={() => clearKey(p.id)}
                  modelsState={models[p.id]}
                  onFetchModels={() => fetchModels(p.id)}
                  noKeyNeeded={noKeyNeeded}
                  onRequestVault={onRequestVault}
                />
              );
            })}

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
