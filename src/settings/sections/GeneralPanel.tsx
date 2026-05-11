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
      <SectionLabel>Workflow</SectionLabel>
      <Group>
        <ToggleRow
          label="Confirm close with multiple tabs"
          desc="Ask before quitting if more than one tab is open"
          checked={settings.confirmCloseMultipleTabs}
          onChange={(b) => update("confirmCloseMultipleTabs", b)}
        />
        <ToggleRow
          label="Copy on select"
          desc="Automatically copy terminal selection to the system clipboard"
          checked={settings.copyOnSelect}
          onChange={(b) => update("copyOnSelect", b)}
        />
        <ToggleRow
          label="Shell greeting banner"
          desc="Show the themed banner on startup (fish only)"
          checked={settings.showGreeting}
          onChange={(b) => update("showGreeting", b)}
        />
      </Group>

      <SectionLabel>Updates</SectionLabel>
      <Group>
        <ToggleRow
          label="Receive beta updates"
          desc="Includes pre-release builds. May be less stable."
          checked={settings.updaterBetaChannel}
          onChange={(b) => {
            update("updaterBetaChannel", b);
            const u = (window as unknown as {
              mt?: { updater?: { setBetaChannel?: (v: boolean) => Promise<boolean> } };
            }).mt?.updater;
            if (u?.setBetaChannel) void u.setBetaChannel(b).catch(() => {});
          }}
        />
      </Group>

      <SectionLabel>Marketplace</SectionLabel>
      <Group>
        <TextRow
          label="Endpoint"
          desc="Custom marketplace API base URL; leave empty to use the default"
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
