import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface Props {
  tabId: number;
  active: boolean;
  onExit: (tabId: number) => void;
  onInfo?: (tabId: number, info: { cwd: string | null; cmd: string | null }) => void;
}

const THEME = {
  background: "#0c0c0c",
  foreground: "#ebebeb",
  cursor: "#f5b056",
  cursorAccent: "#0c0c0c",
  selectionBackground: "rgba(245, 176, 86, 0.30)",
  black: "#181818",
  red: "#e8847a",
  green: "#6dd5a4",
  yellow: "#f5b056",
  blue: "#7eb1ee",
  magenta: "#c79cf2",
  cyan: "#7ed7d3",
  white: "#cecece",
  brightBlack: "#717171",
  brightRed: "#f0a097",
  brightGreen: "#90e0bb",
  brightYellow: "#fbc77a",
  brightBlue: "#9bc4f5",
  brightMagenta: "#d4b3f7",
  brightCyan: "#9ee2de",
  brightWhite: "#f5f5f5",
};

export function TerminalTab({ tabId, active, onExit, onInfo }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<number | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;

  useEffect(() => {
    if (!hostRef.current) return;

    const term = new Terminal({
      fontFamily:
        '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      allowTransparency: false,
      scrollback: 5000,
      theme: THEME,
      smoothScrollDuration: 80,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let disposed = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;

    const start = async () => {
      const cols = term.cols;
      const rows = term.rows;
      try {
        const id = await invoke<number>("pty_spawn", { rows, cols });
        if (disposed) {
          await invoke("pty_kill", { id }).catch(() => {});
          return;
        }
        ptyIdRef.current = id;

        unlistenData = await listen<string>(`pty://data/${id}`, (e) => {
          term.write(e.payload);
        });
        unlistenExit = await listen(`pty://exit/${id}`, () => {
          onExitRef.current(tabId);
        });

        term.onData((data) => {
          invoke("pty_write", { id, data }).catch(() => {});
        });
        term.onResize(({ cols, rows }) => {
          invoke("pty_resize", { id, rows, cols }).catch(() => {});
        });

        const pollInfo = async () => {
          try {
            const info = await invoke<{
              cwd: string | null;
              cmd: string | null;
              pid: number;
            }>("pty_info", { id });
            onInfoRef.current?.(tabId, { cwd: info.cwd, cmd: info.cmd });
          } catch {}
        };
        pollInfo();
        pollHandle = setInterval(pollInfo, 1500);
      } catch (err) {
        term.write(`\r\n\x1b[31mfailed to spawn pty: ${String(err)}\x1b[0m\r\n`);
      }
    };
    start();

    let fitTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFit = () => {
      if (fitTimer) clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        try {
          fit.fit();
        } catch {}
      }, 30);
    };
    const ro = new ResizeObserver(scheduleFit);
    ro.observe(hostRef.current);
    if (hostRef.current.parentElement) {
      ro.observe(hostRef.current.parentElement);
    }

    return () => {
      disposed = true;
      ro.disconnect();
      if (fitTimer) clearTimeout(fitTimer);
      if (pollHandle) clearInterval(pollHandle);
      unlistenData?.();
      unlistenExit?.();
      const id = ptyIdRef.current;
      if (id != null) {
        invoke("pty_kill", { id }).catch(() => {});
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [tabId]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
          termRef.current?.focus();
        } catch {}
      });
    }
  }, [active]);

  return (
    <div
      ref={hostRef}
      className={`term-pane-host ${active ? "" : "hidden"}`}
      onClick={() => termRef.current?.focus()}
    />
  );
}
