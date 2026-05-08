import { useState } from "react";
import type { AiProviderEntry } from "../../../extensions/registries/providers-ai";
import type { ModelInfo } from "../../../hooks/useAI";
import { listModels } from "../../../hooks/useAI";
import { findCatalogEntry } from "./catalog";
import type { AiProviderConfig } from "../../useSettings";

type ModelsState = ModelInfo[] | "loading" | "error" | undefined;

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

  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [models, setModels] = useState<ModelsState>(undefined);

  const fetchModels = async (): Promise<void> => {
    setModels("loading");
    try {
      const list = await listModels(entry.id);
      setModels(list.length === 0 ? "error" : list);
    } catch {
      setModels("error");
    }
  };

  const submit = async (): Promise<void> => {
    const v = keyDraft.trim();
    if (!v) return;
    await onSetKey(v);
    setKeyDraft("");
    setEditingKey(false);
  };

  const startEdit = (): void => {
    if (!vaultUnlocked) {
      onRequestVault();
      return;
    }
    setEditingKey(true);
  };

  // Status pill: default > key saved > no key / no auth
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
        {requiresVault && editingKey && (
          <div className="aip-row">
            <div className="aip-row-label">API key</div>
            <div className="aip-row-control">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={`paste ${entry.label} API key`}
                autoFocus
                spellCheck={false}
              />
              <button className="ghost-btn" onClick={() => void submit()}>
                save
              </button>
              <button
                className="ghost-btn"
                onClick={() => {
                  setEditingKey(false);
                  setKeyDraft("");
                }}
              >
                cancel
              </button>
            </div>
          </div>
        )}

        <div className="aip-row">
          <div className="aip-row-label">Model</div>
          <div className="aip-row-control">
            <input
              type="text"
              value={config.model ?? ""}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={catalog?.defaultModel ?? entry.models?.[0]?.id ?? "model id"}
              spellCheck={false}
            />
            <button className="ghost-btn" onClick={() => void fetchModels()}>
              {models === "loading" ? "…" : "list"}
            </button>
          </div>

          {models === "error" && (
            <div className="settings-note">failed to fetch models</div>
          )}
          {Array.isArray(models) && (
            <div className="aip-models">
              {models.slice(0, 16).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`aip-model-pill ${m.id === config.model ? "aip-model-active" : ""}`}
                  title={m.name}
                  onClick={() => onModelChange(m.id)}
                >
                  {m.id}
                </button>
              ))}
            </div>
          )}
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
        {requiresVault && !editingKey && (
          <>
            <button className="ghost-btn" onClick={startEdit}>
              {hasKey ? "replace key" : vaultUnlocked ? "set key" : "unlock to set key"}
            </button>
            {hasKey && vaultUnlocked && (
              <button className="ghost-btn" onClick={() => void onClearKey()}>
                remove key
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
