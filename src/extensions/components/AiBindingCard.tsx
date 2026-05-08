import { useEffect, useState } from "react";
import { ModelPicker } from "./ModelPicker";
import { useAiProviders } from "../../lib/ai-availability";
import { ApiKeyInput } from "../../components/ApiKeyInput";
import { findCatalogEntry } from "../../settings/sections/ai/catalog";
import { ensureStyles } from "../../settings/sections/ai/styles";

/**
 * Polished "AI provider configurator" card for an extension's AiBinding.
 *
 * Auto-rendered by `<ExtensionSettingsForm>` for every entry in an
 * extension's `contributes.aiBindings`. Visually identical to the cards in
 * Settings → AI: same `aip-card` chrome, same `<ApiKeyInput>` for keys,
 * same `<ModelPicker>` for models. Two source modes:
 *
 *   • mTerminal AI — the registered provider extension's vault key is used
 *     (managed centrally in Settings → AI → ProviderCard). Default.
 *   • Custom key   — a per-binding override stored in `ctx.secrets`. Sent
 *     through `ctx.ai.stream({ ..., apiKey })` so the underlying SDK
 *     instantiates an ad-hoc client for this workflow only.
 *
 * Storage:
 *   - config (source / provider / model) lives under
 *     `settings.extensions[<extId>].ai.binding.<bindingId>`
 *   - per-binding api keys live in `ctx.secrets` under
 *     `ai.<bindingId>.<provider>.apiKey` (custom mode only)
 */

export interface AiBindingSpec {
  id: string;
  label: string;
  description?: string;
  supportsCore?: boolean;
  /** Optional whitelist of provider ids. Default: all installed providers. */
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
  ensureStyles();

  const allProviders = useAiProviders();
  const filtered = spec.providers
    ? allProviders.filter((p) => spec.providers!.includes(p.id))
    : allProviders;
  const cfg = normalize(value, spec, filtered.map((p) => p.id));
  const allowsCore = spec.supportsCore !== false;
  const currentProvider = filtered.find((p) => p.id === cfg.provider);
  const providerNeedsKey = currentProvider?.requiresVault === true;
  const catalog = currentProvider ? findCatalogEntry(currentProvider.id) : undefined;
  const initials = catalog?.initials ?? currentProvider?.label.slice(0, 2) ?? "AI";

  if (filtered.length === 0) {
    return (
      <div className="aip-card">
        <div className="aip-card-h">
          <span className="aip-logo">AI</span>
          <span className="aip-card-name">{spec.label}</span>
        </div>
        <div className="aip-card-body">
          <div className="settings-note">
            {spec.providers && spec.providers.length > 0
              ? `This binding wants one of: ${spec.providers.join(", ")}. Install the matching AI provider extension from Settings → AI.`
              : "No AI providers installed. Install one from Settings → AI."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="aip-card">
      <div className="aip-card-h">
        <span className={`aip-logo ${currentProvider ? `aip-logo-${currentProvider.id}` : ""}`}>
          {initials}
        </span>
        <span className="aip-card-name">{spec.label}</span>
        <span className="aip-card-meta">
          <span
            className={`aip-pill ${cfg.source === "core" ? "aip-pill-default" : "aip-pill-muted"}`}
          >
            {cfg.source === "core" ? "central" : "per-binding"}
          </span>
        </span>
      </div>

      <div className="aip-card-body">
        {spec.description && (
          <div className="aip-binding-desc">{spec.description}</div>
        )}

        {allowsCore && (
          <div className="aip-row">
            <div className="aip-row-label">Source of API key</div>
            <div className="aip-source-toggle" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={cfg.source === "core"}
                className={`aip-source-opt ${cfg.source === "core" ? "active" : ""}`}
                onClick={() => onChange({ ...cfg, source: "core" })}
              >
                <span className="aip-source-opt-title">Settings → AI</span>
                <span className="aip-source-opt-desc">
                  Use the provider's vault key (shared with all extensions)
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={cfg.source === "custom"}
                className={`aip-source-opt ${cfg.source === "custom" ? "active" : ""}`}
                onClick={() => onChange({ ...cfg, source: "custom" })}
              >
                <span className="aip-source-opt-title">Custom key</span>
                <span className="aip-source-opt-desc">
                  Override with a per-binding key stored just for this workflow
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="aip-row">
          <div className="aip-row-label">Provider &amp; model</div>
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
        </div>

        {cfg.source === "custom" && providerNeedsKey && currentProvider && (
          <ExtensionApiKeyRow
            extId={extId}
            bindingId={spec.id}
            provider={cfg.provider}
            providerLabel={currentProvider.label}
            keyHelpUrl={catalog?.keyHelpUrl}
          />
        )}

        {cfg.source === "custom" && !providerNeedsKey && (
          <div className="settings-note">
            {currentProvider?.label} doesn't need an API key (e.g. local Ollama).
            Configure base URL via the provider's own settings card.
          </div>
        )}
      </div>
    </div>
  );
}

function ExtensionApiKeyRow({
  extId,
  bindingId,
  provider,
  providerLabel,
  keyHelpUrl,
}: {
  extId: string;
  bindingId: string;
  provider: string;
  providerLabel: string;
  keyHelpUrl?: string;
}) {
  const key = secretKeyFor(bindingId, provider);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const has = await window.mt.ext.secrets.has(extId, key);
        if (alive) setHasKey(has);
      } catch (err) {
        console.error(`[ext:${extId}] secrets.has(${key}) failed:`, err);
      }
    })();
    const off = window.mt.ext.secrets.onChange(extId, (k, present) => {
      if (k === key) setHasKey(present);
    });
    return () => {
      alive = false;
      off();
    };
  }, [extId, key]);

  const setKey = async (value: string): Promise<void> => {
    await window.mt.ext.secrets.set(extId, key, value);
  };

  const clearKey = async (): Promise<void> => {
    await window.mt.ext.secrets.delete(extId, key);
  };

  return (
    <ApiKeyInput
      hasKey={hasKey}
      providerLabel={providerLabel}
      onSetKey={setKey}
      onClearKey={clearKey}
      link={keyHelpUrl}
    />
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
