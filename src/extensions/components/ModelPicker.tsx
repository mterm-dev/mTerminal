/**
 * Shared provider + model picker. Matches the visual language of the rest of
 * Settings (`.seg-control`, `.settings-field-control`, `.ghost-btn`).
 *
 * Used by:
 *   - AiBindingCard (extension AI bindings flow)
 *   - AIPanel (core "Default provider" + active model)
 *
 * Pure presentation — no settings reads. Caller passes in current values and
 * gets back a single `onChange` patch with whatever changed.
 */

export type AiProviderId = "anthropic" | "openai" | "ollama";

export interface ModelPickerValue {
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
}

const DEFAULT_PROVIDERS: AiProviderId[] = ["anthropic", "openai", "ollama"];
const PROVIDER_LABELS: Record<AiProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  ollama: "Ollama",
};
const DEFAULT_MODELS: Record<AiProviderId, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
  ollama: "llama3.1",
};
const DEFAULT_BASE_URLS: Record<AiProviderId, string> = {
  anthropic: "",
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434",
};

interface Props {
  providers?: AiProviderId[];
  value: ModelPickerValue;
  onChange: (next: ModelPickerValue) => void;
  /** Optional defaults per provider — used when user switches providers. */
  defaultModels?: Partial<Record<AiProviderId, string>>;
  /** Show the base URL row for openai/ollama. Default true. */
  showBaseUrl?: boolean;
}

export function ModelPicker({
  providers = DEFAULT_PROVIDERS,
  value,
  onChange,
  defaultModels,
  showBaseUrl = true,
}: Props) {
  const showBase =
    showBaseUrl && (value.provider === "openai" || value.provider === "ollama");

  const switchProvider = (p: AiProviderId): void => {
    onChange({
      provider: p,
      model: defaultModels?.[p] ?? DEFAULT_MODELS[p],
      baseUrl: DEFAULT_BASE_URLS[p] || undefined,
    });
  };

  return (
    <div className="settings-model-picker">
      <div className="seg-control">
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            className={value.provider === p ? "active" : ""}
            onClick={() => switchProvider(p)}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>
      <div className="settings-model-row">
        <input
          type="text"
          value={value.model}
          spellCheck={false}
          placeholder={DEFAULT_MODELS[value.provider]}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        />
      </div>
      {showBase && (
        <div className="settings-model-row">
          <input
            type="text"
            value={value.baseUrl ?? ""}
            spellCheck={false}
            placeholder={DEFAULT_BASE_URLS[value.provider]}
            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
