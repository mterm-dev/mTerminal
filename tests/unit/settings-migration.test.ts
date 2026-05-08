import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, migrateSettings } from "../../src/settings/migration";

describe("migrateSettings", () => {
  it("is a no-op when version is current", () => {
    const raw = { settingsSchemaVersion: CURRENT_SCHEMA_VERSION, themeId: "x" };
    const { settings, uiState } = migrateSettings({ ...raw });
    expect(settings).toEqual(raw);
    expect(uiState).toBeNull();
  });

  it("removes dead git panel keys", () => {
    const { settings } = migrateSettings({
      gitPanelCollapsed: true,
      gitPanelHeight: 200,
      gitPanelTreeView: false,
      themeId: "mterminal",
    });
    expect("gitPanelCollapsed" in settings).toBe(false);
    expect("gitPanelHeight" in settings).toBe(false);
    expect("gitPanelTreeView" in settings).toBe(false);
    expect(settings.themeId).toBe("mterminal");
  });

  it("hoists legacy AI provider fields into aiProviderConfig", () => {
    const { settings } = migrateSettings({
      aiAnthropicModel: "claude-opus-4",
      aiOpenaiModel: "gpt-4",
      aiOpenaiBaseUrl: "https://x",
    });
    expect(settings.aiProviderConfig).toEqual({
      anthropic: { model: "claude-opus-4" },
      openai: { model: "gpt-4", baseUrl: "https://x" },
    });
    expect("aiAnthropicModel" in settings).toBe(false);
    expect("aiOpenaiModel" in settings).toBe(false);
  });

  it("extracts UI state keys to separate bag", () => {
    const { settings, uiState } = migrateSettings({
      aiPanelOpen: true,
      sidebarCollapsed: false,
      sidebarWidth: 280,
      gitCommitMsgHeight: 90,
      themeId: "dark",
    });
    expect(uiState).toEqual({
      aiPanelOpen: true,
      sidebarCollapsed: false,
      sidebarWidth: 280,
      gitCommitMsgHeight: 90,
    });
    expect("aiPanelOpen" in settings).toBe(false);
    expect("sidebarWidth" in settings).toBe(false);
    expect(settings.themeId).toBe("dark");
  });

  it("stamps the current schema version after migrating", () => {
    const { settings } = migrateSettings({});
    expect(settings.settingsSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("preserves existing aiProviderConfig when migrating", () => {
    const { settings } = migrateSettings({
      aiProviderConfig: { custom: { model: "abc" } },
      aiAnthropicModel: "opus",
    });
    expect(settings.aiProviderConfig).toEqual({
      custom: { model: "abc" },
      anthropic: { model: "opus" },
    });
  });
});
