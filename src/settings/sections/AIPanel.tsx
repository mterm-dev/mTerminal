import { useState } from "react";
import type { AiProviderId } from "../useSettings";
import { useAIKeys } from "../../hooks/useAIKeys";
import { listModels, type ModelInfo } from "../../hooks/useAI";
import { Field, Toggle, type VaultSectionProps } from "./_shared";
import { ProviderBlock } from "./ProviderBlock";
import { ModelPicker } from "../../extensions/components/ModelPicker";

interface Props extends VaultSectionProps {
  mcpStatus?: { running: boolean; socketPath: string | null };
}

export function AIPanel({
  settings,
  update,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
  mcpStatus,
}: Props) {
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

          <Field
            label="Default provider"
            hint="Picks the provider + model used by command palette and the chat panel"
          >
            <ModelPicker
              value={{
                provider: settings.aiDefaultProvider,
                model:
                  settings.aiDefaultProvider === "anthropic"
                    ? settings.aiAnthropicModel
                    : settings.aiDefaultProvider === "openai"
                      ? settings.aiOpenaiModel
                      : settings.aiOllamaModel,
                baseUrl:
                  settings.aiDefaultProvider === "openai"
                    ? settings.aiOpenaiBaseUrl
                    : settings.aiDefaultProvider === "ollama"
                      ? settings.aiOllamaBaseUrl
                      : undefined,
              }}
              onChange={(v) => {
                if (v.provider !== settings.aiDefaultProvider) {
                  update("aiDefaultProvider", v.provider);
                }
                if (v.provider === "anthropic") {
                  update("aiAnthropicModel", v.model);
                } else if (v.provider === "openai") {
                  update("aiOpenaiModel", v.model);
                  if (v.baseUrl !== undefined)
                    update("aiOpenaiBaseUrl", v.baseUrl);
                } else {
                  update("aiOllamaModel", v.model);
                  if (v.baseUrl !== undefined)
                    update("aiOllamaBaseUrl", v.baseUrl);
                }
              }}
            />
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
            onRequestVault={onRequestVault}
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
            onRequestVault={onRequestVault}
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
