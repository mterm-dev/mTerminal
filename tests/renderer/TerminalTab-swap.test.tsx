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
    public clearSelection = vi.fn();
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
import { useWorkspace } from "../../src/hooks/useWorkspace";
import type { ITheme } from "@xterm/xterm";
import { useEffect, useState } from "react";

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

function pair(order: Array<{ id: number }>) {
  return (
    <>
      {order.map((t) => (
        <TerminalTab key={t.id} tabId={t.id} {...baseProps} />
      ))}
    </>
  );
}

describe("TerminalTab — swap behavior", () => {
  it("does not call pty_kill when sibling tabs are reordered (regression: htop survives swap)", async () => {
    const ptyByTab = new Map<number, number>();
    let nextPty = 100;
    shimMock.invoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "pty_spawn") {
        const id = nextPty++;
        return id;
      }
      return undefined;
    });

    const tabs = [{ id: 1 }, { id: 2 }];
    const { rerender } = render(pair(tabs));
    await flush();

    const spawns = shimMock.invoke.mock.calls.filter((c) => c[0] === "pty_spawn");
    expect(spawns).toHaveLength(2);

    // Track pty ids via spawn return order: tab order in render = pty 100, 101
    expect(shimMock.invoke.mock.calls.some((c) => c[0] === "pty_kill")).toBe(false);

    // Now SWAP the order, simulating useWorkspace.swapTabsInGroup
    rerender(pair([tabs[1], tabs[0]]));
    await flush();

    // After reorder, pty_kill should NOT have been invoked
    const killCalls = shimMock.invoke.mock.calls.filter((c) => c[0] === "pty_kill");
    expect(killCalls).toHaveLength(0);

    // No new pty_spawn either — instances preserved
    const spawnCallsAfter = shimMock.invoke.mock.calls.filter(
      (c) => c[0] === "pty_spawn",
    );
    expect(spawnCallsAfter).toHaveLength(2);

    // Underlying xterm Terminal instances preserved (not disposed)
    expect(fakeTerminals).toHaveLength(2);
    expect(fakeTerminals.every((t) => !t.disposed)).toBe(true);
  });

  it("preserves PTY when toolbar prop toggles (drag-source styling)", async () => {
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "pty_spawn") return 1;
      return undefined;
    });
    const Toolbar = () => <div data-testid="toolbar">tb</div>;

    const { rerender } = render(
      <TerminalTab key={1} tabId={1} {...baseProps} toolbar={<Toolbar />} />,
    );
    await flush();
    expect(shimMock.invoke.mock.calls.filter((c) => c[0] === "pty_spawn")).toHaveLength(1);

    // Now toggle toolbar to nothing (e.g., when switching out of grid mode)
    rerender(<TerminalTab key={1} tabId={1} {...baseProps} toolbar={undefined} />);
    await flush();

    expect(
      shimMock.invoke.mock.calls.some((c) => c[0] === "pty_kill"),
    ).toBe(false);
    expect(fakeTerminals).toHaveLength(1);
    expect(fakeTerminals[0].disposed).toBe(false);
  });

  it("preserves PTY when isDragging / isDropTarget flip", async () => {
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "pty_spawn") return 1;
      return undefined;
    });
    const { rerender } = render(
      <TerminalTab key={1} tabId={1} {...baseProps} />,
    );
    await flush();

    rerender(<TerminalTab key={1} tabId={1} {...baseProps} isDragging />);
    rerender(<TerminalTab key={1} tabId={1} {...baseProps} isDragging isDropTarget />);
    rerender(<TerminalTab key={1} tabId={1} {...baseProps} />);
    await flush();

    expect(
      shimMock.invoke.mock.calls.filter((c) => c[0] === "pty_kill"),
    ).toHaveLength(0);
    expect(fakeTerminals).toHaveLength(1);
  });

  it("DOM order of TerminalTab cells stays stable after swap (htop survives)", async () => {
    let nextPty = 300;
    shimMock.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "pty_spawn") return nextPty++;
      return undefined;
    });

    let triggerSwap: (() => void) | null = null;

    let groupIdRef: string | null = null;

    function App() {
      const ws = useWorkspace();
      const [ready, setReady] = useState(false);
      useEffect(() => {
        if (ready) return;
        const gid = ws.addGroup("g");
        groupIdRef = gid;
        const a = ws.addTab(gid);
        const b = ws.addTab(gid);
        triggerSwap = () => ws.swapTabsInGroup(a, b);
        setReady(true);
      }, [ready, ws]);
      const groupTabs = groupIdRef
        ? ws.tabs.filter((t) => t.groupId === groupIdRef)
        : [];
      const slotOrder = groupIdRef
        ? ws.groupLayouts[groupIdRef]?.slotOrder
        : undefined;
      const idsByOrder = slotOrder ?? groupTabs.map((t) => t.id);
      return (
        <div className="term-pane grid" data-testid="pane">
          {groupTabs.map((t) => {
            const slot = idsByOrder.indexOf(t.id);
            return (
              <TerminalTab
                key={t.id}
                tabId={t.id}
                gridSlot={slot}
                gridPlacement={{ colStart: slot + 1, rowStart: 1, colSpan: 1 }}
                {...baseProps}
              />
            );
          })}
        </div>
      );
    }

    const { container } = render(<App />);
    await flush();
    await flush();

    const cellsBefore = Array.from(
      container.querySelectorAll<HTMLElement>("[data-tab-id]"),
    ).map((el) => el.dataset.tabId);
    expect(cellsBefore).toHaveLength(2);

    const initialSpawns = shimMock.invoke.mock.calls.filter(
      (c) => c[0] === "pty_spawn",
    ).length;

    expect(triggerSwap).not.toBeNull();
    await act(async () => {
      triggerSwap!();
      await Promise.resolve();
    });
    await flush();

    const cellsAfter = Array.from(
      container.querySelectorAll<HTMLElement>("[data-tab-id]"),
    ).map((el) => el.dataset.tabId);

    // DOM order MUST be stable — protects long-running PTY foreground processes
    // (like htop) from being killed by DOM detach during reorder.
    expect(cellsAfter).toEqual(cellsBefore);

    // No pty_kill, no fresh pty_spawn
    expect(
      shimMock.invoke.mock.calls.filter((c) => c[0] === "pty_kill"),
    ).toHaveLength(0);
    expect(
      shimMock.invoke.mock.calls.filter((c) => c[0] === "pty_spawn"),
    ).toHaveLength(initialSpawns);
    expect(fakeTerminals.every((t) => !t.disposed)).toBe(true);
  });

  it("integration: swapTabsInGroup via useWorkspace preserves PTY ids and instances", async () => {
    let nextPty = 200;
    const ptyByTab = new Map<number, number>();
    shimMock.invoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "pty_spawn") {
        const id = nextPty++;
        return id;
      }
      return undefined;
    });

    let triggerSwap: (() => void) | null = null;

    function App() {
      const ws = useWorkspace();
      const [ready, setReady] = useState(false);
      useEffect(() => {
        if (ready) return;
        const gid = ws.addGroup("g");
        const a = ws.addTab(gid);
        const b = ws.addTab(gid);
        triggerSwap = () => ws.swapTabsInGroup(a, b);
        setReady(true);
      }, [ready, ws]);
      return (
        <div className="term-pane grid">
          {ws.tabs.map((t, i) => (
            <TerminalTab
              key={t.id}
              tabId={t.id}
              gridSlot={i}
              gridPlacement={{ colStart: i + 1, rowStart: 1, colSpan: 1 }}
              {...baseProps}
              onPtyReady={(tabId, ptyId) => {
                ptyByTab.set(tabId, ptyId);
              }}
            />
          ))}
        </div>
      );
    }

    render(<App />);
    await flush();
    await flush();

    const spawnsBefore = shimMock.invoke.mock.calls.filter(
      (c) => c[0] === "pty_spawn",
    );
    expect(spawnsBefore.length).toBeGreaterThanOrEqual(2);
    const initialPtyCount = spawnsBefore.length;
    expect(fakeTerminals).toHaveLength(initialPtyCount);
    const recordedPtys = new Set(ptyByTab.values());

    expect(triggerSwap).not.toBeNull();
    await act(async () => {
      triggerSwap!();
      await Promise.resolve();
    });
    await flush();

    const killCalls = shimMock.invoke.mock.calls.filter(
      (c) => c[0] === "pty_kill",
    );
    expect(killCalls).toHaveLength(0);

    const spawnsAfter = shimMock.invoke.mock.calls.filter(
      (c) => c[0] === "pty_spawn",
    );
    expect(spawnsAfter).toHaveLength(initialPtyCount);

    expect(fakeTerminals.filter((t) => t.disposed)).toHaveLength(0);

    for (const ptyId of recordedPtys) {
      expect([...ptyByTab.values()]).toContain(ptyId);
    }
  });
});
