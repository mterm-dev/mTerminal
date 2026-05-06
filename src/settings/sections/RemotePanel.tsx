import { Field, Toggle, type SectionProps } from "./_shared";

export function RemotePanel({ settings, update }: SectionProps) {
  return (
    <>
      <Field
        label="Remote workspace"
        hint="adds an SSH workspace to the sidebar with saved hosts, key picker, and master-password protected vault for saved passwords"
      >
        <Toggle
          checked={settings.remoteWorkspaceEnabled}
          onChange={(b) => update("remoteWorkspaceEnabled", b)}
        />
      </Field>
      <div className="settings-note">
        when enabled, hosts are stored in <code>$XDG_CONFIG_HOME/mterminal/hosts.json</code>.
        saved passwords are encrypted with your master password
        (<code>vault.bin</code>) using Argon2id + XChaCha20-Poly1305.
        password auth requires <code>sshpass</code>; key auth and ssh-agent work without it.
        disabling this hides the sidebar section but does NOT delete saved data —
        re-enabling restores everything. running remote sessions are not killed.
      </div>
    </>
  );
}
