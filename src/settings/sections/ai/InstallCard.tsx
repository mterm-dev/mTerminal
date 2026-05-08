import { useState } from "react";
import type { SdkCatalogEntry } from "./catalog";

interface MarketplaceApi {
  install: (id: string, version?: string) => Promise<unknown>;
}

function marketplace(): MarketplaceApi | null {
  if (typeof window === "undefined") return null;
  const mt = (window as unknown as { mt?: { marketplace?: MarketplaceApi } }).mt;
  return mt?.marketplace ?? null;
}

interface Props {
  entry: SdkCatalogEntry;
  /** Notified when install starts (so the parent can refresh the registry view). */
  onInstalled?: () => void;
}

export function InstallCard({ entry, onInstalled }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const install = async (): Promise<void> => {
    const api = marketplace();
    if (!api) {
      setError("Marketplace API unavailable in this environment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.install(entry.marketplaceId);
      onInstalled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aip-install-card">
      <div className="aip-install-card-h">
        <span className={`aip-logo aip-logo-${entry.providerId}`}>{entry.initials}</span>
        <span className="aip-install-card-name">{entry.label}</span>
      </div>
      <div className="aip-install-card-desc">{entry.description}</div>
      {error && <div className="settings-note" style={{ color: "var(--c-orange)" }}>{error}</div>}
      <div className="aip-install-card-foot">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => void install()}
          disabled={busy}
        >
          {busy ? "installing…" : "install"}
        </button>
        {entry.link && (
          <a
            href={entry.link}
            target="_blank"
            rel="noopener noreferrer"
            className="aip-link"
            style={{ alignSelf: "center" }}
          >
            docs ↗
          </a>
        )}
      </div>
    </div>
  );
}
