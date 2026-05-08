import type { AiProviderEntry } from "../../../extensions/registries/providers-ai";
import { findCatalogEntry } from "./catalog";
import type { AiProviderConfig } from "../../useSettings";
import { ApiKeyInput } from "../../../components/ApiKeyInput";
import { ModelChooser } from "../../../extensions/components/ModelChooser";

interface Props {
  entry: AiProviderEntry;
  config: AiProviderConfig;
  isDefault: boolean;
  hasKey: boolean;
  vaultUnlocked: boolean;
  onSetDefault: () => void;
  onModelChange: (model: string) => void;
  onBaseUrlChange: (baseUrl: string) => void;
  onSetKey: (key: string) => Promise<void>;
  onClearKey: () => Promise<void>;
  onRequestVault: () => void;
}

export function ProviderCard({
  entry,
  config,
  isDefault,
  hasKey,
  vaultUnlocked,
  onSetDefault,
  onModelChange,
  onBaseUrlChange,
  onSetKey,
  onClearKey,
  onRequestVault,
}: Props) {
  const catalog = findCatalogEntry(entry.id);
  const initials = catalog?.initials ?? entry.label.slice(0, 2);
  const requiresVault = entry.requiresVault !== false;

  let pill: { kind: "default" | "ok" | "warn" | "muted"; label: string };
  if (isDefault) pill = { kind: "default", label: "default" };
  else if (!requiresVault) pill = { kind: "muted", label: "no auth" };
  else if (hasKey) pill = { kind: "ok", label: "key saved" };
  else pill = { kind: "warn", label: vaultUnlocked ? "no key" : "vault locked" };

  return (
    <div className={`aip-card ${isDefault ? "aip-card-default" : ""}`}>
      <div className="aip-card-h">
        <span className={`aip-logo aip-logo-${entry.id}`}>{initials}</span>
        <span className="aip-card-name">{entry.label}</span>
        <span className="aip-card-meta">
          <span className={`aip-pill aip-pill-${pill.kind}`}>{pill.label}</span>
        </span>
      </div>

      <div className="aip-card-body">
        {requiresVault && (
          <ApiKeyInput
            hasKey={hasKey}
            providerLabel={entry.label}
            locked={!vaultUnlocked}
            onRequestUnlock={onRequestVault}
            onSetKey={onSetKey}
            onClearKey={onClearKey}
            link={catalog?.keyHelpUrl}
          />
        )}

        <div className="aip-row">
          <div className="aip-row-label">Model</div>
          <ModelChooser
            providerId={entry.id}
            fallbackModels={entry.models}
            defaultModel={catalog?.defaultModel}
            value={config.model ?? ""}
            onChange={onModelChange}
          />
        </div>

        {!requiresVault && (
          <div className="aip-row">
            <div className="aip-row-label">Base URL</div>
            <div className="aip-row-control">
              <input
                type="text"
                value={config.baseUrl ?? ""}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                placeholder="http://localhost:11434"
                spellCheck={false}
              />
            </div>
          </div>
        )}
      </div>

      <div className="aip-card-foot">
        {!isDefault && (
          <button className="ghost-btn" onClick={onSetDefault}>
            set as default
          </button>
        )}
        <span className="aip-spacer" />
      </div>
    </div>
  );
}
