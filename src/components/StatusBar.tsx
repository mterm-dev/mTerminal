import { Clock } from "./Clock";
import { PluginStatusItems } from "../extensions/components/PluginStatusItems";

export type VoiceStatusState = "idle" | "recording" | "transcribing" | "error";

export interface VoiceStatusProps {
  visible: boolean;
  state: VoiceStatusState;
  onToggle: () => void;
  tooltip?: string;
}

export interface VaultLockProps {
  visible: boolean;
  exists: boolean;
  unlocked: boolean;
  onClick: () => void;
}

interface Props {
  activeLabel: string;
  cwd?: string;
  cmd?: string;
  tabCount: number;
  groupCount: number;
  aiUsage?: { inTokens: number; outTokens: number; costUsd: number };
  voice?: VoiceStatusProps;
  vaultLock?: VaultLockProps;
}

export function StatusBar({
  activeLabel,
  cwd,
  cmd,
  tabCount,
  groupCount,
  aiUsage,
  voice,
  vaultLock,
}: Props) {
  return (
    <div className="term-status">
      <div className="seg" title={activeLabel}>
        {activeLabel.toUpperCase()}
      </div>
      {cwd && (
        <div className="seg shrink" title={cwd}>
          {shortenCwd(cwd)}
        </div>
      )}
      {cmd && <div className="seg" title={cmd}>{cmd}</div>}
      <div className="seg">UTF-8</div>
      {/* Extension-contributed status items aligned to the left. */}
      <PluginStatusItems align="left" />
      <div className="grow" />
      {/* Extension-contributed status items aligned to the right. */}
      <PluginStatusItems align="right" />
      <div className="seg">
        {tabCount} tab{tabCount === 1 ? "" : "s"} · {groupCount} group
        {groupCount === 1 ? "" : "s"}
      </div>
      {aiUsage && (aiUsage.inTokens > 0 || aiUsage.outTokens > 0) && (
        <div
          className="ai-usage"
          title={`in: ${aiUsage.inTokens} · out: ${aiUsage.outTokens} · $${aiUsage.costUsd.toFixed(4)}`}
        >
          ai <strong>${aiUsage.costUsd.toFixed(3)}</strong>
        </div>
      )}
      {vaultLock?.visible && (
        <button
          type="button"
          className="vault-lock-btn"
          data-locked={vaultLock.unlocked ? "false" : "true"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            vaultLock.onClick();
            (e.currentTarget as HTMLButtonElement).blur();
          }}
          title={vaultLockTooltip(vaultLock)}
          aria-label={vaultLockTooltip(vaultLock)}
        >
          {vaultLock.unlocked ? <UnlockIcon /> : <LockIcon />}
        </button>
      )}
      {voice?.visible && (
        <button
          type="button"
          className={`mic-btn mic-${voice.state}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            voice.onToggle();
            (e.currentTarget as HTMLButtonElement).blur();
          }}
          title={voice.tooltip ?? micDefaultTooltip(voice.state)}
          aria-label={voice.tooltip ?? micDefaultTooltip(voice.state)}
        >
          {voice.state === "recording" ? (
            <StopIcon />
          ) : voice.state === "transcribing" ? (
            <SpinnerIcon />
          ) : (
            <MicIcon />
          )}
        </button>
      )}
      <div className="clock-seg">
        <Clock />
      </div>
    </div>
  );
}

function micDefaultTooltip(state: VoiceStatusState): string {
  switch (state) {
    case "recording":
      return "stop recording";
    case "transcribing":
      return "transcribing…";
    case "error":
      return "voice error — click to retry";
    default:
      return "start voice dictation";
  }
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="6"
        y="2"
        width="4"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <path
        d="M4 8a4 4 0 0 0 8 0M8 12v2M5.5 14h5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="mic-spinner"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function vaultLockTooltip(v: VaultLockProps): string {
  if (!v.exists) return "set master password to enable vault";
  return v.unlocked ? "vault unlocked — click to lock" : "vault locked — click to unlock";
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="3.5"
        y="7"
        width="9"
        height="7"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <path
        d="M5 7V5a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="3.5"
        y="7"
        width="9"
        height="7"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <path
        d="M5 7V5a3 3 0 0 1 5.6-1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

function shortenCwd(p: string): string {
  const home = (window as unknown as { __MT_HOME?: string }).__MT_HOME;
  if (home && p === home) return "~";
  if (home && p.startsWith(home + "/")) return "~" + p.slice(home.length);
  if (p.length > 40) {
    const parts = p.split("/").filter(Boolean);
    if (parts.length > 3) return "/" + parts.slice(-3).join("/");
  }
  return p;
}
