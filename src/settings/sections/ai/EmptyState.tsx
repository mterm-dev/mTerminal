import { SDK_CATALOG } from "./catalog";
import { InstallCard } from "./InstallCard";

/**
 * Shown in the AI Settings panel when no provider extension has been
 * registered yet. Hero card + 3-up install grid for the first-party SDK
 * providers.
 */
export function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="aip-hero">
        <div className="aip-hero-art" aria-hidden>
          <span className="aip-cap">An</span>
          <span className="aip-cap">Cx</span>
          <span className="aip-cap">Ol</span>
        </div>
        <div className="aip-hero-title">No AI provider installed</div>
        <div className="aip-hero-sub">
          mTerminal stays vendor-neutral — pick the AI you want to use and
          install its SDK as an extension. The chat panel, command palette,
          and right-click explain all light up automatically once at least one
          provider is active.
        </div>
      </div>

      <div className="aip-install-grid">
        {SDK_CATALOG.map((entry) => (
          <InstallCard key={entry.providerId} entry={entry} />
        ))}
      </div>
    </div>
  );
}
