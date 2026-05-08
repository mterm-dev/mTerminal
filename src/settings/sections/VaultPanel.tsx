import { useVaultGate } from "../../vault/VaultGate";
import { notify } from "../../lib/notify";
import { Field, type SectionProps } from "./_shared";

const VAULT_IDLE_OPTIONS: Array<{ ms: number; label: string }> = [
  { ms: 5 * 60 * 1000, label: "5 minutes" },
  { ms: 15 * 60 * 1000, label: "15 minutes" },
  { ms: 30 * 60 * 1000, label: "30 minutes" },
  { ms: 60 * 60 * 1000, label: "1 hour" },
  { ms: 0, label: "never" },
];

export function VaultPanel({ settings, update }: SectionProps) {
  const vault = useVaultGate();
  const { exists, unlocked, dev } = vault.status;

  const statusLabel = !exists
    ? "not initialized"
    : unlocked
      ? "unlocked"
      : "locked";
  const statusTone = !exists ? "warn" : unlocked ? "ok" : "off";

  const handleDevReset = async (): Promise<void> => {
    const ok = await notify.confirm({
      title: "reset development vault",
      message:
        "This deletes vault.dev.bin and any AI keys / SSH passwords / plugin secrets stored in it. The production vault is not touched.",
      confirmLabel: "reset",
      danger: true,
    });
    if (!ok) return;
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
      <Field
        label="Status"
        hint="State of the encrypted secret store backing AI keys, SSH passwords, and plugin secrets"
      >
        <div className="vault-actions-row" style={{ alignItems: "center" }}>
          <span className="vault-status-pill" data-tone={statusTone}>
            <span className="vault-status-dot" aria-hidden="true" />
            {statusLabel}
          </span>
          {dev && (
            <span
              className="vault-status-pill"
              data-tone="dev"
              title="Development mode uses vault.dev.bin separately from the production vault"
            >
              dev
            </span>
          )}
        </div>
      </Field>

      <Field label="Master password">
        <div className="vault-actions-row">
          {!exists && (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => vault.openModal("init")}
            >
              set master password
            </button>
          )}
          {exists && !unlocked && (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => vault.openModal("unlock")}
            >
              unlock
            </button>
          )}
          {exists && unlocked && (
            <>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  void vault.lock();
                }}
              >
                lock now
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => vault.openModal("change")}
              >
                change master password
              </button>
            </>
          )}
        </div>
      </Field>

      <Field
        label="Auto-lock when idle"
        hint="Lock the vault after this much keyboard/mouse inactivity"
      >
        <select
          value={String(settings.vaultIdleLockMs)}
          onChange={(e) => update("vaultIdleLockMs", Number(e.target.value))}
        >
          {VAULT_IDLE_OPTIONS.map((opt) => (
            <option key={opt.ms} value={opt.ms}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <p className="settings-note">
        Master password is stretched with Argon2id (m=64 MiB, t=3, p=4) and
        used as a key for XChaCha20-Poly1305. The vault file lives at{" "}
        <code>{vaultPathHint(dev)}</code>. If you forget the password, saved
        AI keys and SSH passwords are not recoverable — but plain SSH key
        auth and unsaved hosts keep working.
      </p>

      {dev && (
        <Field
          label="Reset development vault"
          hint="Delete vault.dev.bin and start fresh. Only available in dev mode; production vault is never touched."
        >
          <button
            type="button"
            className="ghost-btn vault-danger-btn"
            onClick={() => {
              void handleDevReset();
            }}
          >
            reset dev vault
          </button>
        </Field>
      )}
    </>
  );
}

function vaultPathHint(dev: boolean | undefined): string {
  const file = dev ? "vault.dev.bin" : "vault.bin";
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent;
    if (/Mac OS X/i.test(ua)) {
      return `~/Library/Application Support/mterminal/${file}`;
    }
    if (/Windows/i.test(ua)) return `%APPDATA%\\mterminal\\${file}`;
  }
  return `$XDG_CONFIG_HOME/mterminal/${file}`;
}
