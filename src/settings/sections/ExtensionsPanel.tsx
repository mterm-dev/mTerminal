import { useEffect, useMemo, useState } from "react";
import {
  getSettingsSchemaRegistry,
} from "../../extensions/registries/settings-schema";
import { getRendererHost, type ManifestSnapshot } from "../../extensions";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";

export { ExtensionSettingsForm } from "./ExtensionDetails";

export function ExtensionsOverview({
  onPickExtension,
  onOpenMarketplace,
}: {
  onPickExtension: (extId: string) => void;
  onOpenMarketplace?: () => void;
}) {
  const host = getRendererHost();
  const [snaps, setSnaps] = useState<ManifestSnapshot[]>(() => host.list());
  useEffect(() => host.subscribe(() => setSnaps(host.list())), [host]);

  const [menu, setMenu] = useState<{ x: number; y: number; snap: ManifestSnapshot } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return [];
    const snap = menu.snap;
    const id = snap.manifest.id;
    const hasSettings = withSettingsIds.has(id);
    const items: MenuItem[] = [];
    if (hasSettings) {
      items.push({ label: "open settings", onSelect: () => onPickExtension(id) });
      items.push({ label: "", separator: true });
    }
    items.push({
      label: snap.enabled ? "disable" : "enable",
      onSelect: () => void toggleEnabled(snap),
    });
    items.push({ label: "reload", onSelect: () => void reloadOne(snap) });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, withSettingsIds]);

  if (sortedSnaps.length === 0) {
    return (
      <>
        {onOpenMarketplace && (
          <div className="ext-toolbar">
            <button type="button" className="ext-marketplace-btn" onClick={onOpenMarketplace}>
              <span className="ext-marketplace-btn-icon">⬡</span>
              <span>browse marketplace</span>
              <span className="ext-marketplace-btn-hint">{marketplaceHotkeyLabel()}</span>
            </button>
          </div>
        )}
        <div className="ext-empty">
          <div className="ext-empty-icon">⬡</div>
          <div className="ext-empty-title">no extensions installed</div>
          <div className="ext-empty-sub">
            install from the marketplace, or drop a folder into{" "}
            <code>~/.mterminal/extensions/&lt;id&gt;/</code> and reload.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {onOpenMarketplace && (
        <div className="ext-toolbar">
          <button type="button" className="ext-marketplace-btn" onClick={onOpenMarketplace}>
            <span className="ext-marketplace-btn-icon">⬡</span>
            <span>browse marketplace</span>
            <span className="ext-marketplace-btn-hint">{marketplaceHotkeyLabel()}</span>
          </button>
        </div>
      )}
      <div className="ext-card-grid">
        {sortedSnaps.map((snap) => {
          const m = snap.manifest;
          const hasSettings = withSettingsIds.has(m.id);
          const isBusy = busyId === m.id;
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
              title={hasSettings ? "open settings · right-click for actions" : "right-click for actions"}
            >
              <div className="ext-card-head">
                <span className="ext-card-name">{m.displayName ?? m.id}</span>
                <span className="ext-card-version">v{m.version}</span>
              </div>
              <div className="ext-card-chips">
                {m.source === "built-in" && (
                  <span className="ext-chip ext-chip--builtin">built-in</span>
                )}
                {!snap.enabled && <span className="ext-chip ext-chip--muted">disabled</span>}
                {!snap.trusted && <span className="ext-chip ext-chip--warn">untrusted</span>}
                {snap.state === "error" && <span className="ext-chip ext-chip--error">error</span>}
                {snap.state === "active" && snap.enabled && snap.trusted && (
                  <span className="ext-chip ext-chip--active">● active</span>
                )}
                {isBusy && <span className="ext-chip ext-chip--muted">working…</span>}
              </div>
              <div className="ext-card-sub">{summarize(m)}</div>
              {hasSettings && <div className="ext-card-cta">⚙ open settings →</div>}
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

function marketplaceHotkeyLabel(): string {
  const isMac = (window as { mt?: { platform?: string } }).mt?.platform === "darwin";
  return isMac ? "⌘⇧X" : "Ctrl+Shift+X";
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
  return parts.length ? parts.join(" · ") : "no contributions";
}
