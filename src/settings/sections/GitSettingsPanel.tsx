import { useEffect, useState } from "react";
import type { AiProviderId } from "../useSettings";
import { DEFAULT_COMMIT_PROMPT } from "../useSettings";
import { useAIKeys } from "../../hooks/useAIKeys";
import { listModels, type ModelInfo } from "../../hooks/useAI";
import { Field, Toggle, type VaultSectionProps } from "./_shared";

export function GitSettingsPanel({
  settings,
  update,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
}: VaultSectionProps) {
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

      <Field
        label="Default pull strategy"
        hint="initial selection in the pull dialog — can be changed per pull"
      >
        <div className="seg-control">
          {(["ff-only", "merge", "rebase"] as const).map((s) => (
            <button
              key={s}
              className={settings.gitPullStrategy === s ? "active" : ""}
              onClick={() => update("gitPullStrategy", s)}
            >
              {s}
            </button>
          ))}
        </div>
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
