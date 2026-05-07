/**
 * Subset of the per-extension settings shape that the migrated GitPanel
 * reads from its `settings` prop. Everything namespaced under
 * `settings.extensions['git-panel'].*`.
 *
 * AI provider config lives under `ai.binding.commit` (see manifest's
 * `contributes.aiBindings`) and is fetched separately by the panel through
 * the host-provided binding config — not flattened into this struct.
 */

export interface GitPanelSettings {
  commitSystemPrompt: string;
  pullStrategy: "ff-only" | "merge" | "rebase";
}

export const DEFAULT_GIT_PANEL_SETTINGS: GitPanelSettings = {
  commitSystemPrompt:
    "Write a single conventional-commit message (under 72 chars on the first line) for the diff. Do not include extra commentary.",
  pullStrategy: "ff-only",
};
