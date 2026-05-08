/**
 * Model picker for a single, already-chosen provider.
 *
 * Auto-fetches the live model list from the provider's SDK on mount and on
 * provider change; shows results as clickable pills (up to N visible, with a
 * "+more" expander). The text input stays editable for custom / preview model
 * ids that don't appear in the live list.
 *
 * Used by:
 *   - ProviderCard (Settings → AI)         — given the card's provider id
 *   - ModelPicker  (auto-rendered binding) — wrapped in a provider seg-control
 *
 * No provider seg-control here on purpose: ProviderCard already knows which
 * provider it represents.
 */

import { useEffect, useState } from "react";
import { listModels, type ModelInfo } from "../../hooks/useAI";

interface Props {
  providerId: string;
  /** Static fallback list declared by the provider extension (used when the live fetch fails). */
  fallbackModels?: Array<{ id: string; label?: string }>;
  /** Default placeholder if fallback list is empty. */
  defaultModel?: string;
  value: string;
  onChange: (model: string) => void;
}

type ModelsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; models: ModelInfo[] }
  | { kind: "fallback"; models: ModelInfo[] }
  | { kind: "error" };

const VISIBLE = 8;

export function ModelChooser({
  providerId,
  fallbackModels,
  defaultModel,
  value,
  onChange,
}: Props) {
  const [models, setModels] = useState<ModelsState>({ kind: "idle" });
  const [showAll, setShowAll] = useState(false);

  const fetchModels = async (manual: boolean): Promise<void> => {
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
      const fallback: ModelInfo[] =
        fallbackModels?.map((m) => ({ id: m.id, name: m.label ?? m.id })) ?? [];
      if (fallback.length > 0) {
        setModels({ kind: "fallback", models: fallback });
      } else {
        setModels({ kind: manual ? "error" : "idle" });
      }
    }
  };

  useEffect(() => {
    setShowAll(false);
    if (!providerId) {
      setModels({ kind: "idle" });
      return;
    }
    void fetchModels(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  const list = models.kind === "ok" || models.kind === "fallback" ? models.models : [];
  const visible = showAll ? list : list.slice(0, VISIBLE);
  const overflow = list.length > VISIBLE;

  return (
    <div className="aip-model-chooser">
      <div className="aip-row-control">
        <input
          type="text"
          value={value}
          spellCheck={false}
          placeholder={fallbackModels?.[0]?.id ?? defaultModel ?? "model id"}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="ghost-btn"
          title="refresh model list"
          onClick={() => void fetchModels(true)}
          disabled={models.kind === "loading" || !providerId}
        >
          {models.kind === "loading" ? "…" : "refresh"}
        </button>
      </div>

      {list.length > 0 && (
        <div className="aip-models">
          {visible.map((m) => {
            const active = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                className={`aip-model-pill ${active ? "aip-model-active" : ""}`}
                title={m.name && m.name !== m.id ? m.name : m.id}
                onClick={() => onChange(m.id)}
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
          Couldn't fetch models — check that the provider's API key is set.
        </div>
      )}
      {models.kind === "fallback" && (
        <div className="settings-note">
          Showing the provider's built-in defaults — couldn't fetch live list.
        </div>
      )}
    </div>
  );
}
