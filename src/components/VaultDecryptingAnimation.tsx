interface Props {
  label?: string;
  variant?: "decrypting" | "success";
}

export function VaultDecryptingAnimation({ label, variant = "decrypting" }: Props) {
  if (variant === "success") {
    return (
      <div className="vault-phase-overlay" role="status" aria-live="polite">
        <div className="vault-success-icon" aria-hidden="true">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
            <path
              d="M7 12.5l3.2 3.2L17 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="vault-phase-label">unlocked</div>
      </div>
    );
  }

  return (
    <div className="vault-phase-overlay" role="status" aria-live="polite">
      <div className="vault-decrypt-spinner" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <circle
            cx="28"
            cy="28"
            r="22"
            stroke="currentColor"
            strokeOpacity="0.18"
            strokeWidth="3"
          />
          <circle
            cx="28"
            cy="28"
            r="22"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="40 110"
          />
          <circle
            cx="28"
            cy="28"
            r="14"
            stroke="currentColor"
            strokeOpacity="0.32"
            strokeWidth="2"
            strokeDasharray="6 8"
          />
        </svg>
      </div>
      <div className="vault-phase-label vault-decrypt-label">{label ?? "decrypting vault…"}</div>
    </div>
  );
}
