import {
  ButtonRow,
  SegmentedRow,
  SliderRow,
  ToggleRow,
  type OptionItem,
} from "../_rows";
import type { SectionProps } from "../_shared";
import { playAgentSound, type AgentSoundType } from "../../../lib/agentSound";

const SOUND_OPTIONS: OptionItem<AgentSoundType>[] = [
  { value: "bell", label: "bell" },
  { value: "chime", label: "chime" },
  { value: "ping", label: "ping" },
];

export function AgentSound({ settings, update }: SectionProps) {
  const handlePreview = (): void => {
    playAgentSound(settings.agentSoundType, settings.agentSoundVolume);
  };

  return (
    <>
      <ToggleRow
        label="play sound on agent done"
        desc="fires for every tab when an agent finishes (not just background)"
        checked={settings.agentSoundEnabled}
        onChange={(b) => update("agentSoundEnabled", b)}
      />

      {settings.agentSoundEnabled && (
        <>
          <SegmentedRow
            label="sound"
            value={settings.agentSoundType}
            onChange={(v) => update("agentSoundType", v)}
            options={SOUND_OPTIONS}
          />
          <SliderRow
            label="volume"
            value={settings.agentSoundVolume}
            onChange={(v) => update("agentSoundVolume", v)}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <ButtonRow
            label="preview"
            actionLabel="play sound"
            onClick={handlePreview}
          />
        </>
      )}
    </>
  );
}
