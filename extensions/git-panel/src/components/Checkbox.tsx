import type { MouseEvent } from "react";
import type { CheckState } from "../lib/git-tree";

interface Props {
  state: CheckState;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
  onClick?: (e: MouseEvent) => void;
}

export function Checkbox({ state, onChange, disabled, ariaLabel, onClick }: Props) {
  return (
    <span
      className={`git-checkbox ${state}`}
      data-state={state}
      role="checkbox"
      aria-checked={state === "indeterminate" ? "mixed" : state === "checked"}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={(e) => {
        if (disabled) return;
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.stopPropagation();
        onChange();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange();
        }
      }}
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        {state === "checked" && (
          <path
            d="M2.5 6.2 L4.8 8.5 L9.5 3.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {state === "indeterminate" && (
          <path
            d="M3 6 H9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}
