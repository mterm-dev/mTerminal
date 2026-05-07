import { useEffect, useState } from "react";
import { Field, Toggle, type SectionProps } from "./_shared";

interface MarketplaceMtApi {
  setEndpoint: (url: string | null) => Promise<unknown>;
  getEndpoint: () => Promise<unknown>;
}

function marketplaceMtApi(): MarketplaceMtApi | null {
  if (typeof window === "undefined") return null;
  const mt = (window as unknown as { mt?: { marketplace?: MarketplaceMtApi } }).mt;
  return mt?.marketplace ?? null;
}

export function BehaviorPanel({ settings, update }: SectionProps) {
  const [endpoint, setEndpoint] = useState<string>(
    settings.marketplaceEndpoint ?? "",
  );
  const [resolved, setResolved] = useState<string>("");

  useEffect(() => {
    setEndpoint(settings.marketplaceEndpoint ?? "");
  }, [settings.marketplaceEndpoint]);

  useEffect(() => {
    const api = marketplaceMtApi();
    if (!api) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = (await api.getEndpoint()) as
          | { ok: boolean; value?: string }
          | undefined;
        if (!cancelled && res?.ok && typeof res.value === "string") {
          setResolved(res.value);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.marketplaceEndpoint]);

  const commitEndpoint = (value: string) => {
    const trimmed = value.trim();
    update("marketplaceEndpoint", trimmed.length > 0 ? trimmed : undefined);
    const api = marketplaceMtApi();
    if (api) {
      void api.setEndpoint(trimmed.length > 0 ? trimmed : null);
    }
  };

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
      <div
        style={{
          marginTop: 16,
          marginBottom: 6,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--fg-dim, #888)",
        }}
      >
        advanced
      </div>
      <Field
        label="marketplace endpoint"
        hint={
          resolved
            ? `currently using ${resolved}`
            : "leave empty for default"
        }
      >
        <input
          type="text"
          className="settings-input"
          value={endpoint}
          placeholder="leave empty for default"
          onChange={(e) => setEndpoint(e.target.value)}
          onBlur={() => commitEndpoint(endpoint)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEndpoint(endpoint);
          }}
          spellCheck={false}
          autoComplete="off"
        />
      </Field>
    </>
  );
}
