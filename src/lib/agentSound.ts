export const AGENT_SOUND_TYPES = [
  "chime",
  "pop",
  "drop",
  "success",
] as const;
export type AgentSoundType = (typeof AGENT_SOUND_TYPES)[number];

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AudioContext();
  }
  return _ctx;
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

function playPop(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume * 0.6, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function playDrop(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.35);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume * 0.55, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}

function playSuccess(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;

  const playNote = (freq: number, startOffset: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(0, now + startOffset);
    gain.gain.linearRampToValueAtTime(volume * 0.5, now + startOffset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + dur);
  };

  playNote(523.25, 0, 0.18);
  playNote(659.25, 0.1, 0.18);
  playNote(783.99, 0.2, 0.35);
}

export function playAgentSound(type: AgentSoundType, volume: number): void {
  try {
    const ctx = getCtx();
    const play = () => {
      if (type === "pop") playPop(ctx, volume);
      else if (type === "drop") playDrop(ctx, volume);
      else if (type === "success") playSuccess(ctx, volume);
      else playChime(ctx, volume);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch {}
}
