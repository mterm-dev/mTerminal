import { useEffect, useState } from "react";
import { Field } from "../../settings/sections/_shared";
import { ModelPicker } from "./ModelPicker";
import { useAiProviders } from "../../lib/ai-availability";

/**
 * Shared "AI provider configurator" card.
 *
 * Auto-rendered by `<ExtensionSettingsForm>` for every entry in an
 * extension's `contributes.aiBindings`. Visually plain — uses the same
 * `.settings-field` / `.seg-control` / `.ghost-btn` primitives as the rest
 * of the Settings modal so it doesn't stand out as a foreign component.
 *
 * After the SDK-as-extension refactor the provider list is dynamic. The
 * binding declares an optional whitelist of provider ids; the card filters
 * the live registry against that whitelist (or shows everything installed).
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
  /** Optional whitelist of provider ids. */
  providers?: string[];
  defaultProvider?: string;
  defaultModels?: Record<string, string>;
}

export interface AiBindingConfig {
  source: "core" | "custom";
  provider: string;
  model: string;
  baseUrl?: string;
}

export function settingsKeyFor(bindingId: string): string {
  return `ai.binding.${bindingId}`;
}

export function secretKeyFor(bindingId: string, provider: string): string {
  return `ai.${bindingId}.${provider}.apiKey`;
}

export function defaultConfigFor(spec: AiBindingSpec, fallbackProviderId?: string): AiBindingConfig {
  const provider = spec.defaultProvider ?? spec.providers?.[0] ?? fallbackProviderId ?? "";
  const model = (provider && spec.defaultModels?.[provider]) ?? "";
  return {
    source: spec.supportsCore === false ? "custom" : "core",
    provider,
    model,
    baseUrl: undefined,
  };
}

interface Props {
  extId: string;
  spec: AiBindingSpec;
  value: AiBindingConfig | undefined;
  onChange: (next: AiBindingConfig) => void;
}

export function AiBindingCard({ extId, spec, value, onChange }: Props) {
  const allProviders = useAiProviders();
  const filtered = spec.providers
    ? allProviders.filter((p) => spec.providers!.includes(p.id))
    : allProviders;
  const cfg = normalize(value, spec, filtered.map((p) => p.id));
  const allowsCore = spec.supportsCore !== false;
  const currentProvider = filtered.find((p) => p.id === cfg.provider);
  const providerNeedsKey = currentProvider?.requiresVault === true;

  if (filtered.length === 0) {
    return (
      <div className="ai-binding-group">
        <div className="settings-section-h">{spec.label}</div>
        <div className="settings-note">
          {spec.providers && spec.providers.length > 0
            ? `This binding wants one of: ${spec.providers.join(", ")}. Install the matching AI provider extension from Settings → AI.`
            : "No AI providers installed. Install one from Settings → AI."}
        </div>
      </div>
    );
  }

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
          providers={filtered.map((p) => p.id)}
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
      {cfg.source === "custom" && !providerNeedsKey && (
        <div className="settings-note">
          {currentProvider?.label} doesn't need an API key (e.g. local Ollama).
          Configure base URL via the provider's own settings card.
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
  provider: string;
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
            placeholder={stored ? "(stored)" : "paste API key"}
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
  availableIds: string[],
): AiBindingConfig {
  const base = defaultConfigFor(spec, availableIds[0]);
  if (!v || typeof v !== "object") return base;
  const provider = availableIds.includes(v.provider) ? v.provider : base.provider;
  return {
    source: spec.supportsCore === false ? "custom" : v.source === "custom" ? "custom" : "core",
    provider,
    model: typeof v.model === "string" && v.model.trim() ? v.model : base.model,
    baseUrl: typeof v.baseUrl === "string" ? v.baseUrl : base.baseUrl,
  };
}
