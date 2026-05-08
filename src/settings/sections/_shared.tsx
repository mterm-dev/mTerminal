import type { ReactNode } from "react";
import type { Settings } from "../useSettings";

export interface SectionProps {
  settings: Settings;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}

export interface VaultSectionProps extends SectionProps {
  vaultUnlocked: boolean;
  vaultExists: boolean;
  onRequestVault: () => void;
}

export function Field({
  label,
  desc,
  hint,
  stack,
  danger,
  children,
}: {
  label: string;
  desc?: ReactNode;
  hint?: string;
  stack?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  const cls = ["st-card", stack ? "stack" : "", danger ? "danger" : ""]
    .filter(Boolean)
    .join(" ");
  const description = desc ?? hint;
  return (
    <div className={cls}>
      <div className="st-info">
        <span className="st-label">{label}</span>
        {description && <span className="st-desc">{description}</span>}
      </div>
      {stack ? children : <div className="st-control">{children}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="st-section-label">{children}</div>;
}

export function Group({ children }: { children: ReactNode }) {
  return <div className="st-group">{children}</div>;
}

export function Toggle({
  checked,
  onChange,
  offLabel = "off",
  onLabel = "on",
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  offLabel?: string;
  onLabel?: string;
}) {
  return (
    <div className="st-segmented" role="switch" aria-checked={checked}>
      <button
        type="button"
        className={"st-seg" + (!checked ? " active" : "")}
        onClick={() => onChange(false)}
      >
        <span className={"st-seg-icon st-seg-dot off" + (!checked ? " lit" : "")}>●</span>
        {offLabel}
      </button>
      <button
        type="button"
        className={"st-seg" + (checked ? " active" : "")}
        onClick={() => onChange(true)}
      >
        <span className={"st-seg-icon st-seg-dot on" + (checked ? " lit" : "")}>●</span>
        {onLabel}
      </button>
    </div>
  );
}
