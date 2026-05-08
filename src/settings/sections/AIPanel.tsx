import { useEffect } from "react";
import { useAIKeys } from "../../hooks/useAIKeys";
import { useAiProviders } from "../../lib/ai-availability";
import { Field, Group, SectionLabel, type VaultSectionProps } from "./_shared";
import { ToggleRow } from "./_rows";
import { ensureStyles } from "./ai/styles";
import { AgentIntegrations } from "./ai/AgentIntegrations";
import { AgentSound } from "./ai/AgentSound";
import { EmptyState } from "./ai/EmptyState";
import { ProviderCard } from "./ai/ProviderCard";
import type { AiProviderConfig } from "../useSettings";

interface Props extends VaultSectionProps {
  mcpStatus?: { running: boolean; socketPath: string | null };
}

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

  const vaultLabel = !vaultExists
    ? "vault not initialized"
    : !vaultUnlocked
      ? "vault locked"
      : null;

  return (
    <>
      <SectionLabel>master switch</SectionLabel>
      <Group>
        <ToggleRow
          label="enable ai"
          desc="turns on the ai panel, command palette, and right-click explain"
          checked={settings.aiEnabled}
          onChange={(b) => update("aiEnabled", b)}
        />
      </Group>

      {settings.aiEnabled && (
        <>
          {vaultLabel && (
            <Group>
              <Field
                label={vaultLabel}
                desc="api keys are stored encrypted in the vault. unlock to manage them."
              >
                <button type="button" className="st-btn primary" onClick={onRequestVault}>
                  {!vaultExists ? "set up" : "unlock"}
                </button>
              </Field>
            </Group>
          )}

          <SectionLabel>
            providers · {providers.length === 0 ? "none available" : `${providers.length} available`}
          </SectionLabel>
          {providers.length === 0 ? (
            <Group>
              <EmptyState />
            </Group>
          ) : (
            <Group>
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
            </Group>
          )}

          <AgentIntegrations />

          <SectionLabel>completion sound</SectionLabel>
          <Group>
            <AgentSound settings={settings} update={update} />
          </Group>

          <SectionLabel>behavior</SectionLabel>
          <Group>
            <ToggleRow
              label="attach terminal output to chat"
              desc="inject the active tab's recent output as context for chat questions"
              checked={settings.aiAttachContext}
              onChange={(b) => update("aiAttachContext", b)}
            />
            <ToggleRow
              label="right-click explain"
              desc="show 'explain' in the terminal context menu when text is selected"
              checked={settings.aiExplainEnabled}
              onChange={(b) => update("aiExplainEnabled", b)}
            />
            <ToggleRow
              label="detect ai agent sessions"
              desc="watch tabs running claude / codex / codex-cli to badge them and notify when they finish or wait for input"
              checked={settings.claudeCodeDetectionEnabled}
              onChange={(b) => update("claudeCodeDetectionEnabled", b)}
            />
            <ToggleRow
              label="mcp server"
              desc={
                settings.mcpServerEnabled && mcpStatus?.running && mcpStatus.socketPath
                  ? `socket: ${mcpStatus.socketPath}`
                  : settings.mcpServerEnabled
                    ? "starting…"
                    : "expose mTerminal as a tool for external agents (claude code, codex…)"
              }
              checked={settings.mcpServerEnabled}
              onChange={(b) => update("mcpServerEnabled", b)}
            />
          </Group>
        </>
      )}
    </>
  );
}
