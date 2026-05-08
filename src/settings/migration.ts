import type { AiProviderConfig } from "./useSettings";

export const CURRENT_SCHEMA_VERSION = 2;

const DEAD_KEYS = [
  "gitPanelCollapsed",
  "gitPanelHeight",
  "gitPanelTreeView",
  "aiAnthropicModel",
  "aiOpenaiModel",
  "aiOpenaiBaseUrl",
  "aiOllamaModel",
  "aiOllamaBaseUrl",
  "gitCommitAnthropicModel",
  "gitCommitOpenaiModel",
  "gitCommitOpenaiBaseUrl",
  "gitCommitOllamaModel",
  "gitCommitOllamaBaseUrl",
];

const UI_STATE_KEYS = ["aiPanelOpen", "sidebarCollapsed", "sidebarWidth", "gitCommitMsgHeight"] as const;

export interface MigrationResult {
  settings: Record<string, unknown>;
  uiState: Record<string, unknown> | null;
}

export function migrateSettings(raw: Record<string, unknown>): MigrationResult {
  const version = typeof raw.settingsSchemaVersion === "number" ? raw.settingsSchemaVersion : 1;

  if (version >= CURRENT_SCHEMA_VERSION) {
    return { settings: raw, uiState: null };
  }

  const out: Record<string, unknown> = { ...raw };

  hoistLegacyAiFields(out);
  hoistLegacyGitCommitFields(out);

  for (const k of DEAD_KEYS) delete out[k];

  let uiState: Record<string, unknown> | null = null;
  for (const k of UI_STATE_KEYS) {
    if (k in out) {
      if (!uiState) uiState = {};
      uiState[k] = out[k];
      delete out[k];
    }
  }

  out.settingsSchemaVersion = CURRENT_SCHEMA_VERSION;

  return { settings: out, uiState };
}

function hoistLegacyAiFields(raw: Record<string, unknown>): void {
  const cfg: Record<string, AiProviderConfig> = {
    ...(typeof raw.aiProviderConfig === "object" && raw.aiProviderConfig
      ? (raw.aiProviderConfig as Record<string, AiProviderConfig>)
      : {}),
  };
  const ensure = (id: string): AiProviderConfig => (cfg[id] ??= {});

  if (typeof raw.aiAnthropicModel === "string" && raw.aiAnthropicModel) {
    ensure("anthropic").model ??= raw.aiAnthropicModel;
  }
  if (typeof raw.aiOpenaiModel === "string" && raw.aiOpenaiModel) {
    ensure("openai").model ??= raw.aiOpenaiModel;
  }
  if (typeof raw.aiOpenaiBaseUrl === "string" && raw.aiOpenaiBaseUrl) {
    ensure("openai").baseUrl ??= raw.aiOpenaiBaseUrl;
  }
  if (typeof raw.aiOllamaModel === "string" && raw.aiOllamaModel) {
    ensure("ollama").model ??= raw.aiOllamaModel;
  }
  if (typeof raw.aiOllamaBaseUrl === "string" && raw.aiOllamaBaseUrl) {
    ensure("ollama").baseUrl ??= raw.aiOllamaBaseUrl;
  }
  raw.aiProviderConfig = cfg;
}

function hoistLegacyGitCommitFields(raw: Record<string, unknown>): void {
  const cfg: Record<string, AiProviderConfig> = {
    ...(typeof raw.gitCommitProviderConfig === "object" && raw.gitCommitProviderConfig
      ? (raw.gitCommitProviderConfig as Record<string, AiProviderConfig>)
      : {}),
  };
  const ensure = (id: string): AiProviderConfig => (cfg[id] ??= {});

  if (typeof raw.gitCommitAnthropicModel === "string" && raw.gitCommitAnthropicModel) {
    ensure("anthropic").model ??= raw.gitCommitAnthropicModel;
  }
  if (typeof raw.gitCommitOpenaiModel === "string" && raw.gitCommitOpenaiModel) {
    ensure("openai").model ??= raw.gitCommitOpenaiModel;
  }
  if (typeof raw.gitCommitOpenaiBaseUrl === "string" && raw.gitCommitOpenaiBaseUrl) {
    ensure("openai").baseUrl ??= raw.gitCommitOpenaiBaseUrl;
  }
  if (typeof raw.gitCommitOllamaModel === "string" && raw.gitCommitOllamaModel) {
    ensure("ollama").model ??= raw.gitCommitOllamaModel;
  }
  if (typeof raw.gitCommitOllamaBaseUrl === "string" && raw.gitCommitOllamaBaseUrl) {
    ensure("ollama").baseUrl ??= raw.gitCommitOllamaBaseUrl;
  }
  raw.gitCommitProviderConfig = cfg;
}
