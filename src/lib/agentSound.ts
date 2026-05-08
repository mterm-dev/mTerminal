export const AGENT_SOUND_TYPES = ["bell", "chime", "ping"] as const;
export type AgentSoundType = (typeof AGENT_SOUND_TYPES)[number];

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AudioContext();
  }
  return _ctx;
}

function playBell(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(740, now + 0.8);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume * 0.7, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 1.2);
}

function playChime(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;

  const playNote = (freq: number, startOffset: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(0, now + startOffset);
    gain.gain.linearRampToValueAtTime(volume * 0.6, now + startOffset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + dur);
  };

  playNote(523.25, 0, 0.55);
  playNote(659.25, 0.18, 0.65);
}

function playPing(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(1760, now);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume * 0.5, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}

export function playAgentSound(type: AgentSoundType, volume: number): void {
  try {
    const ctx = getCtx();
    const play = () => {
      if (type === "bell") playBell(ctx, volume);
      else if (type === "chime") playChime(ctx, volume);
      else playPing(ctx, volume);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch {}
}
