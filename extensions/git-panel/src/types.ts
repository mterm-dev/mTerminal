/**
 * Subset of the per-extension settings shape that the migrated GitPanel
 * reads from its `settings` prop. All fields belong to the extension
 * namespace (`settings.extensions['git-panel'].*`).
 *
 * API keys do NOT live here — they are fetched lazily through `ctx.secrets`
 * (see panel/GitPanel.tsx). Only configuration that is safe to round-trip
 * through the regular settings JSON belongs in this struct.
 */

export type AiProviderId = "anthropic" | "openai" | "ollama";

export interface GitPanelSettings {
  commitProvider: AiProviderId;
  anthropicModel: string;
  openaiModel: string;
  openaiBaseUrl: string;
  ollamaModel: string;
  ollamaBaseUrl: string;
  commitSystemPrompt: string;
  pullStrategy: "ff-only" | "merge" | "rebase";
}

export const DEFAULT_GIT_PANEL_SETTINGS: GitPanelSettings = {
  commitProvider: "anthropic",
  anthropicModel: "claude-sonnet-4-5",
  openaiModel: "gpt-4o-mini",
  openaiBaseUrl: "https://api.openai.com/v1",
  ollamaModel: "llama3.1",
  ollamaBaseUrl: "http://localhost:11434",
  commitSystemPrompt:
    "Write a single conventional-commit message (under 72 chars on the first line) for the diff. Do not include extra commentary.",
  pullStrategy: "ff-only",
};
