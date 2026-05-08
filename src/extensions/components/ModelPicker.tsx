/**
 * Shared provider + model picker.
 *
 * Used by:
 *   - AiBindingCard (extension AI bindings flow)
 *   - AIPanel (core "Default provider" + active model)
 *
 * Provider list is dynamic — comes from whichever AI provider extensions
 * the user has installed. Models are auto-fetched via `listModels(provider)`
 * on mount and whenever the provider changes; if the SDK call fails we fall
 * back to the static list declared by the provider extension. The user can
 * always type a custom model id (Anthropic ships unlisted preview models,
 * Ollama exposes whatever the local server has pulled, …) — the input is
 * always editable and the picked pill just sets its value.
 */

import { useEffect, useState } from "react";
import { useAiProviders } from "../../lib/ai-availability";
import { listModels, type ModelInfo } from "../../hooks/useAI";

export type AiProviderId = string;

export interface ModelPickerValue {
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
}

interface Props {
  /** Optional whitelist of provider ids to show. Default: every registered provider. */
  providers?: AiProviderId[];
  value: ModelPickerValue;
  onChange: (next: ModelPickerValue) => void;
  /** Optional defaults per provider — used when user switches providers. */
  defaultModels?: Record<string, string>;
  /** Show the base URL row. Default: only when the provider has a baseUrl currently set. */
  showBaseUrl?: boolean;
}

type ModelsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; models: ModelInfo[] }
  | { kind: "fallback"; models: ModelInfo[] }
  | { kind: "error" };

export function ModelPicker({
  providers,
  value,
  onChange,
  defaultModels,
  showBaseUrl,
}: Props) {
  const all = useAiProviders();
  const filtered = providers ? all.filter((p) => providers.includes(p.id)) : all;
  const current = filtered.find((p) => p.id === value.provider);

  const [models, setModels] = useState<ModelsState>({ kind: "idle" });
  const [showAll, setShowAll] = useState(false);

  const showBase =
    showBaseUrl !== undefined ? showBaseUrl : value.baseUrl !== undefined && value.baseUrl !== "";

  const fetchModels = async (providerId: string, manual: boolean): Promise<void> => {
    if (!providerId) return;
    setModels({ kind: "loading" });
    try {
      const list = await listModels(providerId);
      if (list.length > 0) {
        setModels({ kind: "ok", models: list });
        return;
      }
      throw new Error("empty");
    } catch {
      const provider = filtered.find((p) => p.id === providerId);
      const fallback: ModelInfo[] =
        provider?.models?.map((m) => ({ id: m.id, name: m.label ?? m.id })) ?? [];
      if (fallback.length > 0) {
        setModels({ kind: "fallback", models: fallback });
      } else {
        setModels({ kind: manual ? "error" : "idle" });
      }
    }
  };

  // Auto-fetch on mount + provider change.
  useEffect(() => {
    setShowAll(false);
    if (!value.provider) {
      setModels({ kind: "idle" });
      return;
    }
    void fetchModels(value.provider, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.provider]);

  const switchProvider = (id: string): void => {
    const target = filtered.find((p) => p.id === id);
    const fallbackModel = defaultModels?.[id] ?? target?.models?.[0]?.id ?? "";
    onChange({ provider: id, model: fallbackModel, baseUrl: undefined });
  };

  if (filtered.length === 0) {
    return (
      <div className="settings-model-picker">
        <div className="settings-note">
          No AI providers installed. Install one from Settings → AI.
        </div>
      </div>
    );
  }

  const list = models.kind === "ok" || models.kind === "fallback" ? models.models : [];
  const VISIBLE = 8;
  const visible = showAll ? list : list.slice(0, VISIBLE);
  const overflow = list.length > VISIBLE;

  return (
    <div className="settings-model-picker">
      <div className="seg-control">
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            className={value.provider === p.id ? "active" : ""}
            onClick={() => switchProvider(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="aip-row-control">
        <input
          type="text"
          value={value.model}
          spellCheck={false}
          placeholder={
            current?.models?.[0]?.id ?? defaultModels?.[value.provider] ?? "model id"
          }
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        />
        <button
          type="button"
          className="ghost-btn"
          title="refresh model list"
          onClick={() => void fetchModels(value.provider, true)}
          disabled={models.kind === "loading" || !value.provider}
        >
          {models.kind === "loading" ? "…" : "refresh"}
        </button>
      </div>

      {list.length > 0 && (
        <div className="aip-models">
          {visible.map((m) => {
            const active = m.id === value.model;
            return (
              <button
                key={m.id}
                type="button"
                className={`aip-model-pill ${active ? "aip-model-active" : ""}`}
                title={m.name && m.name !== m.id ? m.name : m.id}
                onClick={() => onChange({ ...value, model: m.id })}
              >
                {m.id}
              </button>
            );
          })}
          {overflow && !showAll && (
            <button
              type="button"
              className="aip-model-pill aip-model-more"
              onClick={() => setShowAll(true)}
            >
              +{list.length - VISIBLE} more
            </button>
          )}
        </div>
      )}

      {models.kind === "error" && (
        <div className="settings-note">
          Couldn't fetch models — check that the provider's API key is set in Settings → AI.
        </div>
      )}
      {models.kind === "fallback" && (
        <div className="settings-note">
          Showing the provider's built-in defaults — couldn't fetch live list.
        </div>
      )}

      {showBase && (
        <div className="aip-row-control">
          <input
            type="text"
            value={value.baseUrl ?? ""}
            spellCheck={false}
            placeholder="base url"
            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
