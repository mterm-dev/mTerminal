import { useEffect, useState } from "react";
import { Group, SectionLabel, type SectionProps } from "./_shared";
import { TextRow, ToggleRow } from "./_rows";

export function GeneralPanel({ settings, update }: SectionProps) {
  const [endpoint, setEndpoint] = useState<string>(settings.marketplaceEndpoint ?? "");

  useEffect(() => {
    setEndpoint(settings.marketplaceEndpoint ?? "");
  }, [settings.marketplaceEndpoint]);

  const commit = (value: string) => {
    const trimmed = value.trim();
    update("marketplaceEndpoint", trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <>
      <SectionLabel>workflow</SectionLabel>
      <Group>
        <ToggleRow
          label="confirm close with multiple tabs"
          desc="ask before quitting if more than one tab is open"
          checked={settings.confirmCloseMultipleTabs}
          onChange={(b) => update("confirmCloseMultipleTabs", b)}
        />
        <ToggleRow
          label="copy on select"
          desc="automatically copy terminal selection to the system clipboard"
          checked={settings.copyOnSelect}
          onChange={(b) => update("copyOnSelect", b)}
        />
        <ToggleRow
          label="shell greeting banner"
          desc="show the themed banner on startup (fish only)"
          checked={settings.showGreeting}
          onChange={(b) => update("showGreeting", b)}
        />
      </Group>

      <SectionLabel>marketplace</SectionLabel>
      <Group>
        <TextRow
          label="endpoint"
          desc="custom marketplace api base url; leave empty to use the default"
          value={endpoint}
          placeholder="https://marketplace.example.com"
          onChange={(v) => {
            setEndpoint(v);
            commit(v);
          }}
          grow
        />
      </Group>
    </>
  );
}
