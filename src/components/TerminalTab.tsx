import { useEffect, useRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { CanvasAddon } from "@xterm/addon-canvas";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { CursorStyle } from "../settings/useSettings";

interface Props {
  tabId: number;
  active: boolean;
  onExit: (tabId: number) => void;
  onInfo?: (tabId: number, info: { cwd: string | null; cmd: string | null }) => void;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  theme: ITheme;
  shell: string;
  shellArgs: string[];
  copyOnSelect: boolean;
}

type PtyEvent =
  | { kind: "data"; value: string }
  | { kind: "exit" };

export function TerminalTab({
  tabId,
  active,
  onExit,
  onInfo,
  fontFamily,
  fontSize,
  lineHeight,
  cursorStyle,
  cursorBlink,
  scrollback,
  theme,
  shell,
  shellArgs,
  copyOnSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<number | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;
  const initialShellRef = useRef({ shell, shellArgs });
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily,
      fontSize,
      lineHeight,
      letterSpacing: 0,
      cursorBlink,
      cursorStyle,
      cursorWidth: cursorStyle === "bar" ? 2 : 1,
      allowTransparency: false,
      scrollback,
      theme,
      smoothScrollDuration: 80,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(host);
    try {
      term.loadAddon(new CanvasAddon());
    } catch {}

    if (copyOnSelect) {
      term.onSelectionChange(() => {
        const sel = term.getSelection();
        if (sel) navigator.clipboard?.writeText(sel).catch(() => {});
      });
    }

    try {
      fit.fit();
    } catch {}

    termRef.current = term;
    fitRef.current = fit;

    let disposed = false;
    const pendingInput: string[] = [];
    let pendingResize: { rows: number; cols: number } | null = null;

    const events = new Channel<PtyEvent>();
    events.onmessage = (msg) => {
      if (disposed) return;
      if (msg.kind === "data") {
        term.write(msg.value);
      } else if (msg.kind === "exit") {
        onExitRef.current(tabId);
      }
    };

    term.onData((data) => {
      const id = ptyIdRef.current;
      if (id == null) {
        pendingInput.push(data);
        return;
      }
      invoke("pty_write", { id, data }).catch(() => {});
    });
    term.onResize(({ cols, rows }) => {
      const id = ptyIdRef.current;
      if (id == null) {
        pendingResize = { rows, cols };
        return;
      }
      invoke("pty_resize", { id, rows, cols }).catch(() => {});
    });

    const start = async () => {
      try {
        const init = initialShellRef.current;
        const id = await invoke<number>("pty_spawn", {
          events,
          rows: term.rows,
          cols: term.cols,
          shell: init.shell || null,
          args: init.shellArgs.length ? init.shellArgs : null,
        });
        if (disposed) {
          await invoke("pty_kill", { id }).catch(() => {});
          return;
        }
        ptyIdRef.current = id;

        if (pendingResize) {
          invoke("pty_resize", {
            id,
            rows: pendingResize.rows,
            cols: pendingResize.cols,
          }).catch(() => {});
          pendingResize = null;
        }
        if (pendingInput.length) {
          for (const data of pendingInput) {
            invoke("pty_write", { id, data }).catch(() => {});
          }
          pendingInput.length = 0;
        }
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
    ro.observe(host);

    return () => {
      disposed = true;
      ro.disconnect();
      if (fitTimer) clearTimeout(fitTimer);
      const id = ptyIdRef.current;
      if (id != null) {
        invoke("pty_kill", { id }).catch(() => {});
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit();
        termRef.current?.focus();
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const pollInfo = async () => {
      const id = ptyIdRef.current;
      if (id == null) return;
      try {
        const info = await invoke<{
          cwd: string | null;
          cmd: string | null;
          pid: number;
        }>("pty_info", { id });
        if (cancelled) return;
        onInfoRef.current?.(tabId, { cwd: info.cwd, cmd: info.cmd });
      } catch {}
    };
    pollInfo();
    const handle = setInterval(pollInfo, 1500);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [active, tabId]);

  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term) return;
    try {
      term.options.fontFamily = fontFamily;
      term.options.fontSize = fontSize;
      term.options.lineHeight = lineHeight;
      term.options.cursorStyle = cursorStyle;
      term.options.cursorBlink = cursorBlink;
      term.options.cursorWidth = cursorStyle === "bar" ? 2 : 1;
      term.options.scrollback = scrollback;
      term.options.theme = theme;
    } catch {}
    const id = setTimeout(() => {
      try {
        fit?.fit();
      } catch {}
    }, 30);
    return () => clearTimeout(id);
  }, [fontFamily, fontSize, lineHeight, cursorStyle, cursorBlink, scrollback, theme]);

  return (
    <div
      ref={hostRef}
      role="application"
      aria-label="terminal"
      className={`term-pane-host ${active ? "" : "hidden"}`}
      onMouseDown={(e) => {
        mouseDownTargetRef.current = e.target;
      }}
      onMouseUp={(e) => {
        if (mouseDownTargetRef.current === e.target) {
          const sel = termRef.current?.getSelection();
          if (!sel) termRef.current?.focus();
        }
        mouseDownTargetRef.current = null;
      }}
    />
  );
}
