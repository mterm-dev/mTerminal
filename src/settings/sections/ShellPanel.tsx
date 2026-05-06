import { Field, type SectionProps } from "./_shared";

export function ShellPanel({ settings, update }: SectionProps) {
  return (
    <>
      <Field
        label="Shell override"
        hint="Leave empty to use login shell from /etc/passwd"
      >
        <input
          type="text"
          value={settings.shellOverride}
          onChange={(e) => update("shellOverride", e.target.value)}
          placeholder="/bin/zsh"
        />
      </Field>
      <Field
        label="Shell arguments"
        hint="Space-separated. Example: -l for login shell"
      >
        <input
          type="text"
          value={settings.shellArgs}
          onChange={(e) => update("shellArgs", e.target.value)}
          placeholder=""
        />
      </Field>
      <div className="settings-note">
        Changes apply to <strong>new tabs</strong>. Existing tabs keep their current shell.
      </div>
    </>
  );
}
