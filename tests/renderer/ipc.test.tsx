// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  invoke,
  Channel,
  getCurrentWindow,
  isPermissionGranted,
  requestPermission,
  sendNotification,
  readText,
  writeText,
  open,
} from "../../src/lib/ipc";

type MtMock = ReturnType<typeof makeMt>;

function makeMt() {
  return {
    pty: {
      spawn: vi.fn(async (_a: unknown) => 11),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      kill: vi.fn(async () => undefined),
      info: vi.fn(async () => ({ cwd: "/tmp", cmd: "bash", pid: 9 })),
      recentOutput: vi.fn(async () => "out"),
      onEvent: vi.fn(
        (_id: number, _cb: (ev: unknown) => void) => () => {},
      ),
    },
    system: {
      info: vi.fn(async () => ({ user: "me", host: "box" })),
    },
    vault: {
      status: vi.fn(async () => ({ exists: true, unlocked: false })),
      init: vi.fn(async () => undefined),
      unlock: vi.fn(async () => undefined),
      lock: vi.fn(async () => undefined),
      changePassword: vi.fn(async () => undefined),
    },
    ai: {
      streamComplete: vi.fn(async () => 33),
      cancel: vi.fn(async () => undefined),
      listModels: vi.fn(async () => ["m1", "m2"]),
      setKey: vi.fn(async () => undefined),
      clearKey: vi.fn(async () => undefined),
      hasKey: vi.fn(async () => true),
      onEvent: vi.fn(
        (_id: number, _cb: (ev: unknown) => void) => () => {},
      ),
    },
    claudeCode: {
      status: vi.fn(async () => "idle"),
    },
    mcp: {
      status: vi.fn(async () => ({ running: false })),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    },
    window: {
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      isMaximized: vi.fn(async () => true),
      onMaximizedChange: vi.fn((_cb: () => void) => () => {}),
    },
    clipboard: {
      readText: vi.fn(async () => "from-clip"),
      writeText: vi.fn(async () => undefined),
    },
    notification: {
      requestPermission: vi.fn(async () => "granted" as const),
      send: vi.fn(),
    },
    dialog: {
      open: vi.fn(async () => ["/tmp/file"] as string[]),
    },
  };
}

let mt: MtMock;

beforeEach(() => {
  mt = makeMt();
  (window as unknown as { mt: MtMock }).mt = mt;
});

afterEach(() => {
  delete (window as unknown as { mt?: MtMock }).mt;
  vi.restoreAllMocks();
});

describe("invoke routing", () => {
  it("system_info → window.mt.system.info()", async () => {
    const r = await invoke("system_info");
    expect(mt.system.info).toHaveBeenCalled();
    expect(r).toEqual({ user: "me", host: "box" });
  });

  it("pty_spawn passes args, returns id, wires events channel", async () => {
    const ch = new Channel<{ kind: string }>();
    let lastEv: unknown = null;
    ch.onmessage = (m) => (lastEv = m);
    const id = await invoke<number>("pty_spawn", {
      events: ch,
      rows: 10,
      cols: 20,
      shell: "/bin/zsh",
      args: ["-l"],
      env: { K: "v" },
    });
    expect(id).toBe(11);
    expect(mt.pty.spawn).toHaveBeenCalledWith({
      rows: 10,
      cols: 20,
      shell: "/bin/zsh",
      args: ["-l"],
      env: { K: "v" },
    });
    expect(mt.pty.onEvent).toHaveBeenCalledWith(11, expect.any(Function));
    
    const cb = mt.pty.onEvent.mock.calls[0][1] as (ev: unknown) => void;
    cb({ kind: "data", value: "x" });
    expect(lastEv).toEqual({ kind: "data", value: "x" });
    expect(typeof ch.unsubscribe).toBe("function");
  });

  it("pty_write/resize/kill/info/recent_output", async () => {
    await invoke("pty_write", { id: 1, data: "hi" });
    expect(mt.pty.write).toHaveBeenCalledWith(1, "hi");
    await invoke("pty_resize", { id: 1, rows: 30, cols: 100 });
    expect(mt.pty.resize).toHaveBeenCalledWith(1, 30, 100);
    await invoke("pty_kill", { id: 1 });
    expect(mt.pty.kill).toHaveBeenCalledWith(1);
    await invoke("pty_info", { id: 1 });
    expect(mt.pty.info).toHaveBeenCalledWith(1);
    await invoke("pty_recent_output", { id: 1, maxBytes: 4096 });
    expect(mt.pty.recentOutput).toHaveBeenCalledWith(1, 4096);
  });

  it("vault_*", async () => {
    await invoke("vault_status");
    expect(mt.vault.status).toHaveBeenCalled();
    await invoke("vault_init", { masterPassword: "p" });
    expect(mt.vault.init).toHaveBeenCalledWith("p");
    await invoke("vault_unlock", { masterPassword: "p" });
    expect(mt.vault.unlock).toHaveBeenCalledWith("p");
    await invoke("vault_lock");
    expect(mt.vault.lock).toHaveBeenCalled();
    await invoke("vault_change_password", { oldPassword: "a", newPassword: "b" });
    expect(mt.vault.changePassword).toHaveBeenCalledWith("a", "b");
  });

  it("ai_*: stream_complete wires events; cancel/list/set/clear/has", async () => {
    const ch = new Channel<{ delta?: string }>();
    let received: unknown = null;
    ch.onmessage = (m) => (received = m);
    const taskId = await invoke<number>("ai_stream_complete", {
      events: ch,
      provider: "anthropic",
      model: "claude-3",
      messages: [{ role: "user", content: "hi" }],
      system: "sys",
      maxTokens: 100,
      temperature: 0.5,
      baseUrl: "https://api",
    });
    expect(taskId).toBe(33);
    expect(mt.ai.streamComplete).toHaveBeenCalledWith({
      provider: "anthropic",
      model: "claude-3",
      messages: [{ role: "user", content: "hi" }],
      system: "sys",
      maxTokens: 100,
      temperature: 0.5,
      baseUrl: "https://api",
    });
    expect(mt.ai.onEvent).toHaveBeenCalledWith(33, expect.any(Function));
    const cb = mt.ai.onEvent.mock.calls[0][1] as (ev: unknown) => void;
    cb({ delta: "x" });
    expect(received).toEqual({ delta: "x" });

    await invoke("ai_cancel", { taskId: 33 });
    expect(mt.ai.cancel).toHaveBeenCalledWith(33);
    await invoke("ai_list_models", { provider: "openai", baseUrl: "u" });
    expect(mt.ai.listModels).toHaveBeenCalledWith("openai", "u");
    await invoke("ai_set_key", { provider: "anthropic", key: "k" });
    expect(mt.ai.setKey).toHaveBeenCalledWith("anthropic", "k");
    await invoke("ai_clear_key", { provider: "openai" });
    expect(mt.ai.clearKey).toHaveBeenCalledWith("openai");
    const has = await invoke("ai_has_key", { provider: "anthropic" });
    expect(mt.ai.hasKey).toHaveBeenCalledWith("anthropic");
    expect(has).toBe(true);
  });

  it("claude_code_status", async () => {
    await invoke("claude_code_status", { tabId: 5 });
    expect(mt.claudeCode.status).toHaveBeenCalledWith(5);
  });

  it("mcp_server_*", async () => {
    await invoke("mcp_server_status");
    expect(mt.mcp.status).toHaveBeenCalled();
    await invoke("mcp_server_start");
    expect(mt.mcp.start).toHaveBeenCalled();
    await invoke("mcp_server_stop");
    expect(mt.mcp.stop).toHaveBeenCalled();
  });

  it("unknown command rejects", async () => {
    await expect(invoke("nonsense_cmd")).rejects.toThrow(/unknown command/i);
  });

  it("missing window.mt throws", async () => {
    delete (window as unknown as { mt?: MtMock }).mt;
    await expect(invoke("system_info")).rejects.toThrow(
      /window\.mt|preload/i,
    );
  });
});

describe("Channel", () => {
  it("constructs with null onmessage and unsubscribe", () => {
    const ch = new Channel<number>();
    expect(ch.onmessage).toBeNull();
    expect(ch.unsubscribe).toBeNull();
    let got = -1;
    ch.onmessage = (n) => (got = n);
    ch.onmessage(42);
    expect(got).toBe(42);
  });
});

describe("getCurrentWindow", () => {
  it("methods proxy to window.mt.window.*", async () => {
    const w = getCurrentWindow();
    await w.minimize();
    expect(mt.window.minimize).toHaveBeenCalled();
    await w.toggleMaximize();
    expect(mt.window.toggleMaximize).toHaveBeenCalled();
    await w.close();
    expect(mt.window.close).toHaveBeenCalled();
    await w.destroy();
    
    expect(mt.window.close).toHaveBeenCalledTimes(2);
    const max = await w.isMaximized();
    expect(max).toBe(true);
    const off = await w.onResized(() => {});
    expect(typeof off).toBe("function");
    expect(mt.window.onMaximizedChange).toHaveBeenCalled();
    const offClose = await w.onCloseRequested(() => {});
    expect(typeof offClose).toBe("function");
  });
});

describe("clipboard, notification, dialog", () => {
  it("readText/writeText use clipboard namespace", async () => {
    const r = await readText();
    expect(mt.clipboard.readText).toHaveBeenCalled();
    expect(r).toBe("from-clip");
    await writeText("paste");
    expect(mt.clipboard.writeText).toHaveBeenCalledWith("paste");
  });

  it("isPermissionGranted/requestPermission/sendNotification → notification.*", async () => {
    expect(await isPermissionGranted()).toBe(true);
    expect(mt.notification.requestPermission).toHaveBeenCalled();
    expect(await requestPermission()).toBe("granted");
    sendNotification({ title: "t", body: "b" });
    expect(mt.notification.send).toHaveBeenCalledWith({ title: "t", body: "b" });
  });

  it("open(file) → dialog.open with openFile property and unwraps result", async () => {
    const r = await open({ defaultPath: "/d", title: "pick" });
    expect(mt.dialog.open).toHaveBeenCalledWith({
      properties: ["openFile"],
      defaultPath: "/d",
      title: "pick",
      filters: undefined,
    });
    expect(r).toBe("/tmp/file");
  });

  it("open({directory:true,multiple:true}) returns array", async () => {
    mt.dialog.open.mockResolvedValueOnce(["/a", "/b"]);
    const r = await open({ directory: true, multiple: true });
    const args = mt.dialog.open.mock.calls.at(-1)![0] as {
      properties: string[];
    };
    expect(args.properties).toContain("openDirectory");
    expect(args.properties).toContain("multiSelections");
    expect(r).toEqual(["/a", "/b"]);
  });

  it("open returns null on empty/null result", async () => {
    mt.dialog.open.mockResolvedValueOnce([]);
    expect(await open()).toBeNull();
    mt.dialog.open.mockResolvedValueOnce(null as unknown as string[]);
    expect(await open()).toBeNull();
  });
});
