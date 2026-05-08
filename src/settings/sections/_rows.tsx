import { useEffect, useState, type ReactNode } from "react";
import { Field, Toggle } from "./_shared";

interface BaseRowProps {
  label: string;
  desc?: ReactNode;
  hint?: string;
  disabled?: boolean;
}

export function TextRow({
  label,
  desc,
  hint,
  value,
  onChange,
  placeholder,
  password,
  disabled,
  grow,
}: BaseRowProps & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  password?: boolean;
  grow?: boolean;
}) {
  return (
    <Field label={label} desc={desc} hint={hint} stack={grow}>
      <input
        type={password ? "password" : "text"}
        className={`st-input ${grow ? "text-grow" : "text"}`}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
    </Field>
  );
}

export function NumberRow({
  label,
  desc,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  disabled,
}: BaseRowProps & {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const parsed = Number(text);
  const valid =
    Number.isFinite(parsed) &&
    (min === undefined || parsed >= min) &&
    (max === undefined || parsed <= max);

  const commit = (): void => {
    if (!valid) {
      setText(String(value));
      return;
    }
    if (parsed !== value) onChange(parsed);
  };

  return (
    <Field label={label} desc={desc} hint={hint}>
      <input
        type="number"
        className={"st-input numeric" + (valid ? "" : " invalid")}
        value={text}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {suffix && <span className="st-suffix">{suffix}</span>}
    </Field>
  );
}

export function SliderRow({
  label,
  desc,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  format,
  disabled,
}: BaseRowProps & {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const display = format ? format(value) : String(value);
  const range = max - min;
  const pct =
    range > 0 ? `${Math.max(0, Math.min(100, ((value - min) / range) * 100))}%` : "0%";
  return (
    <Field label={label} desc={desc} hint={hint}>
      <input
        type="range"
        className="st-range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--range-pct" as never]: pct }}
      />
      <span className="st-suffix" style={{ minWidth: 44, textAlign: "right" }}>
        {display}
      </span>
    </Field>
  );
}

export function ToggleRow({
  label,
  desc,
  hint,
  checked,
  onChange,
  offLabel,
  onLabel,
  disabled,
}: BaseRowProps & {
  checked: boolean;
  onChange: (b: boolean) => void;
  offLabel?: string;
  onLabel?: string;
}) {
  return (
    <Field label={label} desc={desc} hint={hint}>
      <Toggle
        checked={checked}
        onChange={disabled ? () => {} : onChange}
        offLabel={offLabel}
        onLabel={onLabel}
      />
    </Field>
  );
}

export interface OptionItem<T extends string> {
  label: string;
  value: T;
  icon?: string;
}

export function SelectRow<T extends string>({
  label,
  desc,
  hint,
  value,
  onChange,
  options,
  disabled,
}: BaseRowProps & {
  value: T;
  onChange: (v: T) => void;
  options: OptionItem<T>[];
}) {
  return (
    <Field label={label} desc={desc} hint={hint}>
      <select
        className="st-input text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function SegmentedRow<T extends string>({
  label,
  desc,
  hint,
  value,
  onChange,
  options,
  disabled,
}: BaseRowProps & {
  value: T;
  onChange: (v: T) => void;
  options: OptionItem<T>[];
}) {
  return (
    <Field label={label} desc={desc} hint={hint}>
      <div className="st-segmented" role="radiogroup">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={"st-seg" + (o.value === value ? " active" : "")}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.icon && <span className="st-seg-icon">{o.icon}</span>}
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function FilePickerRow({
  label,
  desc,
  hint,
  value,
  onChange,
  placeholder,
  filters,
  disabled,
}: BaseRowProps & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  filters?: { name: string; extensions: string[] }[];
}) {
  const pick = async () => {
    const dialog = (window as unknown as {
      mt?: {
        dialog?: {
          showOpenDialog?: (
            o: unknown,
          ) => Promise<{ canceled: boolean; filePaths: string[] }>;
        };
      };
    }).mt?.dialog?.showOpenDialog;
    if (!dialog) return;
    try {
      const r = await dialog({ properties: ["openFile"], filters });
      if (!r.canceled && r.filePaths[0]) onChange(r.filePaths[0]);
    } catch (e) {
      console.warn("[settings] file picker failed:", e);
    }
  };
  return (
    <Field label={label} desc={desc} hint={hint} stack>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="text"
          className="st-input text-grow"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <button type="button" className="st-btn" disabled={disabled} onClick={pick}>
          Pick…
        </button>
      </div>
    </Field>
  );
}

export function ButtonRow({
  label,
  desc,
  hint,
  actionLabel,
  onClick,
  variant,
  disabled,
}: BaseRowProps & {
  actionLabel: string;
  onClick: () => void;
  variant?: "primary" | "danger";
}) {
  const cls = "st-btn" + (variant ? ` ${variant}` : "");
  return (
    <Field label={label} desc={desc} hint={hint}>
      <button type="button" className={cls} disabled={disabled} onClick={onClick}>
        {actionLabel}
      </button>
    </Field>
  );
}

export function DangerRow({
  label,
  desc,
  hint,
  actionLabel,
  onClick,
  confirm,
  disabled,
}: BaseRowProps & {
  actionLabel: string;
  onClick: () => void;
  confirm?: string;
}) {
  const handle = () => {
    if (confirm && !window.confirm(confirm)) return;
    onClick();
  };
  return (
    <Field label={label} desc={desc} hint={hint} danger>
      <button type="button" className="st-btn danger" disabled={disabled} onClick={handle}>
        {actionLabel}
      </button>
    </Field>
  );
}

export type StatusTone = "ok" | "off" | "warn" | "dev";

export function StatusRow({
  label,
  desc,
  status,
  children,
}: {
  label: string;
  desc?: ReactNode;
  status: { label: string; tone: StatusTone };
  children?: ReactNode;
}) {
  return (
    <Field label={label} desc={desc}>
      <span className="st-pill" data-tone={status.tone}>
        <span className="st-pill-dot" />
        {status.label}
      </span>
      {children}
    </Field>
  );
}

export function ApiKeyRow({
  label,
  desc,
  hint,
  hasKey,
  vaultUnlocked,
  onSet,
  onClear,
  placeholder,
}: BaseRowProps & {
  hasKey: boolean;
  vaultUnlocked: boolean;
  onSet: (key: string) => Promise<void> | void;
  onClear: () => Promise<void> | void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  if (!vaultUnlocked) {
    return (
      <Field label={label} desc={desc ?? hint ?? "Unlock vault to manage"}>
        <span className="st-pill" data-tone="off">
          Locked
        </span>
      </Field>
    );
  }

  if (hasKey && !editing) {
    return (
      <Field label={label} desc={desc} hint={hint}>
        <span className="st-pill" data-tone="ok">
          <span className="st-pill-dot" />
          Saved
        </span>
        <button
          type="button"
          className="st-btn"
          disabled={busy}
          onClick={() => {
            setEditing(true);
            setInput("");
          }}
        >
          Replace
        </button>
        <button
          type="button"
          className="st-btn danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onClear();
            } finally {
              setBusy(false);
            }
          }}
        >
          Remove
        </button>
      </Field>
    );
  }

  return (
    <Field label={label} desc={desc} hint={hint} stack>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="password"
          className="st-input text-grow"
          value={input}
          placeholder={placeholder ?? "Paste API key"}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="st-btn primary"
          disabled={busy || !input.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onSet(input.trim());
              setEditing(false);
              setInput("");
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </button>
        {hasKey && (
          <button
            type="button"
            className="st-btn"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setInput("");
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </Field>
  );
}
