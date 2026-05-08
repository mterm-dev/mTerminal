/**
 * Shared provider + model picker. Matches the visual language of the rest of
 * Settings (`.seg-control`, `.settings-field-control`, `.ghost-btn`).
 *
 * Used by:
 *   - AiBindingCard (extension AI bindings flow)
 *   - AIPanel (core "Default provider" + active model)
 *
 * Provider list is dynamic — it comes from whichever AI provider extensions
 * the user has installed. Empty registry = empty seg-control + an empty-state
 * note.
 *
 * Pure presentation — no settings reads. Caller passes in current values and
 * gets back a single `onChange` patch with whatever changed.
 */

import { useAiProviders } from "../../lib/ai-availability";

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
    showBaseUrl !== undefined ? showBaseUrl : value.baseUrl !== undefined && value.baseUrl !== "";

  const switchProvider = (id: string): void => {
    const target = filtered.find((p) => p.id === id);
    const fallbackModel =
      defaultModels?.[id] ?? target?.models?.[0]?.id ?? "";
    onChange({
      provider: id,
      model: fallbackModel,
      baseUrl: undefined,
    });
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
      <div className="settings-model-row">
        <input
          type="text"
          value={value.model}
          spellCheck={false}
          placeholder={
            current?.models?.[0]?.id ?? "model id"
          }
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        />
      </div>
      {showBase && (
        <div className="settings-model-row">
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
