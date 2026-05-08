import { useEffect, useState } from "react";
import { Field, type SectionProps } from "./_shared";
import {
  getSettingsSchemaRegistry,
  type SettingsSchemaEntry,
} from "../../extensions/registries/settings-schema";
import {
  getSettingsRendererRegistry,
  type SettingsRendererEntry,
} from "../../extensions/registries/settings-renderer";
import { getRendererHost, type ManifestSnapshot } from "../../extensions";
import {
  AiBindingCard,
  defaultConfigFor,
  settingsKeyFor,
  type AiBindingConfig,
  type AiBindingSpec,
} from "../../extensions/components/AiBindingCard";
import { PluginCustomSettingsSlot } from "../../extensions/components/PluginCustomSettingsSlot";
import {
  type ObjectSchema,
  SchemaPropField,
  readExtValue,
  writeExtValue,
} from "./ExtensionSchemaForm";

export function ExtensionSettingsForm({
  extId,
  settings,
  update,
}: {
  extId: string;
} & SectionProps) {
  const host = getRendererHost();
  const reg = getSettingsSchemaRegistry();
  const srReg = getSettingsRendererRegistry();
  const [entry, setEntry] = useState<SettingsSchemaEntry | undefined>(() => reg.get(extId));
  const [snap, setSnap] = useState<ManifestSnapshot | undefined>(() =>
    host.list().find((s) => s.manifest.id === extId),
  );
  const [customRenderer, setCustomRenderer] = useState<SettingsRendererEntry | undefined>(() =>
    srReg.get(extId),
  );

  useEffect(() => {
    setEntry(reg.get(extId));
    setSnap(host.list().find((s) => s.manifest.id === extId));
    setCustomRenderer(srReg.get(extId));
    const offReg = reg.subscribe(() => setEntry(reg.get(extId))).dispose;
    const offHost = host.subscribe(() =>
      setSnap(host.list().find((s) => s.manifest.id === extId)),
    );
    const offSr = srReg.subscribe(() => setCustomRenderer(srReg.get(extId))).dispose;
    return () => {
      offReg();
      offHost();
      offSr();
    };
  }, [reg, host, srReg, extId]);

  const declaredSecrets = snap?.manifest.contributes.secrets ?? [];
  const declaredBindings = (snap?.manifest.contributes.aiBindings ?? []) as AiBindingSpec[];
  const schema = (entry?.schema ?? {}) as ObjectSchema;
  const props = Object.entries(schema.properties ?? {});
  const displayName = entry?.displayName ?? snap?.manifest.displayName ?? snap?.manifest.id ?? extId;

  const nothingToShow =
    !entry &&
    !customRenderer &&
    declaredSecrets.length === 0 &&
    declaredBindings.length === 0;
  if (nothingToShow) {
    return (
      <Field label="No settings available" desc={`${extId} declares no schema or is disabled.`}>
        <span />
      </Field>
    );
  }

  void displayName;

  return (
    <>
      {declaredBindings.length > 0 && (
        <AiBindingsSection
          extId={extId}
          bindings={declaredBindings}
          settings={settings}
          update={update}
        />
      )}

      {declaredSecrets.length > 0 && (
        <SecretsSection extId={extId} secrets={declaredSecrets} />
      )}

      {customRenderer ? (
        <PluginCustomSettingsSlot extId={extId} />
      ) : (
        entry &&
        props.map(([key, propSchema]) => (
          <SchemaPropField
            key={key}
            propKey={key}
            schema={propSchema}
            value={readExtValue(settings, extId, key, propSchema.default)}
            onChange={(v) => writeExtValue(settings, update, extId, key, v)}
          />
        ))
      )}
    </>
  );
}

function AiBindingsSection({
  extId,
  bindings,
  settings,
  update,
}: {
  extId: string;
  bindings: AiBindingSpec[];
} & SectionProps) {
  return (
    <>
      {bindings.map((spec) => {
        const key = settingsKeyFor(spec.id);
        const value = readExtValue(settings, extId, key, undefined) as
          | AiBindingConfig
          | undefined;
        return (
          <AiBindingCard
            key={spec.id}
            extId={extId}
            spec={spec}
            value={value ?? defaultConfigFor(spec)}
            onChange={(next) => writeExtValue(settings, update, extId, key, next)}
          />
        );
      })}
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
          className="settings-field-input"
          value={value}
          placeholder={spec.placeholder ?? (stored ? "(Stored)" : "")}
          onChange={(e) => {
            setValue(e.target.value);
            setDirty(true);
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="ghost-btn small"
          onClick={() => setReveal((r) => !r)}
        >
          {reveal ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          className="ghost-btn small"
          onClick={() => void save()}
          disabled={busy || !dirty}
        >
          {stored && !dirty ? "Saved" : "Save"}
        </button>
        {stored && (
          <button
            type="button"
            className="ghost-btn small danger-btn"
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
          where do I get this?
        </a>
      )}
    </Field>
  );
}
