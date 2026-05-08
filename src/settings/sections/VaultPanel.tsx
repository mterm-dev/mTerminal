import { useVaultGate } from "../../vault/VaultGate";
import { Field, Group, SectionLabel, type SectionProps } from "./_shared";
import { SelectRow, StatusRow, type StatusTone } from "./_rows";

const VAULT_IDLE_OPTIONS = [
  { label: "5 minutes", value: "300000" },
  { label: "15 minutes", value: "900000" },
  { label: "30 minutes", value: "1800000" },
  { label: "1 hour", value: "3600000" },
  { label: "Never", value: "0" },
];

export function VaultPanel({ settings, update }: SectionProps) {
  const vault = useVaultGate();
  const { exists, unlocked, dev } = vault.status;

  const statusLabel = !exists ? "Not initialized" : unlocked ? "Unlocked" : "Locked";
  const statusTone: StatusTone = !exists ? "warn" : unlocked ? "ok" : "off";

  return (
    <>
      <SectionLabel>State</SectionLabel>
      <Group>
        <StatusRow
          label="Vault"
          desc="Encrypted store backing API keys, SSH passwords, and plugin secrets"
          status={{ label: statusLabel, tone: statusTone }}
        >
          {dev && (
            <span className="st-pill" data-tone="dev">
              Dev
            </span>
          )}
        </StatusRow>

        <Field
          label="Master password"
          desc={
            !exists
              ? "Set a master password to start storing secrets"
              : unlocked
                ? "You can lock the vault now or change the password"
                : "Vault is initialized but currently locked"
          }
        >
          {!exists && (
            <button type="button" className="st-btn primary" onClick={() => vault.openModal("init")}>
              Set
            </button>
          )}
          {exists && !unlocked && (
            <button type="button" className="st-btn" onClick={() => vault.openModal("unlock")}>
              Unlock
            </button>
          )}
          {exists && unlocked && (
            <>
              <button
                type="button"
                className="st-btn"
                onClick={() => {
                  void vault.lock();
                }}
              >
                Lock
              </button>
              <button
                type="button"
                className="st-btn"
                onClick={() => vault.openModal("change")}
              >
                Change
              </button>
            </>
          )}
        </Field>
      </Group>

      <SectionLabel>Auto-lock</SectionLabel>
      <Group>
        <SelectRow
          label="Idle timeout"
          desc="Lock the vault after this much keyboard and mouse inactivity"
          value={String(settings.vaultIdleLockMs)}
          options={VAULT_IDLE_OPTIONS}
          onChange={(v) => update("vaultIdleLockMs", Number(v))}
        />
      </Group>
    </>
  );
}
