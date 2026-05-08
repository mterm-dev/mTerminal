import { useAiProviders } from "../../lib/ai-availability";
import { useAIKeys } from "../../hooks/useAIKeys";
import { useVaultGate } from "../../vault/VaultGate";
import { notify } from "../../lib/notify";
import { Group, SectionLabel } from "./_shared";
import { DangerRow } from "./_rows";

export function DangerZone({ onResetSettings }: { onResetSettings: () => void }) {
  const vault = useVaultGate();
  const { dev, unlocked } = vault.status;
  const providers = useAiProviders();
  const { hasKey, clearKey } = useAIKeys(unlocked);

  const keyCount = Object.values(hasKey).filter(Boolean).length;

  const clearAllKeys = async () => {
    let removed = 0;
    for (const p of providers) {
      if (hasKey[p.id]) {
        try {
          await clearKey(p.id);
          removed++;
        } catch (e) {
          console.warn("[danger] failed to clear key for", p.id, e);
        }
      }
    }
    notify.success({ title: "AI keys cleared", message: `${removed} keys removed` });
  };

  const resetDevVault = async () => {
    try {
      await vault.devReset();
      notify.success({ title: "Vault reset", message: "Development vault cleared" });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      notify.error({ title: "Vault reset failed", message: e.message, details: e.stack });
    }
  };

  return (
    <>
      <SectionLabel>Destructive actions</SectionLabel>
      <Group>
        <DangerRow
          label="Reset all settings"
          desc="Restore defaults for every preference. UI state (sidebar width, AI panel state) is untouched."
          actionLabel="Reset"
          confirm="Reset all settings to defaults?"
          onClick={onResetSettings}
        />
        <DangerRow
          label="Clear AI API keys"
          desc={
            unlocked
              ? keyCount > 0
                ? `${keyCount} provider keys are stored in the vault and will be deleted`
                : "No keys are currently stored"
              : "Unlock the vault first"
          }
          actionLabel="Clear keys"
          disabled={!unlocked || keyCount === 0}
          confirm="Remove all stored AI API keys?"
          onClick={() => {
            void clearAllKeys();
          }}
        />
        {dev && (
          <DangerRow
            label="Reset development vault"
            desc="Delete vault.dev.bin and start fresh. Only affects dev mode; the production vault is left alone."
            actionLabel="Reset dev vault"
            confirm="Delete the development vault?"
            onClick={() => {
              void resetDevVault();
            }}
          />
        )}
      </Group>
    </>
  );
}
