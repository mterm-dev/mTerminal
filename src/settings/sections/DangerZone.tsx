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
    notify.success({ title: "ai keys cleared", message: `${removed} keys removed` });
  };

  const resetDevVault = async () => {
    try {
      await vault.devReset();
      notify.success({ title: "vault reset", message: "development vault cleared" });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      notify.error({ title: "vault reset failed", message: e.message, details: e.stack });
    }
  };

  return (
    <>
      <SectionLabel>destructive actions</SectionLabel>
      <Group>
        <DangerRow
          label="reset all settings"
          desc="restore defaults for every preference. ui state (sidebar width, ai panel state) is untouched."
          actionLabel="reset"
          confirm="Reset all settings to defaults?"
          onClick={onResetSettings}
        />
        <DangerRow
          label="clear ai api keys"
          desc={
            unlocked
              ? keyCount > 0
                ? `${keyCount} provider keys are stored in the vault and will be deleted`
                : "no keys are currently stored"
              : "unlock the vault first"
          }
          actionLabel="clear keys"
          disabled={!unlocked || keyCount === 0}
          confirm="Remove all stored AI API keys?"
          onClick={() => {
            void clearAllKeys();
          }}
        />
        {dev && (
          <DangerRow
            label="reset development vault"
            desc="delete vault.dev.bin and start fresh. only affects dev mode; the production vault is left alone."
            actionLabel="reset dev vault"
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
