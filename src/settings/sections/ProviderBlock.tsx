import type { ModelInfo } from "../../hooks/useAI";

interface Props {
  label: string;
  /** Dynamic provider id — comes from the registered AI provider extension. */
  provider: string;
  hasKey: boolean;
  vaultUnlocked: boolean;
  modelValue: string;
  onModelChange: (v: string) => void;
  baseUrlValue?: string;
  onBaseUrlChange?: (v: string) => void;
  keyDraftActive?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  draftValue?: string;
  setDraftValue?: (v: string) => void;
  onSubmitKey?: () => void;
  onClearKey?: () => void;
  modelsState?: ModelInfo[] | "loading" | "error";
  onFetchModels: () => void;
  /** When true, hide the API key controls entirely (e.g. local Ollama). */
  noKeyNeeded?: boolean;
  onRequestVault?: () => void;
}

export function ProviderBlock({
  label,
  hasKey,
  vaultUnlocked,
  modelValue,
  onModelChange,
  baseUrlValue,
  onBaseUrlChange,
  keyDraftActive,
  onStartEdit,
  onCancelEdit,
  draftValue,
  setDraftValue,
  onSubmitKey,
  onClearKey,
  modelsState,
  onFetchModels,
  noKeyNeeded,
  onRequestVault,
}: Props) {
  const handleStartEdit = () => {
    if (!vaultUnlocked && onRequestVault) {
      onRequestVault();
      return;
    }
    onStartEdit?.();
  };
  return (
    <div className="settings-field" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="settings-field-label">
        <span style={{ fontWeight: 600 }}>{label}</span>
        {!noKeyNeeded && (
          <span className="settings-field-hint">
            {hasKey ? "key saved ✓" : vaultUnlocked ? "no key" : "vault locked"}
          </span>
        )}
      </div>

      <div className="settings-field-control" style={{ flexDirection: "column", gap: 8 }}>
        {!noKeyNeeded && !keyDraftActive && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ghost-btn" onClick={handleStartEdit}>
              {!vaultUnlocked
                ? "unlock vault to set key"
                : hasKey
                  ? "replace key"
                  : "set key"}
            </button>
            {hasKey && vaultUnlocked && (
              <button className="ghost-btn" onClick={onClearKey}>
                remove key
              </button>
            )}
          </div>
        )}

        {!noKeyNeeded && keyDraftActive && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="password"
              value={draftValue ?? ""}
              onChange={(e) => setDraftValue?.(e.target.value)}
              placeholder="paste API key"
              autoFocus
              style={{ flex: 1 }}
            />
            <button className="ghost-btn" onClick={onSubmitKey}>
              save
            </button>
            <button className="ghost-btn" onClick={onCancelEdit}>
              cancel
            </button>
          </div>
        )}

        {baseUrlValue !== undefined && (
          <input
            type="text"
            value={baseUrlValue}
            onChange={(e) => onBaseUrlChange?.(e.target.value)}
            placeholder="base url"
          />
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={modelValue}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="model id"
            style={{ flex: 1 }}
          />
          <button className="ghost-btn" onClick={onFetchModels}>
            list models
          </button>
        </div>

        {modelsState === "loading" && <div className="settings-note">loading...</div>}
        {modelsState === "error" && (
          <div className="settings-note">failed to fetch models</div>
        )}
        {Array.isArray(modelsState) && modelsState.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {modelsState.slice(0, 12).map((m) => (
              <button
                key={m.id}
                className="ghost-btn"
                onClick={() => onModelChange(m.id)}
                title={m.name}
                style={{ fontSize: 11 }}
              >
                {m.id}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
