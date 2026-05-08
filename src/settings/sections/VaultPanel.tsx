import { useVaultGate } from "../../vault/VaultGate";
import { Field, Group, SectionLabel, type SectionProps } from "./_shared";
import { SelectRow, StatusRow, type StatusTone } from "./_rows";

const VAULT_IDLE_OPTIONS = [
  { label: "5 minutes", value: "300000" },
  { label: "15 minutes", value: "900000" },
  { label: "30 minutes", value: "1800000" },
  { label: "1 hour", value: "3600000" },
  { label: "never", value: "0" },
];

export function VaultPanel({ settings, update }: SectionProps) {
  const vault = useVaultGate();
  const { exists, unlocked, dev } = vault.status;

  const statusLabel = !exists ? "not initialized" : unlocked ? "unlocked" : "locked";
  const statusTone: StatusTone = !exists ? "warn" : unlocked ? "ok" : "off";

  return (
    <>
      <SectionLabel>state</SectionLabel>
      <Group>
        <StatusRow
          label="vault"
          desc="encrypted store backing api keys, ssh passwords, and plugin secrets"
          status={{ label: statusLabel, tone: statusTone }}
        >
          {dev && (
            <span className="st-pill" data-tone="dev">
              dev
            </span>
          )}
        </StatusRow>

        <Field
          label="master password"
          desc={
            !exists
              ? "set a master password to start storing secrets"
              : unlocked
                ? "you can lock the vault now or change the password"
                : "vault is initialized but currently locked"
          }
        >
          {!exists && (
            <button type="button" className="st-btn primary" onClick={() => vault.openModal("init")}>
              set
            </button>
          )}
          {exists && !unlocked && (
            <button type="button" className="st-btn" onClick={() => vault.openModal("unlock")}>
              unlock
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
                lock
              </button>
              <button
                type="button"
                className="st-btn"
                onClick={() => vault.openModal("change")}
              >
                change
              </button>
            </>
          )}
        </Field>
      </Group>

      <SectionLabel>auto-lock</SectionLabel>
      <Group>
        <SelectRow
          label="idle timeout"
          desc="lock the vault after this much keyboard and mouse inactivity"
          value={String(settings.vaultIdleLockMs)}
          options={VAULT_IDLE_OPTIONS}
          onChange={(v) => update("vaultIdleLockMs", Number(v))}
        />
      </Group>
    </>
  );
}
