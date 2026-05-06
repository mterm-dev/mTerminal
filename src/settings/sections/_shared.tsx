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
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">
        <span>{label}</span>
        {hint && <span className="settings-field-hint">{hint}</span>}
      </div>
      <div className="settings-field-control">{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}
