import { Field, Toggle, type SectionProps } from "../_shared";
import { playAgentSound, type AgentSoundType } from "../../../lib/agentSound";

const SOUND_OPTIONS: Array<{ value: AgentSoundType; label: string; hint: string }> = [
  { value: "bell", label: "Bell", hint: "soft bell, 1.2s decay" },
  { value: "chime", label: "Chime", hint: "ascending two-note" },
  { value: "ping", label: "Ping", hint: "short high ping" },
];

export function AgentSound({ settings, update }: SectionProps) {
  const handlePreview = () => {
    playAgentSound(settings.agentSoundType, settings.agentSoundVolume);
  };

  return (
    <>
      <div className="aip-section-h">
        <h3>Completion sound</h3>
        <span className="aip-sub">play a sound when an agent finishes</span>
      </div>

      <Field label="Agent completion sound">
        <Toggle
          checked={settings.agentSoundEnabled}
          onChange={(b) => update("agentSoundEnabled", b)}
        />
      </Field>

      {settings.agentSoundEnabled && (
        <>
          <Field label="Sound type">
            <div className="seg-control">
              {SOUND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.hint}
                  className={settings.agentSoundType === opt.value ? "active" : ""}
                  onClick={() => update("agentSoundType", opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Volume"
            hint={`${Math.round(settings.agentSoundVolume * 100)}%`}
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.agentSoundVolume}
              onChange={(e) =>
                update("agentSoundVolume", parseFloat(e.target.value))
              }
            />
          </Field>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="ghost-btn" onClick={handlePreview}>
              preview sound
            </button>
          </div>
        </>
      )}
    </>
  );
}
