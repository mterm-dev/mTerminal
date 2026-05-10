import { useEffect, useMemo, useState } from "react";
import {
  getSettingsSchemaRegistry,
} from "../../extensions/registries/settings-schema";
import { getRendererHost, type ManifestSnapshot } from "../../extensions";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { BrowseTab } from "../../marketplace/components/BrowseTab";
import { UpdatesTab } from "../../marketplace/components/UpdatesTab";
import { ExtensionDetailsView } from "../../marketplace/components/ExtensionDetailsView";
import { useUpdates } from "../../marketplace/hooks/useUpdates";
import { useInstallActions } from "../../marketplace/hooks/useMarketplace";
import { marketplaceApi } from "../../marketplace/api";
import type { ExtSummary, InstalledWithMeta } from "../../marketplace/types";

export { ExtensionSettingsForm } from "./ExtensionDetails";

export type ExtensionsView = "installed" | "browse" | "updates";

export function ExtensionsOverview({
  onPickExtension,
  initialView = "installed",
}: {
  onPickExtension: (extId: string) => void;
  initialView?: ExtensionsView;
}) {
  const [view, setView] = useState<ExtensionsView>(initialView);
  const [browseSelectedId, setBrowseSelectedId] = useState<string | null>(null);
  const [marketplaceInstalled, setMarketplaceInstalled] = useState<InstalledWithMeta[]>([]);

  const refreshMarketplaceInstalled = async (): Promise<void> => {
    try {
      const list = await marketplaceApi.listInstalled();
      setMarketplaceInstalled(list);
    } catch {
      setMarketplaceInstalled([]);
    }
  };

  useEffect(() => {
    void refreshMarketplaceInstalled();
  }, []);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    setBrowseSelectedId(null);
  }, [view]);

  const { count: updateCount } = useUpdates();

  const installedIds = useMemo(
    () => new Set(marketplaceInstalled.map((it) => it.id)),
    [marketplaceInstalled],
  );

  const installedVersionFor = (id: string): string | null =>
    marketplaceInstalled.find((it) => it.id === id)?.installedVersion ?? null;

  return (
    <>
      <div className="ext-subtabs" role="tablist">
        <SubTabButton active={view === "installed"} onClick={() => setView("installed")}>
          Installed
        </SubTabButton>
        <SubTabButton active={view === "browse"} onClick={() => setView("browse")}>
          Browse
        </SubTabButton>
        <SubTabButton active={view === "updates"} onClick={() => setView("updates")}>
          Updates
          {updateCount > 0 && <span className="ext-subtab-badge">{updateCount}</span>}
        </SubTabButton>
      </div>

      {view === "installed" && (
        <InstalledList
          onPickExtension={onPickExtension}
          marketplaceInstalledIds={installedIds}
          refreshMarketplaceInstalled={refreshMarketplaceInstalled}
        />
      )}

      {view === "browse" &&
        (browseSelectedId ? (
          <ExtensionDetailsView
            id={browseSelectedId}
            installedVersion={installedVersionFor(browseSelectedId)}
            onBack={() => setBrowseSelectedId(null)}
            onChanged={() => void refreshMarketplaceInstalled()}
          />
        ) : (
          <BrowseTab
            installedIds={installedIds}
            onSelect={(ext: ExtSummary) => setBrowseSelectedId(ext.id)}
          />
        ))}

      {view === "updates" && <UpdatesTab />}
    </>
  );
}

function SubTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`ext-subtab${active ? " active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function InstalledList({
  onPickExtension,
  marketplaceInstalledIds,
  refreshMarketplaceInstalled,
}: {
  onPickExtension: (extId: string) => void;
  marketplaceInstalledIds: Set<string>;
  refreshMarketplaceInstalled: () => Promise<void>;
}) {
  const host = getRendererHost();
  const [snaps, setSnaps] = useState<ManifestSnapshot[]>(() => host.list());
  useEffect(() => host.subscribe(() => setSnaps(host.list())), [host]);

  const [menu, setMenu] = useState<{ x: number; y: number; snap: ManifestSnapshot } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { uninstall, busy: uninstallBusy } = useInstallActions();

  const withSettingsIds = useMemo(() => {
    const ids = new Set(getSettingsSchemaRegistry().list().map((e) => e.extId));
    for (const s of snaps) {
      if (s.manifest.contributes.secrets.length > 0) ids.add(s.manifest.id);
      if (s.manifest.contributes.aiBindings.length > 0) ids.add(s.manifest.id);
    }
    return ids;
  }, [snaps]);

  const sortedSnaps = useMemo(() => {
    return [...snaps].sort((a, b) => {
      const sa = a.manifest.source === "built-in" ? 0 : 1;
      const sb = b.manifest.source === "built-in" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return (a.manifest.displayName ?? a.manifest.id).localeCompare(
        b.manifest.displayName ?? b.manifest.id,
      );
    });
  }, [snaps]);

  const reloadOne = async (snap: ManifestSnapshot): Promise<void> => {
    setBusyId(snap.manifest.id);
    try {
      await host.reload(snap.manifest.id);
    } catch (err) {
      console.error(`[ext] reload(${snap.manifest.id}) failed:`, err);
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (snap: ManifestSnapshot): Promise<void> => {
    setBusyId(snap.manifest.id);
    try {
      if (snap.enabled) {
        await window.mt.ext.disable(snap.manifest.id);
        try {
          await host.deactivate(snap.manifest.id);
        } catch {
          /* ignore */
        }
      } else {
        await window.mt.ext.enable(snap.manifest.id);
      }
      await host.refreshSnapshots();
      if (!snap.enabled) {
        const fresh = host.list().find((s) => s.manifest.id === snap.manifest.id);
        if (fresh?.enabled && fresh.manifest.activationEvents.includes("onStartupFinished")) {
          try {
            await host.activate(snap.manifest.id);
          } catch (err) {
            console.error(`[ext] activate(${snap.manifest.id}) failed:`, err);
          }
        }
      }
    } finally {
      setBusyId(null);
    }
  };

  const uninstallOne = async (snap: ManifestSnapshot): Promise<void> => {
    setBusyId(snap.manifest.id);
    try {
      const ok = await uninstall(snap.manifest.id);
      if (ok) {
        await refreshMarketplaceInstalled();
        await host.refreshSnapshots();
      }
    } finally {
      setBusyId(null);
    }
  };

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return [];
    const snap = menu.snap;
    const id = snap.manifest.id;
    const hasSettings = withSettingsIds.has(id);
    const items: MenuItem[] = [];
    if (hasSettings) {
      items.push({ label: "Open settings", onSelect: () => onPickExtension(id) });
      items.push({ label: "", separator: true });
    }
    items.push({
      label: snap.enabled ? "Disable" : "Enable",
      onSelect: () => void toggleEnabled(snap),
    });
    items.push({ label: "Reload", onSelect: () => void reloadOne(snap) });
    if (snap.manifest.source !== "built-in" && marketplaceInstalledIds.has(id)) {
      items.push({ label: "", separator: true });
      items.push({
        label: "Uninstall",
        danger: true,
        onSelect: () => void uninstallOne(snap),
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, withSettingsIds, marketplaceInstalledIds]);

  if (sortedSnaps.length === 0) {
    return (
      <div className="ext-empty">
        <div className="ext-empty-icon">⬡</div>
        <div className="ext-empty-title">No extensions installed</div>
        <div className="ext-empty-sub">
          Install from the marketplace, or drop a folder into{" "}
          <code>~/.mterminal/extensions/&lt;id&gt;/</code> and reload.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="ext-card-grid">
        {sortedSnaps.map((snap) => {
          const m = snap.manifest;
          const hasSettings = withSettingsIds.has(m.id);
          const isBusy = busyId === m.id || (uninstallBusy && busyId === m.id);
          return (
            <button
              key={m.id}
              type="button"
              className={`ext-card ${hasSettings ? "" : "ext-card--no-settings"}`}
              aria-disabled={hasSettings ? undefined : true}
              onClick={() => {
                if (hasSettings) onPickExtension(m.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY, snap });
              }}
              title={hasSettings ? "Open settings · right-click for actions" : "Right-click for actions"}
            >
              <div className="ext-card-head">
                <span className="ext-card-name">{m.displayName ?? m.id}</span>
                <span className="ext-card-version">v{m.version}</span>
              </div>
              <div className="ext-card-chips">
                {m.source === "built-in" && (
                  <span className="ext-chip ext-chip--builtin">Built-in</span>
                )}
                {!snap.enabled && <span className="ext-chip ext-chip--muted">Disabled</span>}
                {!snap.trusted && <span className="ext-chip ext-chip--warn">Untrusted</span>}
                {snap.state === "error" && <span className="ext-chip ext-chip--error">Error</span>}
                {snap.state === "active" && snap.enabled && snap.trusted && (
                  <span className="ext-chip ext-chip--active">● Active</span>
                )}
                {isBusy && <span className="ext-chip ext-chip--muted">Working…</span>}
              </div>
              <div className="ext-card-sub">{summarize(m)}</div>
              {hasSettings && <div className="ext-card-cta">⚙ Open settings →</div>}
            </button>
          );
        })}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </>
  );
}

function summarize(m: ManifestSnapshot["manifest"]): string {
  const parts: string[] = [];
  if (m.contributes.commands.length) parts.push(`${m.contributes.commands.length} commands`);
  if (m.contributes.panels.length) parts.push(`${m.contributes.panels.length} panels`);
  if (m.contributes.statusBar.length) parts.push(`${m.contributes.statusBar.length} status items`);
  if (m.contributes.themes.length) parts.push(`${m.contributes.themes.length} themes`);
  if (m.contributes.tabTypes.length) parts.push(`${m.contributes.tabTypes.length} tab types`);
  if (m.contributes.decorators.length)
    parts.push(`${m.contributes.decorators.length} decorators`);
  return parts.length ? parts.join(" · ") : "No contributions";
}
