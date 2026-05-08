import { useEffect, useMemo, useState } from "react";
import { useAIKeys } from "../../hooks/useAIKeys";
import { useAiProviders } from "../../lib/ai-availability";
import { Field, Toggle, type VaultSectionProps } from "./_shared";
import { ensureStyles } from "./ai/styles";
import { SDK_CATALOG } from "./ai/catalog";
import { EmptyState } from "./ai/EmptyState";
import { InstallCard } from "./ai/InstallCard";
import { ProviderCard } from "./ai/ProviderCard";
import type { AiProviderConfig } from "../useSettings";

interface Props extends VaultSectionProps {
  mcpStatus?: { running: boolean; socketPath: string | null };
}

/**
 * Settings → AI section.
 *
 * After the SDK-as-extension refactor every AI provider is contributed by an
 * installed extension. This panel renders:
 *
 *   • when no provider is registered: an empty-state hero + a 3-up grid of
 *     install cards for the first-party SDK provider extensions;
 *   • when at least one provider is active: one polished `ProviderCard` per
 *     installed provider, plus a slim "+ add another" row that re-shows the
 *     install cards for the SDKs the user hasn't picked up yet.
 *
 * Keys live in the host vault (`ai_keys.<id>`); model + baseUrl per provider
 * live in `settings.aiProviderConfig`.
 */
export function AIPanel({
  settings,
  update,
  vaultUnlocked,
  vaultExists,
  onRequestVault,
  mcpStatus,
}: Props) {
  useEffect(() => {
    ensureStyles();
  }, []);

  const providers = useAiProviders();
  const { hasKey, setKey, clearKey } = useAIKeys(vaultUnlocked);
  const [showAddMore, setShowAddMore] = useState(false);

  const providerIds = useMemo(() => providers.map((p) => p.id), [providers]);
  const missingSdks = useMemo(
    () => SDK_CATALOG.filter((e) => !providerIds.includes(e.providerId)),
    [providerIds],
  );

  // Auto-select default if user has none + at least one provider is active.
  useEffect(() => {
    if (!settings.aiDefaultProvider && providers.length > 0) {
      update("aiDefaultProvider", providers[0].id);
    }
  }, [providers, settings.aiDefaultProvider, update]);

  const setProviderConfig = (providerId: string, patch: Partial<AiProviderConfig>): void => {
    const next = { ...(settings.aiProviderConfig ?? {}) };
    next[providerId] = { ...next[providerId], ...patch };
    update("aiProviderConfig", next);
  };

  const vaultBadge = !vaultExists
    ? "vault not initialised — click to create"
    : !vaultUnlocked
      ? "vault locked — click to unlock"
      : null;

  return (
    <div className="aip-root">
      <Field label="Enable AI" hint="Master switch for chat, command palette, and explain">
        <Toggle checked={settings.aiEnabled} onChange={(b) => update("aiEnabled", b)} />
      </Field>

      {settings.aiEnabled && (
        <>
          {vaultBadge && (
            <div className="settings-note" style={{ cursor: "pointer" }} onClick={onRequestVault}>
              {vaultBadge}. API keys are stored encrypted (Argon2id + XChaCha20-Poly1305) in the
              same vault as remote-host passwords.
            </div>
          )}

          <div className="aip-section-h">
            <h3>Providers</h3>
            <span className="aip-sub">
              {providers.length === 0
                ? "install one to enable AI features"
                : `${providers.length} installed${missingSdks.length > 0 ? ` · ${missingSdks.length} more available` : ""}`}
            </span>
          </div>

          {providers.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {providers.map((entry) => {
                const cfg = settings.aiProviderConfig?.[entry.id] ?? {};
                return (
                  <ProviderCard
                    key={entry.id}
                    entry={entry}
                    config={cfg}
                    isDefault={settings.aiDefaultProvider === entry.id}
                    hasKey={!!hasKey[entry.id]}
                    vaultUnlocked={vaultUnlocked}
                    onSetDefault={() => update("aiDefaultProvider", entry.id)}
                    onModelChange={(model) => setProviderConfig(entry.id, { model })}
                    onBaseUrlChange={(baseUrl) => setProviderConfig(entry.id, { baseUrl })}
                    onSetKey={(key) => setKey(entry.id, key)}
                    onClearKey={() => clearKey(entry.id)}
                    onRequestVault={onRequestVault}
                  />
                );
              })}

              {missingSdks.length > 0 && !showAddMore && (
                <button
                  type="button"
                  className="ghost-btn"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => setShowAddMore(true)}
                >
                  + add another provider
                </button>
              )}
              {missingSdks.length > 0 && showAddMore && (
                <div className="aip-install-grid">
                  {missingSdks.map((entry) => (
                    <InstallCard key={entry.providerId} entry={entry} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="aip-section-h">
            <h3>Behavior</h3>
          </div>

          <div className="aip-toggles">
                <Field
                  label="Attach context to chat"
                  hint="Inject recent terminal output as context when asking AI"
                >
                  <Toggle
                    checked={settings.aiAttachContext}
                    onChange={(b) => update("aiAttachContext", b)}
                  />
                </Field>

                <Field
                  label="Right-click explain"
                  hint="Show 'explain' / 'ask AI' on text selection"
                >
                  <Toggle
                    checked={settings.aiExplainEnabled}
                    onChange={(b) => update("aiExplainEnabled", b)}
                  />
                </Field>

                <Field
                  label="Detect Claude Code sessions"
                  hint="Show badge on tabs running `claude` and notify on idle"
                >
                  <Toggle
                    checked={settings.claudeCodeDetectionEnabled}
                    onChange={(b) => update("claudeCodeDetectionEnabled", b)}
                  />
                </Field>

                <Field
                  label="MCP server"
                  hint="Expose mTerminal as a tool for external agents (Claude Code, Codex...)"
                >
                  <Toggle
                    checked={settings.mcpServerEnabled}
                    onChange={(b) => update("mcpServerEnabled", b)}
                  />
                </Field>
          </div>

          {settings.mcpServerEnabled && mcpStatus && (
            <div className="settings-note">
              {mcpStatus.running && mcpStatus.socketPath ? (
                <>
                  <div>
                    socket: <code>{mcpStatus.socketPath}</code>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    add to claude code:
                    <pre
                      style={{
                        background: "color-mix(in oklch, currentColor 6%, transparent)",
                        padding: 6,
                        borderRadius: 4,
                        fontSize: 11,
                        overflow: "auto",
                        marginTop: 4,
                      }}
                    >
{`claude mcp add mterminal --transport stdio "socat - UNIX-CONNECT:${mcpStatus.socketPath}"`}
                    </pre>
                  </div>
                </>
              ) : (
                <span>starting MCP server...</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
