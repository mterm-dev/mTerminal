import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULT_ACCENTS, isHexAccent } from "../utils/accent";

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (x: number) =>
    clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh >= 0 && hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

const SV_W = 200;
const SV_H = 120;
const HUE_W = 200;
const HUE_H = 14;

export function ColorPicker({ value, onChange }: Props) {
  const safeValue = isHexAccent(value) ? value : DEFAULT_ACCENTS[0];
  const initialHsv = useMemo(() => {
    const [r, g, b] = hexToRgb(safeValue);
    return rgbToHsv(r, g, b);
  }, [safeValue]);

  const [hsv, setHsv] = useState<HSV>(initialHsv);
  const [hexInput, setHexInput] = useState<string>(safeValue);
  const lastEmittedRef = useRef<string>(safeValue.toLowerCase());

  useEffect(() => {
    if (safeValue.toLowerCase() !== lastEmittedRef.current) {
      const [r, g, b] = hexToRgb(safeValue);
      setHsv(rgbToHsv(r, g, b));
      setHexInput(safeValue);
      lastEmittedRef.current = safeValue.toLowerCase();
    }
  }, [safeValue]);

  const svRef = useRef<HTMLCanvasElement | null>(null);
  const hueRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cvs = svRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const w = cvs.width;
    const h = cvs.height;
    const baseHex = hsvToHex(hsv.h, 1, 1);
    const sat = ctx.createLinearGradient(0, 0, w, 0);
    sat.addColorStop(0, "#ffffff");
    sat.addColorStop(1, baseHex);
    ctx.fillStyle = sat;
    ctx.fillRect(0, 0, w, h);
    const val = ctx.createLinearGradient(0, 0, 0, h);
    val.addColorStop(0, "rgba(0,0,0,0)");
    val.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = val;
    ctx.fillRect(0, 0, w, h);
  }, [hsv.h]);

  useEffect(() => {
    const cvs = hueRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const w = cvs.width;
    const h = cvs.height;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    const stops = [0, 60, 120, 180, 240, 300, 360];
    for (const deg of stops) {
      grad.addColorStop(deg / 360, hsvToHex(deg, 1, 1));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }, []);

  const emit = useCallback(
    (next: HSV) => {
      const hex = hsvToHex(next.h, next.s, next.v);
      lastEmittedRef.current = hex.toLowerCase();
      setHexInput(hex);
      onChange(hex);
    },
    [onChange],
  );

  const handleSvPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cvs = svRef.current;
      if (!cvs) return;
      const rect = cvs.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const y = clamp(e.clientY - rect.top, 0, rect.height);
      const s = x / rect.width;
      const v = 1 - y / rect.height;
      const next = { h: hsv.h, s, v };
      setHsv(next);
      emit(next);
    },
    [hsv.h, emit],
  );

  const handleHuePointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cvs = hueRef.current;
      if (!cvs) return;
      const rect = cvs.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 0, rect.width);
      const h = (x / rect.width) * 360;
      const next = { h, s: hsv.s || 1, v: hsv.v || 1 };
      setHsv(next);
      emit(next);
    },
    [hsv.s, hsv.v, emit],
  );

  const onSwatchClick = useCallback(
    (hex: string) => {
      const [r, g, b] = hexToRgb(hex);
      const next = rgbToHsv(r, g, b);
      setHsv(next);
      lastEmittedRef.current = hex.toLowerCase();
      setHexInput(hex);
      onChange(hex);
    },
    [onChange],
  );

  const commitHexInput = useCallback(() => {
    const v = hexInput.startsWith("#") ? hexInput : `#${hexInput}`;
    if (!isHexAccent(v)) {
      setHexInput(safeValue);
      return;
    }
    onSwatchClick(v.toLowerCase());
  }, [hexInput, safeValue, onSwatchClick]);

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const svMarkerLeft = hsv.s * SV_W;
  const svMarkerTop = (1 - hsv.v) * SV_H;
  const hueMarkerLeft = (hsv.h / 360) * HUE_W;

  return (
    <div className="color-picker" onPointerDown={(e) => e.stopPropagation()}>
      <div className="cp-swatch-grid">
        {DEFAULT_ACCENTS.map((hex) => {
          const active = currentHex.toLowerCase() === hex.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              className={`cp-swatch ${active ? "active" : ""}`}
              style={{ background: hex }}
              onClick={() => onSwatchClick(hex)}
              aria-label={`color ${hex}`}
            />
          );
        })}
      </div>

      <div className="cp-sv-wrap">
        <canvas
          ref={svRef}
          className="cp-sv"
          width={SV_W}
          height={SV_H}
          onPointerDown={(e) => {
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            handleSvPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            handleSvPointer(e);
          }}
        />
        <span
          className="cp-sv-marker"
          style={{ left: svMarkerLeft, top: svMarkerTop }}
        />
      </div>

      <div className="cp-hue-wrap">
        <canvas
          ref={hueRef}
          className="cp-hue"
          width={HUE_W}
          height={HUE_H}
          onPointerDown={(e) => {
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            handleHuePointer(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            handleHuePointer(e);
          }}
        />
        <span className="cp-hue-marker" style={{ left: hueMarkerLeft }} />
      </div>

      <div className="cp-hex">
        <span className="cp-hex-preview" style={{ background: currentHex }} />
        <input
          type="text"
          className="cp-hex-input"
          value={hexInput}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={commitHexInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitHexInput();
            }
          }}
        />
      </div>
    </div>
  );
}
