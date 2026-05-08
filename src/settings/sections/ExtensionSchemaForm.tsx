import type { SectionProps } from "./_shared";
import { Field } from "./_shared";
import { NumberRow, SelectRow, TextRow, ToggleRow } from "./_rows";

export interface PropSchema {
  type?: "string" | "number" | "boolean";
  enum?: Array<string | number>;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  format?: "password" | string;
}

export interface ObjectSchema {
  type?: "object";
  properties?: Record<string, PropSchema>;
}

export function SchemaPropField({
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
  const desc = schema.description;

  if (schema.enum && schema.enum.length > 0) {
    return (
      <SelectRow
        label={label}
        desc={desc}
        value={String(value ?? schema.default ?? "")}
        options={schema.enum.map((opt) => ({ label: String(opt), value: String(opt) }))}
        onChange={(v) => onChange(coerce(v, schema.type))}
      />
    );
  }

  if (schema.type === "boolean") {
    return (
      <ToggleRow label={label} desc={desc} checked={!!value} onChange={(b) => onChange(b)} />
    );
  }

  if (schema.type === "number") {
    return (
      <NumberRow
        label={label}
        desc={desc}
        value={Number(value ?? schema.default ?? 0)}
        min={schema.minimum}
        max={schema.maximum}
        onChange={onChange}
      />
    );
  }

  if (schema.format === "password") {
    return (
      <TextRow
        label={label}
        desc={desc}
        value={String(value ?? "")}
        onChange={onChange}
        password
        grow
      />
    );
  }

  const isMulti = typeof value === "string" && (value.length > 80 || value.includes("\n"));
  if (isMulti) {
    return (
      <Field label={label} desc={desc} stack>
        <textarea
          className="st-textarea"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </Field>
    );
  }

  return (
    <TextRow
      label={label}
      desc={desc}
      value={String(value ?? "")}
      onChange={onChange}
      grow
    />
  );
}

export function readExtValue(
  settings: SectionProps["settings"],
  extId: string,
  key: string,
  fallback: unknown,
): unknown {
  const ext = settings.extensions?.[extId];
  if (ext && key in ext) return ext[key];
  return fallback;
}

export function writeExtValue(
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
