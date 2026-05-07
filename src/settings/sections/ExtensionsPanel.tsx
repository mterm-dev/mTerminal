import { useEffect, useMemo, useState } from "react";
import { Field, Toggle, type SectionProps } from "./_shared";
import {
  getSettingsSchemaRegistry,
  type SettingsSchemaEntry,
} from "../../extensions/registries/settings-schema";
import { getRendererHost, type ManifestSnapshot } from "../../extensions";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";

/**
 * Two views in one file:
 *
 *   <ExtensionsOverview>     — landing page when the user clicks "Extensions"
 *                              in the sidebar nav. Stat strip + grid of
 *                              extension cards. Cards with settings are
 *                              clickable; clicking jumps to the per-plugin
 *                              page through the parent.
 *
 *   <ExtensionSettingsForm>  — auto-rendered form for one plugin's settings
 *                              schema. Used when the user picks a sub-nav
 *                              entry under "Extensions".
 *
 * Visuals are driven by CSS classes in `src/styles/theme.css` (.ext-*) so
 * the look matches the rest of Settings (rounded cards, theme tokens,
 * accent borders on focus, etc.).
 */

interface PropSchema {
  type?: "string" | "number" | "boolean";
  enum?: Array<string | number>;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  format?: "password" | string;
}

interface ObjectSchema {
  type?: "object";
  properties?: Record<string, PropSchema>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────────────────────

export function ExtensionsOverview({
  onPickExtension,
}: {
  onPickExtension: (extId: string) => void;
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

  if (sortedSnaps.length === 0) {
    return (
      <div className="ext-empty">
        <div className="ext-empty-icon">⬡</div>
        <div className="ext-empty-title">No extensions installed</div>
        <div className="ext-empty-sub">
          Drop an extension folder into{" "}
          <code>~/.mterminal/extensions/&lt;id&gt;/</code> and click{" "}
          <em>Reload all</em> in the Plugin Manager.
        </div>
      </div>
    );
  }

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return [];
    const snap = menu.snap;
    const id = snap.manifest.id;
    const hasSettings = withSettingsIds.has(id);
    const items: MenuItem[] = [];
    if (hasSettings) {
      items.push({
        label: "Open settings",
        onSelect: () => onPickExtension(id),
      });
      items.push({ label: "", separator: true });
    }
    items.push({
      label: snap.enabled ? "Disable" : "Enable",
      onSelect: () => void toggleEnabled(snap),
    });
    items.push({
      label: "Reload",
      onSelect: () => void reloadOne(snap),
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, withSettingsIds]);

  return (
    <>
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
              title={
                hasSettings
                  ? "Open settings  ·  right-click for actions"
                  : "Right-click for actions"
              }
            >
              <div className="ext-card-head">
                <span className="ext-card-name">{m.displayName ?? m.id}</span>
                <span className="ext-card-version">v{m.version}</span>
              </div>
              <div className="ext-card-chips">
                {m.source === "built-in" && (
                  <span className="ext-chip ext-chip--builtin">built-in</span>
                )}
                {!snap.enabled && (
                  <span className="ext-chip ext-chip--muted">disabled</span>
                )}
                {!snap.trusted && (
                  <span className="ext-chip ext-chip--warn">untrusted</span>
                )}
                {snap.state === "error" && (
                  <span className="ext-chip ext-chip--error">error</span>
                )}
                {snap.state === "active" && snap.enabled && snap.trusted && (
                  <span className="ext-chip ext-chip--active">● active</span>
                )}
                {isBusy && (
                  <span className="ext-chip ext-chip--muted">working…</span>
                )}
              </div>
              <div className="ext-card-sub">{summarize(m)}</div>
              {hasSettings && (
                <div className="ext-card-cta">⚙ Open settings →</div>
              )}
            </button>
          );
        })}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

function summarize(m: ManifestSnapshot["manifest"]): string {
  const parts: string[] = [];
  if (m.contributes.commands.length) parts.push(`${m.contributes.commands.length} commands`);
  if (m.contributes.panels.length) parts.push(`${m.contributes.panels.length} panels`);
  if (m.contributes.statusBar.length)
    parts.push(`${m.contributes.statusBar.length} status items`);
  if (m.contributes.themes.length) parts.push(`${m.contributes.themes.length} themes`);
  if (m.contributes.tabTypes.length) parts.push(`${m.contributes.tabTypes.length} tab types`);
  if (m.contributes.decorators.length)
    parts.push(`${m.contributes.decorators.length} decorators`);
  return parts.length ? parts.join(" · ") : "no contributions";
}


// ─────────────────────────────────────────────────────────────────────────────
// Per-extension settings form
// ─────────────────────────────────────────────────────────────────────────────

export function ExtensionSettingsForm({
  extId,
  settings,
  update,
}: {
  extId: string;
} & SectionProps) {
  const host = getRendererHost();
  const reg = getSettingsSchemaRegistry();
  const [entry, setEntry] = useState<SettingsSchemaEntry | undefined>(() =>
    reg.get(extId),
  );
  const [snap, setSnap] = useState<ManifestSnapshot | undefined>(() =>
    host.list().find((s) => s.manifest.id === extId),
  );

  useEffect(() => {
    setEntry(reg.get(extId));
    setSnap(host.list().find((s) => s.manifest.id === extId));
    const offReg = reg.subscribe(() => setEntry(reg.get(extId))).dispose;
    const offHost = host.subscribe(() =>
      setSnap(host.list().find((s) => s.manifest.id === extId)),
    );
    return () => {
      offReg();
      offHost();
    };
  }, [reg, host, extId]);

  const declaredSecrets = snap?.manifest.contributes.secrets ?? [];
  const schema = (entry?.schema ?? {}) as ObjectSchema;
  const props = Object.entries(schema.properties ?? {});
  const displayName =
    entry?.displayName ?? snap?.manifest.displayName ?? snap?.manifest.id ?? extId;

  if (!entry && declaredSecrets.length === 0) {
    return (
      <Field label="No settings available">
        <span className="ext-explainer">
          The extension <code>{extId}</code> does not declare a settings schema, or it
          has been disabled.
        </span>
      </Field>
    );
  }

  return (
    <>
      <Field label={displayName} hint={`extensions.${extId}`}>
        <span className="ext-explainer">
          Settings declared by the extension manifest. Saved under{" "}
          <code>extensions[&quot;{extId}&quot;]</code>.
          {declaredSecrets.length > 0 && (
            <>
              {" "}
              Secrets are stored separately under{" "}
              <code>~/.mterminal/data/{extId}/secrets.json</code> (encrypted via the OS
              keychain when available).
            </>
          )}
        </span>
      </Field>

      {declaredSecrets.length > 0 && (
        <SecretsSection extId={extId} secrets={declaredSecrets} />
      )}

      {entry && props.length === 0 && (
        <Field label="(empty schema)">
          <span className="ext-explainer">
            This extension declares <code>contributes.settings</code> but its{" "}
            <code>properties</code> map is empty.
          </span>
        </Field>
      )}
      {entry &&
        props.map(([key, propSchema]) => (
          <PropField
            key={key}
            propKey={key}
            schema={propSchema}
            value={readValue(settings, extId, key, propSchema.default)}
            onChange={(v) => writeValue(settings, update, extId, key, v)}
          />
        ))}
    </>
  );
}

interface SecretContributionLite {
  key: string;
  label: string;
  description?: string;
  link?: string;
  placeholder?: string;
}

function SecretsSection({
  extId,
  secrets,
}: {
  extId: string;
  secrets: SecretContributionLite[];
}) {
  return (
    <>
      <Field label="API keys & secrets">
        <span className="ext-explainer">
          Stored independently of regular settings. Each value is written via{" "}
          <code>ctx.secrets</code> and never appears in the main settings JSON.
        </span>
      </Field>
      {secrets.map((s) => (
        <SecretField key={s.key} extId={extId} spec={s} />
      ))}
    </>
  );
}

function SecretField({
  extId,
  spec,
}: {
  extId: string;
  spec: SecretContributionLite;
}) {
  const [value, setValue] = useState<string>("");
  const [stored, setStored] = useState<boolean>(false);
  const [reveal, setReveal] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [dirty, setDirty] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const has = await window.mt.ext.secrets.has(extId, spec.key);
        if (!alive) return;
        setStored(has);
        if (has) {
          const v = (await window.mt.ext.secrets.get(extId, spec.key)) ?? "";
          if (alive) setValue(v);
        }
      } catch (err) {
        console.error(`[ext:${extId}] secrets.get(${spec.key}) failed:`, err);
      }
    })();
    const off = window.mt.ext.secrets.onChange(extId, (key, present) => {
      if (key !== spec.key) return;
      setStored(present);
      if (!present) setValue("");
      setDirty(false);
    });
    return () => {
      alive = false;
      off();
    };
  }, [extId, spec.key]);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      if (value.trim() === "") {
        await window.mt.ext.secrets.delete(extId, spec.key);
      } else {
        await window.mt.ext.secrets.set(extId, spec.key, value);
      }
      setDirty(false);
    } catch (err) {
      console.error(`[ext:${extId}] secrets.set(${spec.key}) failed:`, err);
    } finally {
      setBusy(false);
    }
  };

  const clear = async (): Promise<void> => {
    setBusy(true);
    try {
      await window.mt.ext.secrets.delete(extId, spec.key);
      setValue("");
      setDirty(false);
    } catch (err) {
      console.error(`[ext:${extId}] secrets.delete(${spec.key}) failed:`, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={spec.label} hint={spec.description}>
      <div className="ext-password-row">
        <input
          type={reveal ? "text" : "password"}
          value={value}
          placeholder={spec.placeholder ?? (stored ? "(stored)" : "")}
          onChange={(e) => {
            setValue(e.target.value);
            setDirty(true);
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="ext-password-toggle"
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? "Hide value" : "Reveal value"}
        >
          {reveal ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          className="ext-password-toggle"
          onClick={() => void save()}
          disabled={busy || !dirty}
        >
          {stored && !dirty ? "Saved" : "Save"}
        </button>
        {stored && (
          <button
            type="button"
            className="ext-password-toggle"
            onClick={() => void clear()}
            disabled={busy}
          >
            Clear
          </button>
        )}
      </div>
      {spec.link && (
        <a
          className="ext-explainer"
          href={spec.link}
          target="_blank"
          rel="noreferrer"
          style={{ marginTop: 4, display: "inline-block" }}
        >
          Where do I get this?
        </a>
      )}
    </Field>
  );
}

function PropField({
  propKey,
  schema,
  value,
  onChange,
}: {
  propKey: string;
  schema: PropSchema;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = humanize(propKey);
  const hint = schema.description;

  if (schema.enum && schema.enum.length > 0) {
    return (
      <Field label={label} hint={hint}>
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(coerce(e.target.value, schema.type))}
        >
          {schema.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (schema.type === "boolean") {
    return (
      <Field label={label} hint={hint}>
        <Toggle checked={!!value} onChange={(b) => onChange(b)} />
      </Field>
    );
  }

  if (schema.type === "number") {
    return (
      <Field label={label} hint={hint}>
        <input
          type="number"
          value={Number(value ?? 0)}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </Field>
    );
  }

  if (schema.format === "password") {
    return (
      <PasswordField
        label={label}
        hint={hint}
        value={String(value ?? "")}
        onChange={onChange}
      />
    );
  }

  const isMulti =
    typeof value === "string" && (value.length > 80 || value.includes("\n"));
  return (
    <Field label={label} hint={hint}>
      {isMulti ? (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      ) : (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

function PasswordField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: unknown) => void;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="ext-password-row">
        <input
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="ext-password-toggle"
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? "Hide value" : "Reveal value"}
        >
          {reveal ? "Hide" : "Show"}
        </button>
      </div>
    </Field>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readValue(
  settings: SectionProps["settings"],
  extId: string,
  key: string,
  fallback: unknown,
): unknown {
  const ext = settings.extensions?.[extId];
  if (ext && key in ext) return ext[key];
  return fallback;
}

function writeValue(
  settings: SectionProps["settings"],
  update: SectionProps["update"],
  extId: string,
  key: string,
  value: unknown,
): void {
  const cur = settings.extensions ?? {};
  const next: Record<string, Record<string, unknown>> = { ...cur };
  next[extId] = { ...(next[extId] ?? {}), [key]: value };
  update("extensions", next);
}

function humanize(s: string): string {
  return s
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function coerce(raw: string, type?: PropSchema["type"]): string | number | boolean {
  if (type === "number") return Number(raw);
  if (type === "boolean") return raw === "true";
  return raw;
}
