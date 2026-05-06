// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";



const { shimMock, fakeTerminals, fitMock, webLinksMock } = vi.hoisted(() => {
  const fakeTerminals: FakeTerminal[] = [];

  type DataCb = (data: string) => void;
  type ResizeCb = (e: { cols: number; rows: number }) => void;
  type SelCb = () => void;
  type KeyHandler = (e: KeyboardEvent) => boolean;

  class FakeTerminal {
    public options: Record<string, unknown>;
    public rows = 24;
    public cols = 80;
    public addons: unknown[] = [];
    public openedOn: HTMLElement | null = null;
    public disposed = false;
    public writes: string[] = [];
    public selection = "";

    public _onData: DataCb | null = null;
    public _onResize: ResizeCb | null = null;
    public _onSelection: SelCb | null = null;
    public _keyHandler: KeyHandler | null = null;

    public dispose = vi.fn(() => {
      this.disposed = true;
    });
    public write = vi.fn((d: string) => {
      this.writes.push(d);
    });
    public writeln = vi.fn((d: string) => {
      this.writes.push(d + "\n");
    });
    public clear = vi.fn();
    public clearSelection = vi.fn(() => {
      this.selection = "";
    });
    public focus = vi.fn();
    public getSelection = vi.fn(() => this.selection);
    public attachCustomKeyEventHandler = vi.fn((h: KeyHandler) => {
      this._keyHandler = h;
    });
    public loadAddon = vi.fn((addon: unknown) => {
      this.addons.push(addon);
    });
    public open = vi.fn((host: HTMLElement) => {
      this.openedOn = host;
    });
    public onData = vi.fn((cb: DataCb) => {
      this._onData = cb;
      return { dispose: () => {} };
    });
    public onResize = vi.fn((cb: ResizeCb) => {
      this._onResize = cb;
      return { dispose: () => {} };
    });
    public onSelectionChange = vi.fn((cb: SelCb) => {
      this._onSelection = cb;
      return { dispose: () => {} };
    });

    constructor(opts: Record<string, unknown>) {
      this.options = { ...opts };
      fakeTerminals.push(this);
    }
  }

  const fitMock = vi.fn();
  const webLinksMock = vi.fn();

  const shimMock = {
    invoke: vi.fn(),
    Channel: class<T> {
      public onmessage: ((msg: T) => void) | null = null;
      public unsubscribe: (() => void) | null = null;
    },
    readText: vi.fn(async () => ""),
    writeText: vi.fn(async () => {}),
  };

  return { shimMock, fakeTerminals, fitMock, webLinksMock, FakeTerminal };
});

vi.mock("@xterm/xterm", () => {
  
  
  type DataCb = (data: string) => void;
  type ResizeCb = (e: { cols: number; rows: number }) => void;
  type SelCb = () => void;
  type KeyHandler = (e: KeyboardEvent) => boolean;

  class Terminal {
    public options: Record<string, unknown>;
    public rows = 24;
    public cols = 80;
    public addons: unknown[] = [];
    public openedOn: HTMLElement | null = null;
    public disposed = false;
    public writes: string[] = [];
    public selection = "";
    public _onData: DataCb | null = null;
    public _onResize: ResizeCb | null = null;
    public _onSelection: SelCb | null = null;
    public _keyHandler: KeyHandler | null = null;

    public dispose = vi.fn(() => {
      this.disposed = true;
    });
    public write = vi.fn((d: string) => {
      this.writes.push(d);
    });
    public writeln = vi.fn();
    public clear = vi.fn();
    public clearSelection = vi.fn(() => {
      this.selection = "";
    });
    public focus = vi.fn();
    public getSelection = vi.fn(() => this.selection);
    public attachCustomKeyEventHandler = vi.fn((h: KeyHandler) => {
      this._keyHandler = h;
    });
    public loadAddon = vi.fn((a: unknown) => {
      this.addons.push(a);
    });
    public open = vi.fn((h: HTMLElement) => {
      this.openedOn = h;
    });
    public onData = vi.fn((cb: DataCb) => {
      this._onData = cb;
      return { dispose: () => {} };
    });
    public onResize = vi.fn((cb: ResizeCb) => {
      this._onResize = cb;
      return { dispose: () => {} };
    });
    public onSelectionChange = vi.fn((cb: SelCb) => {
      this._onSelection = cb;
      return { dispose: () => {} };
    });

    constructor(opts: Record<string, unknown>) {
      this.options = { ...opts };
      fakeTerminals.push(this as unknown as never);
    }
  }
  return { Terminal };
});

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    public fit = fitMock;
  },
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    constructor() {
      webLinksMock();
    }
  },
}));

vi.mock("../../src/lib/ipc", () => shimMock);


class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
(globalThis as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver =
  FakeResizeObserver;


import { TerminalTab } from "../../src/components/TerminalTab";
import type { ITheme } from "@xterm/xterm";

const baseProps = {
  active: true,
  fontFamily: "monospace",
  fontSize: 14,
  lineHeight: 1.2,
  cursorStyle: "block" as const,
  cursorBlink: true,
  scrollback: 1000,
  theme: { background: "#000", foreground: "#fff" } as ITheme,
  shell: "/bin/bash",
  shellArgs: [] as string[],
  showGreeting: false,
  copyOnSelect: false,
  onExit: vi.fn(),
};

const flush = async () => {
  
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  shimMock.invoke.mockReset();
  shimMock.readText.mockReset().mockResolvedValue("");
  shimMock.writeText.mockReset().mockResolvedValue(undefined);
  fakeTerminals.length = 0;
  fitMock.mockReset();
  webLinksMock.mockReset();
});

afterEach(() => {
  cleanup();
});

const lastTerm = (): {
  options: Record<string, unknown>;
  dispose: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  _onData: ((d: string) => void) | null;
  _onResize: ((e: { cols: number; rows: number }) => void) | null;
  _onSelection: (() => void) | null;
  _keyHandler: ((e: KeyboardEvent) => boolean) | null;
  selection: string;
  getSelection: ReturnType<typeof vi.fn>;
  rows: number;
  cols: number;
} => {
  return fakeTerminals[fakeTerminals.length - 1] as never;
};

describe("TerminalTab", () => {
  it("1. local mount calls invoke('pty_spawn',…) and onPtyReady", async () => {
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "pty_spawn") return 42;
      return undefined;
    });
    const onPtyReady = vi.fn();
    render(
      <TerminalTab
        {...baseProps}
        tabId={1}
        kind="local"
        onPtyReady={onPtyReady}
      />,
    );
    await flush();
    const spawnCall = shimMock.invoke.mock.calls.find(
      (c) => c[0] === "pty_spawn",
    );
    expect(spawnCall).toBeTruthy();
    const args = spawnCall![1] as Record<string, unknown>;
    expect(args.rows).toBe(24);
    expect(args.cols).toBe(80);
    expect(args.shell).toBe("/bin/bash");
    expect(args.args).toBeNull();
    expect(args.env).toBeNull();
    expect(onPtyReady).toHaveBeenCalledWith(1, 42);
  });

  it("2. remote mount calls invoke('ssh_spawn',…) instead and writes banner", async () => {
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "ssh_spawn") return 7;
      return undefined;
    });
    render(
      <TerminalTab
        {...baseProps}
        tabId={9}
        kind="remote"
        remoteHostId="hostA"
        remoteBanner="connecting to hostA"
      />,
    );
    await flush();
    const sshCall = shimMock.invoke.mock.calls.find((c) => c[0] === "ssh_spawn");
    expect(sshCall).toBeTruthy();
    expect((sshCall![1] as Record<string, unknown>).hostId).toBe("hostA");
    expect(
      shimMock.invoke.mock.calls.find((c) => c[0] === "pty_spawn"),
    ).toBeUndefined();
    
    const t = lastTerm();
    const wrote = (t.write as ReturnType<typeof vi.fn>).mock.calls.some((c) =>
      String(c[0]).includes("connecting to hostA"),
    );
    expect(wrote).toBe(true);
  });

  it("3. PTY 'data' event writes chunk to terminal", async () => {
    let channel: { onmessage: ((m: unknown) => void) | null } | null = null;
    shimMock.invoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "pty_spawn") {
        channel = (args as { events: typeof channel }).events;
        return 1;
      }
      return undefined;
    });
    render(<TerminalTab {...baseProps} tabId={1} />);
    await flush();
    expect(channel).not.toBeNull();
    act(() => {
      channel!.onmessage?.({ kind: "data", value: "hello\r\n" });
    });
    const t = lastTerm();
    expect(
      (t.write as ReturnType<typeof vi.fn>).mock.calls.some(
        (c) => c[0] === "hello\r\n",
      ),
    ).toBe(true);
  });

  it("4. PTY 'exit' event invokes onExit(tabId)", async () => {
    let channel: { onmessage: ((m: unknown) => void) | null } | null = null;
    shimMock.invoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "pty_spawn") {
        channel = (args as { events: typeof channel }).events;
        return 1;
      }
      return undefined;
    });
    const onExit = vi.fn();
    render(<TerminalTab {...baseProps} tabId={11} onExit={onExit} />);
    await flush();
    act(() => {
      channel!.onmessage?.({ kind: "exit" });
    });
    expect(onExit).toHaveBeenCalledWith(11);
  });

  it("5. initialCommand is written via pty_write after PTY ready", async () => {
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "pty_spawn") return 99;
      return undefined;
    });
    render(
      <TerminalTab
        {...baseProps}
        tabId={1}
        initialCommand={"echo hi\n"}
      />,
    );
    
    await flush();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    const writes = shimMock.invoke.mock.calls.filter(
      (c) => c[0] === "pty_write",
    );
    const found = writes.find(
      (c) =>
        (c[1] as Record<string, unknown>).id === 99 &&
        (c[1] as Record<string, unknown>).data === "echo hi\n",
    );
    expect(found).toBeTruthy();
  });

  it("6. Terminal.onResize triggers invoke('pty_resize',{id,rows,cols})", async () => {
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "pty_spawn") return 3;
      return undefined;
    });
    render(<TerminalTab {...baseProps} tabId={1} />);
    await flush();
    const t = lastTerm();
    expect(t._onResize).toBeTruthy();
    await act(async () => {
      t._onResize!({ cols: 120, rows: 40 });
      await Promise.resolve();
    });
    const resize = shimMock.invoke.mock.calls.find(
      (c) => c[0] === "pty_resize",
    );
    expect(resize).toBeTruthy();
    expect(resize![1]).toEqual({ id: 3, rows: 40, cols: 120 });
  });

  it("7. theme/font re-render mutates options in place, does not dispose", async () => {
    shimMock.invoke.mockResolvedValue(1);
    const newTheme: ITheme = { background: "#111", foreground: "#eee" };
    const { rerender } = render(<TerminalTab {...baseProps} tabId={1} />);
    await flush();
    const t = lastTerm();
    rerender(
      <TerminalTab
        {...baseProps}
        tabId={1}
        fontSize={22}
        theme={newTheme}
      />,
    );
    expect(t.dispose).not.toHaveBeenCalled();
    expect(t.options.fontSize).toBe(22);
    expect(t.options.theme).toBe(newTheme);
    
    expect(fakeTerminals).toHaveLength(1);
  });

  it("8. tabId change disposes old term and creates a new one + new spawn", async () => {
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "pty_spawn") return Math.floor(Math.random() * 1000);
      return undefined;
    });
    const { rerender } = render(<TerminalTab {...baseProps} tabId={1} />);
    await flush();
    const first = lastTerm();
    rerender(<TerminalTab {...baseProps} tabId={2} />);
    await flush();
    expect(first.dispose).toHaveBeenCalled();
    expect(fakeTerminals.length).toBe(2);
    const spawnCalls = shimMock.invoke.mock.calls.filter(
      (c) => c[0] === "pty_spawn",
    );
    expect(spawnCalls.length).toBe(2);
  });

  it("9. unmount calls invoke('pty_kill',{id}) and term.dispose()", async () => {
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "pty_spawn") return 55;
      return undefined;
    });
    const { unmount } = render(<TerminalTab {...baseProps} tabId={1} />);
    await flush();
    const t = lastTerm();
    unmount();
    const kill = shimMock.invoke.mock.calls.find((c) => c[0] === "pty_kill");
    expect(kill).toBeTruthy();
    expect((kill![1] as Record<string, unknown>).id).toBe(55);
    expect(t.dispose).toHaveBeenCalled();
  });

  it("9b. unmount calls channel.unsubscribe() to remove ipcRenderer listener", async () => {
    const unsubscribeFn = vi.fn();
    shimMock.invoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "pty_spawn") {
        const ch = (args as { events: { unsubscribe: (() => void) | null } }).events;
        ch.unsubscribe = unsubscribeFn;
        return 66;
      }
      return undefined;
    });
    const { unmount } = render(<TerminalTab {...baseProps} tabId={1} />);
    await flush();
    unmount();
    expect(unsubscribeFn).toHaveBeenCalledTimes(1);
  });

  it("10. right-click w/ non-empty selection invokes onSelectionMenu", async () => {
    shimMock.invoke.mockResolvedValue(1);
    const onSelectionMenu = vi.fn();
    const { container } = render(
      <TerminalTab
        {...baseProps}
        tabId={3}
        onSelectionMenu={onSelectionMenu}
      />,
    );
    await flush();
    const t = lastTerm();
    t.selection = "selected text";
    (t.getSelection as ReturnType<typeof vi.fn>).mockReturnValue(
      "selected text",
    );
    const host = container.querySelector(".term-pane-host") as HTMLElement;
    const ev = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 34,
    });
    act(() => {
      host.dispatchEvent(ev);
    });
    expect(onSelectionMenu).toHaveBeenCalledWith(3, "selected text", 12, 34);
  });

  it("11. copyOnSelect: selection change triggers writeText(sel)", async () => {
    shimMock.invoke.mockResolvedValue(1);
    render(<TerminalTab {...baseProps} tabId={1} copyOnSelect={true} />);
    await flush();
    const t = lastTerm();
    (t.getSelection as ReturnType<typeof vi.fn>).mockReturnValue("copied");
    expect(t._onSelection).toBeTruthy();
    await act(async () => {
      t._onSelection!();
      await Promise.resolve();
    });
    expect(shimMock.writeText).toHaveBeenCalledWith("copied");
  });

  it("12. remote tab + initialCommand: ssh_spawn used and command sent later", async () => {
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "ssh_spawn") return 200;
      return undefined;
    });
    render(
      <TerminalTab
        {...baseProps}
        tabId={5}
        kind="remote"
        remoteHostId="h1"
        remoteBanner="banner"
        initialCommand={"ls\n"}
      />,
    );
    await flush();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    const ssh = shimMock.invoke.mock.calls.find((c) => c[0] === "ssh_spawn");
    expect(ssh).toBeTruthy();
    const w = shimMock.invoke.mock.calls.find(
      (c) =>
        c[0] === "pty_write" &&
        (c[1] as Record<string, unknown>).id === 200 &&
        (c[1] as Record<string, unknown>).data === "ls\n",
    );
    expect(w).toBeTruthy();
  });
});
