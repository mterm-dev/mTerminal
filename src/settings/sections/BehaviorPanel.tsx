import { Field, Toggle, type SectionProps } from "./_shared";

export function BehaviorPanel({ settings, update }: SectionProps) {
  return (
    <>
      <Field
        label="Confirm close with multiple tabs"
        hint="Ask before quitting if more than one tab is open"
      >
        <Toggle
          checked={settings.confirmCloseMultipleTabs}
          onChange={(b) => update("confirmCloseMultipleTabs", b)}
        />
      </Field>
      <Field label="Copy on select" hint="Auto-copy selection to clipboard">
        <Toggle
          checked={settings.copyOnSelect}
          onChange={(b) => update("copyOnSelect", b)}
        />
      </Field>
      <Field
        label="mTerminal greeting"
        hint="Show themed banner on shell startup (fish only)"
      >
        <Toggle
          checked={settings.showGreeting}
          onChange={(b) => update("showGreeting", b)}
        />
      </Field>
    </>
  );
}
