import { useCallback, useEffect, useRef, useState } from "react";
import type { MtApi } from "../../electron/preload";

export type VoiceState = "idle" | "recording" | "transcribing" | "error";

export interface VoiceConfig {
  enabled: boolean;
  engine: "whisper-cpp" | "openai";
  language: string;
  whisperBinPath: string;
  whisperModelPath: string;
  openaiModel: string;
  openaiBaseUrl: string;
}

export interface UseVoiceRecognitionArgs {
  config: VoiceConfig;
  onText: (text: string) => void;
  onError?: (msg: string) => void;
}

export interface VoiceController {
  state: VoiceState;
  error: string | null;
  toggle: () => void;
  start: () => void;
  stop: () => void;
}

const RECORDER_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return RECORDER_MIMES.find((m) => MediaRecorder.isTypeSupported(m));
}

function encodeWav16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

async function blobToWav16k(blob: Blob): Promise<Uint8Array> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close().catch(() => {});
  }

  const targetRate = 16000;
  const targetLength = Math.ceil(decoded.duration * targetRate);
  if (targetLength <= 0) return encodeWav16(new Float32Array(0), targetRate);

  const offline = new OfflineAudioContext(1, targetLength, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return encodeWav16(rendered.getChannelData(0), targetRate);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useVoiceRecognition(
  args: UseVoiceRecognitionArgs,
): VoiceController {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const argsRef = useRef(args);
  argsRef.current = args;
  const stateRef = useRef<VoiceState>("idle");
  stateRef.current = state;

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const fail = useCallback((msg: string) => {
    setError(msg);
    setState("error");
    argsRef.current.onError?.(msg);
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      const mt = (window as unknown as { mt?: MtApi }).mt;
      if (!mt) {
        fail("preload API not available");
        return;
      }
      setState("transcribing");
      try {
        const wav = await blobToWav16k(blob);
        const cfg = argsRef.current.config;
        const { text } = await mt.voice.transcribe({
          engine: cfg.engine,
          wav,
          language: cfg.language,
          openaiModel: cfg.openaiModel,
          openaiBaseUrl: cfg.openaiBaseUrl,
          whisperBinPath: cfg.whisperBinPath,
          whisperModelPath: cfg.whisperModelPath,
        });
        const trimmed = (text ?? "").trim();
        setState("idle");
        setError(null);
        if (trimmed) argsRef.current.onText(trimmed);
      } catch (e) {
        fail(errMsg(e));
      }
    },
    [fail],
  );

  const start = useCallback(async () => {
    const s = stateRef.current;
    if (s === "recording" || s === "transcribing") return;
    setError(null);
    if (!argsRef.current.config.enabled) return fail("voice disabled");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (ev) => {
        if (ev.data?.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || mime || "audio/webm",
        });
        cleanupStream();
        if (!blob.size) {
          setState("idle");
          return;
        }
        transcribe(blob).catch(() => {});
      };
      rec.onerror = () => {
        cleanupStream();
        fail("recorder error");
      };

      rec.start();
      setState("recording");
    } catch (e) {
      cleanupStream();
      fail(errMsg(e));
    }
  }, [cleanupStream, fail, transcribe]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const toggle = useCallback(() => {
    const s = stateRef.current;
    if (s === "recording") stop();
    else if (s === "idle" || s === "error") start();
  }, [start, stop]);

  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      cleanupStream();
    };
  }, [cleanupStream]);

  return { state, error, toggle, start, stop };
}
