import { useEffect, useRef, useState } from "react";
import type { VoiceState } from "../hooks/useVoiceRecognition";

interface Props {
  state: VoiceState;
  stream: MediaStream | null;
  onStop: () => void;
}

const BAR_COUNT = 7;

export function VoiceIndicator({ state, stream, onStop }: Props) {
  const visible = state === "recording" || state === "transcribing";
  const [mounted, setMounted] = useState(visible);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [visible, mounted]);

  if (!mounted) return null;

  return (
    <div
      className={`voice-indicator voice-${state}${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="voice-indicator__pulse" aria-hidden="true">
        <span className="voice-indicator__ring" />
        <span className="voice-indicator__ring voice-indicator__ring--lag" />
        <MicGlyph />
      </div>

      <div className="voice-indicator__body">
        <div className="voice-indicator__label">
          {state === "transcribing" ? "transcribing…" : "listening"}
        </div>
        <Bars stream={state === "recording" ? stream : null} />
      </div>

      <button
        type="button"
        className="voice-indicator__stop"
        onClick={onStop}
        title={state === "recording" ? "stop recording" : "cancel"}
        aria-label={state === "recording" ? "stop recording" : "cancel"}
      >
        <StopGlyph />
      </button>
    </div>
  );
}

function Bars({ stream }: { stream: MediaStream | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const bars = Array.from(
      root.querySelectorAll<HTMLSpanElement>(".voice-indicator__bar"),
    );

    if (!stream) {
      bars.forEach((b) => (b.style.transform = ""));
      return;
    }

    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let raf = 0;
    let disposed = false;
    let buf: Uint8Array | null = null;

    try {
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      buf = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      bars.forEach((b) => (b.style.transform = "scaleY(0.3)"));
      return;
    }

    const tick = () => {
      if (disposed || !analyser || !buf) return;
      analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
      const step = Math.floor(buf.length / bars.length) || 1;
      for (let i = 0; i < bars.length; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += buf[i * step + j] || 0;
        const avg = sum / step / 255;
        const scaled = Math.min(1, Math.pow(avg, 0.6) * 1.6);
        const v = 0.18 + scaled * 0.82;
        bars[i].style.transform = `scaleY(${v.toFixed(3)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      try {
        source?.disconnect();
      } catch {}
      try {
        analyser?.disconnect();
      } catch {}
      ctx?.close().catch(() => {});
    };
  }, [stream]);

  return (
    <div
      ref={containerRef}
      className={`voice-indicator__bars${stream ? "" : " is-static"}`}
      aria-hidden="true"
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <span
          key={i}
          className="voice-indicator__bar"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

function MicGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="6"
        y="2"
        width="4"
        height="8"
        rx="2"
        fill="currentColor"
      />
      <path
        d="M4 8a4 4 0 0 0 8 0M8 12v2M5.5 14h5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}
