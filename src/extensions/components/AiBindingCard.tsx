import { useEffect, useState } from "react";
import { Field } from "../../settings/sections/_shared";
import { ModelPicker, type AiProviderId } from "./ModelPicker";

/**
 * Shared "AI provider configurator" card.
 *
 * Auto-rendered by `<ExtensionSettingsForm>` for every entry in an
 * extension's `contributes.aiBindings`. Visually plain — uses the same
 * `.settings-field` / `.seg-control` / `.ghost-btn` primitives as the rest
 * of the Settings modal so it doesn't stand out as a foreign component.
 *
 * Storage:
 *   - config (source / provider / model / baseUrl) lives under
 *     `settings.extensions[<extId>].ai.binding.<bindingId>`
 *   - api keys live in `ctx.secrets` under
 *     `ai.<bindingId>.<provider>.apiKey` (custom mode only)
 */

export interface AiBindingSpec {
  id: string;
  label: string;
  description?: string;
  supportsCore?: boolean;
  providers?: AiProviderId[];
  defaultProvider?: AiProviderId;
  defaultModels?: Partial<Record<AiProviderId, string>>;
}

export interface AiBindingConfig {
  source: "core" | "custom";
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
}

const DEFAULT_PROVIDERS: AiProviderId[] = ["anthropic", "openai", "ollama"];
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

export function settingsKeyFor(bindingId: string): string {
  return `ai.binding.${bindingId}`;
}

export function secretKeyFor(bindingId: string, provider: AiProviderId): string {
  return `ai.${bindingId}.${provider}.apiKey`;
}

export function defaultConfigFor(spec: AiBindingSpec): AiBindingConfig {
  const providers = spec.providers ?? DEFAULT_PROVIDERS;
  const provider = spec.defaultProvider ?? providers[0] ?? "anthropic";
  const model = spec.defaultModels?.[provider] ?? DEFAULT_MODELS[provider];
  return {
    source: spec.supportsCore === false ? "custom" : "core",
    provider,
    model,
    baseUrl: DEFAULT_BASE_URLS[provider] || undefined,
  };
}

interface Props {
  extId: string;
  spec: AiBindingSpec;
  value: AiBindingConfig | undefined;
  onChange: (next: AiBindingConfig) => void;
}

export function AiBindingCard({ extId, spec, value, onChange }: Props) {
  const cfg = normalize(value, spec);
  const allowsCore = spec.supportsCore !== false;
  const providers = spec.providers ?? DEFAULT_PROVIDERS;
  const providerNeedsKey = cfg.provider === "anthropic" || cfg.provider === "openai";

  return (
    <div className="ai-binding-group">
      <div className="settings-section-h">{spec.label}</div>

      {allowsCore && (
        <Field label="Source" hint="Where API keys for this workflow come from">
          <div className="seg-control">
            <button
              type="button"
              className={cfg.source === "core" ? "active" : ""}
              onClick={() => onChange({ ...cfg, source: "core" })}
            >
              mTerminal AI
            </button>
            <button
              type="button"
              className={cfg.source === "custom" ? "active" : ""}
              onClick={() => onChange({ ...cfg, source: "custom" })}
            >
              Custom keys
            </button>
          </div>
        </Field>
      )}

      <Field
        label="Model"
        hint={spec.description ?? "Pick a provider and the exact model id"}
      >
        <ModelPicker
          providers={providers}
          value={{ provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl }}
          defaultModels={spec.defaultModels}
          onChange={(v) =>
            onChange({
              source: cfg.source,
              provider: v.provider,
              model: v.model,
              baseUrl: v.baseUrl,
            })
          }
        />
      </Field>

      {cfg.source === "custom" && providerNeedsKey && (
        <ApiKeyField
          extId={extId}
          bindingId={spec.id}
          provider={cfg.provider}
        />
      )}

      {cfg.source === "core" && (
        <div className="settings-note">
          Uses keys from <strong>Settings → AI</strong>. The host vault must be
          unlocked.
        </div>
      )}
      {cfg.source === "custom" && cfg.provider === "ollama" && (
        <div className="settings-note">
          Ollama runs locally — no API key required. Make sure{" "}
          <code>{cfg.baseUrl || DEFAULT_BASE_URLS.ollama}</code> is reachable.
        </div>
      )}
    </div>
  );
}

function ApiKeyField({
  extId,
  bindingId,
  provider,
}: {
  extId: string;
  bindingId: string;
  provider: AiProviderId;
}) {
  const key = secretKeyFor(bindingId, provider);
  const [value, setValue] = useState<string>("");
  const [stored, setStored] = useState<boolean>(false);
  const [reveal, setReveal] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    setValue("");
    setDirty(false);
    void (async () => {
      try {
        const has = await window.mt.ext.secrets.has(extId, key);
        if (!alive) return;
        setStored(has);
        if (has) {
          const v = (await window.mt.ext.secrets.get(extId, key)) ?? "";
          if (alive) setValue(v);
        }
      } catch (err) {
        console.error(`[ext:${extId}] secrets.get(${key}) failed:`, err);
      }
    })();
    const off = window.mt.ext.secrets.onChange(extId, (k, present) => {
      if (k !== key) return;
      setStored(present);
      if (!present) setValue("");
      setDirty(false);
    });
    return () => {
      alive = false;
      off();
    };
  }, [extId, key]);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      if (value.trim() === "") {
        await window.mt.ext.secrets.delete(extId, key);
      } else {
        await window.mt.ext.secrets.set(extId, key, value);
      }
      setDirty(false);
    } catch (err) {
      console.error(`[ext:${extId}] secrets.set(${key}) failed:`, err);
    } finally {
      setBusy(false);
    }
  };

  const clear = async (): Promise<void> => {
    setBusy(true);
    try {
      await window.mt.ext.secrets.delete(extId, key);
      setValue("");
      setDirty(false);
    } catch (err) {
      console.error(`[ext:${extId}] secrets.delete(${key}) failed:`, err);
    } finally {
      setBusy(false);
    }
  };

  const placeholder = provider === "anthropic" ? "sk-ant-…" : "sk-…";

  return (
    <Field
      label="API key"
      hint={
        stored
          ? "Stored encrypted in this extension's secrets file"
          : "Paste your key — never written to the main settings JSON"
      }
    >
      <div className="settings-key-wrap">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type={reveal ? "text" : "password"}
            value={value}
            placeholder={stored ? "(stored)" : placeholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setDirty(true);
            }}
          />
          <button
            type="button"
            className="ghost-btn small"
            onClick={() => setReveal((r) => !r)}
          >
            {reveal ? "hide" : "show"}
          </button>
          <button
            type="button"
            className="ghost-btn small"
            onClick={() => void save()}
            disabled={busy || !dirty}
          >
            {stored && !dirty ? "saved" : "save"}
          </button>
          {stored && (
            <button
              type="button"
              className="ghost-btn small"
              onClick={() => void clear()}
              disabled={busy}
            >
              clear
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}

function normalize(
  v: AiBindingConfig | undefined,
  spec: AiBindingSpec,
): AiBindingConfig {
  const base = defaultConfigFor(spec);
  if (!v || typeof v !== "object") return base;
  const providers = spec.providers ?? DEFAULT_PROVIDERS;
  const provider = providers.includes(v.provider) ? v.provider : base.provider;
  return {
    source: spec.supportsCore === false ? "custom" : v.source === "custom" ? "custom" : "core",
    provider,
    model: typeof v.model === "string" && v.model.trim() ? v.model : base.model,
    baseUrl: typeof v.baseUrl === "string" ? v.baseUrl : base.baseUrl,
  };
}
