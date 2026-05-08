/**
 * Provider + model picker for extension AI bindings.
 *
 * Thin wrapper around <ModelChooser>: adds a provider seg-control on top so
 * an extension binding can pick *which* provider to call. The single-provider
 * model UX (input, auto-fetched pills, refresh, fallback note) lives in
 * <ModelChooser> and is also reused directly by Settings → AI ProviderCard.
 */

import { useAiProviders } from "../../lib/ai-availability";
import { ModelChooser } from "./ModelChooser";

export type AiProviderId = string;

export interface ModelPickerValue {
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
}

interface Props {
  providers?: AiProviderId[];
  value: ModelPickerValue;
  onChange: (next: ModelPickerValue) => void;
  defaultModels?: Record<string, string>;
  showBaseUrl?: boolean;
}

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
  const showBase =
    showBaseUrl !== undefined
      ? showBaseUrl
      : value.baseUrl !== undefined && value.baseUrl !== "";

  if (filtered.length === 0) {
    return (
      <div className="settings-model-picker">
        <div className="settings-note">
          No AI providers installed. Install one from Settings → AI.
        </div>
      </div>
    );
  }

  const switchProvider = (id: string): void => {
    const target = filtered.find((p) => p.id === id);
    const fallbackModel = defaultModels?.[id] ?? target?.models?.[0]?.id ?? "";
    onChange({ provider: id, model: fallbackModel, baseUrl: undefined });
  };

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

      <ModelChooser
        providerId={value.provider}
        fallbackModels={current?.models}
        defaultModel={defaultModels?.[value.provider]}
        value={value.model}
        onChange={(model) => onChange({ ...value, model })}
      />

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
