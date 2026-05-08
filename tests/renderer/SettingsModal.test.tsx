// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";


const { hasKeyState, setKeyMock, clearKeyMock, refreshMock } = vi.hoisted(() => ({
  hasKeyState: { current: {} as Record<string, boolean> },
  setKeyMock: vi.fn(async (_p: string, _k: string) => {}),
  clearKeyMock: vi.fn(async (_p: string) => {}),
  refreshMock: vi.fn(async () => {}),
}));

vi.mock("../../src/hooks/useAIKeys", () => ({
  useAIKeys: (_unlocked: boolean) => ({
    hasKey: hasKeyState.current,
    setKey: setKeyMock,
    clearKey: clearKeyMock,
    refresh: refreshMock,
  }),
}));


const { listModelsMock } = vi.hoisted(() => ({
  listModelsMock: vi.fn(async (_p: string, _b?: string) => [] as any[]),
}));

vi.mock("../../src/hooks/useAI", () => ({
  listModels: listModelsMock,
  useAI: () => ({ complete: vi.fn(), cancelAll: vi.fn() }),
}));

import { SettingsModal } from "../../src/settings/SettingsModal";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/useSettings";

beforeEach(() => {
  hasKeyState.current = {};
  setKeyMock.mockClear();
  clearKeyMock.mockClear();
  refreshMock.mockClear();
  listModelsMock.mockClear();
  listModelsMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

function makeProps(overrides: Partial<React.ComponentProps<typeof SettingsModal>> = {}) {
  const update = vi.fn();
  const reset = vi.fn();
  const onClose = vi.fn();
  const onRequestVault = vi.fn();
  return {
    settings: { ...DEFAULT_SETTINGS } as Settings,
    update,
    reset,
    onClose,
    vaultUnlocked: true,
    vaultExists: true,
    onRequestVault,
    mcpStatus: undefined,
    ...overrides,
  };
}

function gotoSection(label: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("SettingsModal — render & navigation", () => {
  it("renders all section nav buttons", () => {
    render(<SettingsModal {...makeProps()} />);
    for (const label of [
      /^Appearance$/,
      /^Terminal$/,
      /^Shell$/,
      /^Behavior$/,
      /^AI$/,
      /^About$/,
    ]) {
      expect(screen.getAllByRole("button", { name: label }).length).toBeGreaterThan(0);
    }
  });

  it("opens with Appearance section active by default", () => {
    render(<SettingsModal {...makeProps()} />);
    const navBtn = screen.getAllByRole("button", { name: /^Appearance$/ })[0];
    expect(navBtn.className).toContain("active");
    
    expect(screen.getByText(/^Theme$/)).toBeTruthy();
  });

  it("switches to Terminal section when its nav button is clicked", () => {
    render(<SettingsModal {...makeProps()} />);
    gotoSection(/^Terminal$/);
    expect(screen.getByText(/Font family/i)).toBeTruthy();
    expect(screen.getByText(/Cursor style/i)).toBeTruthy();
  });

  it("switches to Shell section", () => {
    render(<SettingsModal {...makeProps()} />);
    gotoSection(/^Shell$/);
    expect(screen.getByText(/Shell override/i)).toBeTruthy();
    expect(screen.getByText(/Shell arguments/i)).toBeTruthy();
  });

  it("switches to Behavior section", () => {
    render(<SettingsModal {...makeProps()} />);
    gotoSection(/^Behavior$/);
    expect(screen.getByText(/Confirm close with multiple tabs/i)).toBeTruthy();
    expect(screen.getByText(/Copy on select/i)).toBeTruthy();
    expect(screen.getByText(/mTerminal greeting/i)).toBeTruthy();
  });

  it("switches to About section", () => {
    render(<SettingsModal {...makeProps()} />);
    gotoSection(/^About$/);
    expect(screen.getByText(/^mTerminal$/)).toBeTruthy();
    expect(screen.getByText(/v0\.1\.0/)).toBeTruthy();
  });

  it("switches to AI section showing master switch", () => {
    render(<SettingsModal {...makeProps()} />);
    gotoSection(/^AI$/);
    expect(screen.getByText(/Enable AI/i)).toBeTruthy();
  });
});

describe("SettingsModal — Appearance fields", () => {
  it("theme picker shows active state matching themeId, clicking another calls update", () => {
    const props = makeProps({ settings: { ...DEFAULT_SETTINGS, themeId: "mterminal" } });
    render(<SettingsModal {...props} />);
    
    const cards = document.querySelectorAll(".theme-card");
    expect(cards.length).toBeGreaterThan(0);
    
    const active = document.querySelectorAll(".theme-card.active");
    expect(active.length).toBe(1);
    
    if (cards.length > 1) {
      fireEvent.click(cards[cards.length - 1]);
      expect(props.update).toHaveBeenCalledWith("themeId", expect.any(String));
      const args = props.update.mock.calls[0];
      expect(args[1]).not.toBe("mterminal");
    }
  });

  it("UI font size slider reflects value and emits update", () => {
    const props = makeProps({ settings: { ...DEFAULT_SETTINGS, uiFontSize: 13 } });
    render(<SettingsModal {...props} />);
    expect(screen.getByText(/13px/)).toBeTruthy();
    const sliders = document.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(sliders[0], { target: { value: "15" } });
    expect(props.update).toHaveBeenCalledWith("uiFontSize", 15);
  });

  it("Window opacity slider reflects value and emits update", () => {
    const props = makeProps({ settings: { ...DEFAULT_SETTINGS, windowOpacity: 1 } });
    render(<SettingsModal {...props} />);
    
    expect(screen.getByText(/100%/)).toBeTruthy();
    const sliders = document.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[1], { target: { value: "0.8" } });
    expect(props.update).toHaveBeenCalledWith("windowOpacity", 0.8);
  });
});

describe("SettingsModal — Terminal fields", () => {
  function renderTerminal(over?: Partial<Settings>) {
    const props = makeProps({ settings: { ...DEFAULT_SETTINGS, ...over } });
    render(<SettingsModal {...props} />);
    gotoSection(/^Terminal$/);
    return props;
  }

  it("font family input reflects setting and emits update on change", () => {
    const props = renderTerminal({ fontFamily: "Monaco" });
    const input = screen.getByDisplayValue("Monaco") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Fira Code" } });
    expect(props.update).toHaveBeenCalledWith("fontFamily", "Fira Code");
  });

  it("font size slider emits numeric update", () => {
    const props = renderTerminal({ fontSize: 13 });
    expect(screen.getByText(/13px/)).toBeTruthy();
    const sliders = document.querySelectorAll('input[type="range"]');
    
    fireEvent.change(sliders[0], { target: { value: "16" } });
    expect(props.update).toHaveBeenCalledWith("fontSize", 16);
  });

  it("line height slider emits float update", () => {
    const props = renderTerminal({ lineHeight: 1.25 });
    const sliders = document.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[1], { target: { value: "1.5" } });
    expect(props.update).toHaveBeenCalledWith("lineHeight", 1.5);
  });

  it.each([
    ["block", "block"],
    ["bar", "bar"],
    ["underline", "underline"],
  ])("cursor style %s button emits update", (label, value) => {
    const props = renderTerminal({ cursorStyle: "bar" });
    const btn = screen.getByRole("button", { name: new RegExp(`^${label}$`) });
    fireEvent.click(btn);
    expect(props.update).toHaveBeenCalledWith("cursorStyle", value);
  });

  it("cursor style active button reflects current setting", () => {
    renderTerminal({ cursorStyle: "block" });
    const btn = screen.getByRole("button", { name: /^block$/ });
    expect(btn.className).toContain("active");
  });

  it("cursor blink toggle emits inverted update", () => {
    const props = renderTerminal({ cursorBlink: true });
    const toggles = screen.getAllByRole("switch");
    fireEvent.click(toggles[0]);
    expect(props.update).toHaveBeenCalledWith("cursorBlink", false);
  });

  it("scrollback input emits clamped numeric update", () => {
    const props = renderTerminal({ scrollback: 5000 });
    const input = screen.getByDisplayValue("5000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "8000" } });
    expect(props.update).toHaveBeenCalledWith("scrollback", 8000);
  });

  it("scrollback clamps to 100000 when too large", () => {
    const props = renderTerminal({ scrollback: 5000 });
    const input = screen.getByDisplayValue("5000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "999999" } });
    expect(props.update).toHaveBeenCalledWith("scrollback", 100000);
  });

  it("scrollback clamps negative to 0", () => {
    const props = renderTerminal({ scrollback: 5000 });
    const input = screen.getByDisplayValue("5000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-50" } });
    expect(props.update).toHaveBeenCalledWith("scrollback", 0);
  });
});

describe("SettingsModal — Shell fields", () => {
  it("shell override input emits update", () => {
    const props = makeProps({ settings: { ...DEFAULT_SETTINGS, shellOverride: "" } });
    render(<SettingsModal {...props} />);
    gotoSection(/^Shell$/);
    const inputs = document.querySelectorAll('.settings-body input[type="text"]');
    fireEvent.change(inputs[0], { target: { value: "/bin/zsh" } });
    expect(props.update).toHaveBeenCalledWith("shellOverride", "/bin/zsh");
  });

  it("shell args input emits update", () => {
    const props = makeProps({ settings: { ...DEFAULT_SETTINGS, shellArgs: "" } });
    render(<SettingsModal {...props} />);
    gotoSection(/^Shell$/);
    const inputs = document.querySelectorAll('.settings-body input[type="text"]');
    fireEvent.change(inputs[1], { target: { value: "-l" } });
    expect(props.update).toHaveBeenCalledWith("shellArgs", "-l");
  });
});

describe("SettingsModal — Behavior toggles", () => {
  it.each([
    ["confirmCloseMultipleTabs", 0, true],
    ["copyOnSelect", 1, false],
    ["showGreeting", 2, true],
  ] as const)("toggle %s emits inverted update", (key, idx, current) => {
    const props = makeProps({ settings: { ...DEFAULT_SETTINGS, [key]: current } as Settings });
    render(<SettingsModal {...props} />);
    gotoSection(/^Behavior$/);
    const toggles = screen.getAllByRole("switch");
    fireEvent.click(toggles[idx]);
    expect(props.update).toHaveBeenCalledWith(key, !current);
  });

  it("toggle aria-checked reflects current settings", () => {
    const props = makeProps({
      settings: {
        ...DEFAULT_SETTINGS,
        confirmCloseMultipleTabs: true,
        copyOnSelect: false,
        showGreeting: true,
      },
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^Behavior$/);
    const toggles = screen.getAllByRole("switch");
    expect(toggles[0].getAttribute("aria-checked")).toBe("true");
    expect(toggles[1].getAttribute("aria-checked")).toBe("false");
    expect(toggles[2].getAttribute("aria-checked")).toBe("true");
  });
});

describe("SettingsModal — AI section", () => {
  it("AI section renders only master switch when aiEnabled is false", () => {
    const props = makeProps({ settings: { ...DEFAULT_SETTINGS, aiEnabled: false } });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    expect(screen.getByText(/Enable AI/i)).toBeTruthy();
    
    expect(screen.queryByText(/Default provider/i)).toBeNull();
  });

  it("clicking master switch emits aiEnabled update", () => {
    const props = makeProps({ settings: { ...DEFAULT_SETTINGS, aiEnabled: false } });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    expect(props.update).toHaveBeenCalledWith("aiEnabled", true);
  });

  it("openai base URL input emits update", () => {
    const props = makeProps({
      settings: {
        ...DEFAULT_SETTINGS,
        aiEnabled: true,
        aiOpenaiBaseUrl: "https://api.openai.com/v1",
      },
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    const input = screen.getByDisplayValue("https://api.openai.com/v1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://example.com/v1" } });
    expect(props.update).toHaveBeenCalledWith("aiOpenaiBaseUrl", "https://example.com/v1");
  });

  it("ollama base URL input emits update", () => {
    const props = makeProps({
      settings: {
        ...DEFAULT_SETTINGS,
        aiEnabled: true,
        aiOllamaBaseUrl: "http://localhost:11434/v1",
      },
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    const input = screen.getByDisplayValue("http://localhost:11434/v1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "http://example.local/v1" } });
    expect(props.update).toHaveBeenCalledWith("aiOllamaBaseUrl", "http://example.local/v1");
  });

  it.each([
    ["aiAttachContext"],
    ["aiExplainEnabled"],
    ["claudeCodeDetectionEnabled"],
    ["mcpServerEnabled"],
  ] as const)("toggle %s in AI section emits inverted update", (key) => {
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true, [key]: false } as Settings,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    
    const toggles = screen.getAllByRole("switch");
    
    
    
    for (let i = 1; i < toggles.length; i++) {
      fireEvent.click(toggles[i]);
    }
    const calls = props.update.mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain(key);
  });

  it("vault badge appears when vault is locked, clicking calls onRequestVault", () => {
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: false,
      vaultExists: true,
    });
    const { container } = render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    const note = container.querySelector(".settings-note") as HTMLElement;
    expect(note.textContent).toMatch(/vault locked/i);
    fireEvent.click(note);
    expect(props.onRequestVault).toHaveBeenCalled();
  });

  it("vault badge says 'not initialised' when vaultExists is false", () => {
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: false,
      vaultExists: false,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    expect(screen.getByText(/vault not initialised/i)).toBeTruthy();
  });
});

describe("SettingsModal — AI key management", () => {
  it("provider block shows 'no key' when vault unlocked but no key saved", () => {
    hasKeyState.current = { anthropic: false, openai: false };
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    expect(screen.getAllByText(/no key/i).length).toBeGreaterThan(0);
  });

  it("provider block shows 'key saved' when hasKey is true", () => {
    hasKeyState.current = { anthropic: true, openai: false };
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    expect(screen.getAllByText(/key saved/i).length).toBeGreaterThan(0);
  });

  it("provider block shows 'vault locked' when vault is locked", () => {
    hasKeyState.current = {};
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: false,
      vaultExists: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    expect(screen.getAllByText(/vault locked/i).length).toBeGreaterThan(0);
  });

  it("clicking 'set key' opens input field and 'save' calls setKey with provider+key", async () => {
    hasKeyState.current = { anthropic: false, openai: false };
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    const setKeyBtns = screen.getAllByRole("button", { name: /^set key$/ });
    fireEvent.click(setKeyBtns[0]); // anthropic
    const input = screen.getByPlaceholderText(/paste API key/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-test-1234" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/ }));
    });
    expect(setKeyMock).toHaveBeenCalledWith("anthropic", "sk-test-1234");
  });

  it("save with empty key does not call setKey", async () => {
    hasKeyState.current = { anthropic: false };
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    const setKeyBtns = screen.getAllByRole("button", { name: /^set key$/ });
    fireEvent.click(setKeyBtns[0]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^save$/ }));
    });
    expect(setKeyMock).not.toHaveBeenCalled();
  });

  it("cancel button exits the key-edit state", () => {
    hasKeyState.current = { anthropic: false };
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    fireEvent.click(screen.getAllByRole("button", { name: /^set key$/ })[0]);
    expect(screen.queryByPlaceholderText(/paste API key/i)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/ }));
    expect(screen.queryByPlaceholderText(/paste API key/i)).toBeNull();
  });

  it("'remove key' button calls clearKey when key is set", () => {
    hasKeyState.current = { anthropic: true, openai: false };
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    const removeBtns = screen.getAllByRole("button", { name: /^remove key$/ });
    fireEvent.click(removeBtns[0]);
    expect(clearKeyMock).toHaveBeenCalledWith("anthropic");
  });

  it("set key button triggers vault unlock when vault is locked", () => {
    hasKeyState.current = {};
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: false,
      vaultExists: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    const btn = screen.getAllByRole("button", {
      name: /^unlock vault to set key$/,
    })[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(props.onRequestVault).toHaveBeenCalled();
  });

  it("ollama provider renders without key-management buttons", () => {
    hasKeyState.current = {};
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    
    expect(screen.getByText(/Ollama \(local\)/i)).toBeTruthy();
    
    const setKeyBtns = screen.queryAllByRole("button", { name: /^set key$/ });
    expect(setKeyBtns.length).toBe(2);
  });
});

describe("SettingsModal — list models", () => {
  it("clicking 'list models' invokes listModels and renders model buttons", async () => {
    listModelsMock.mockResolvedValueOnce([
      { id: "claude-opus-4-7", name: "Claude Opus 4.7" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
    ]);
    hasKeyState.current = { anthropic: true };
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    const listBtns = screen.getAllByRole("button", { name: /^list models$/ });
    await act(async () => {
      fireEvent.click(listBtns[0]);
    });
    expect(listModelsMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^claude-opus-4-7$/ })).toBeTruthy();
    });
  });

  it("clicking a listed model emits onModelChange via update", async () => {
    listModelsMock.mockResolvedValueOnce([{ id: "model-x", name: "X" }]);
    hasKeyState.current = { anthropic: true };
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /^list models$/ })[0]);
    });
    await waitFor(() => screen.getByRole("button", { name: /^model-x$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^model-x$/ }));
    expect(props.update).toHaveBeenCalledWith("aiAnthropicModel", "model-x");
  });

  it("shows error message when listModels rejects", async () => {
    listModelsMock.mockRejectedValueOnce(new Error("boom"));
    hasKeyState.current = { anthropic: true };
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true },
      vaultUnlocked: true,
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /^list models$/ })[0]);
    });
    await waitFor(() => {
      expect(screen.getByText(/failed to fetch models/i)).toBeTruthy();
    });
  });
});

describe("SettingsModal — MCP server status", () => {
  it("shows running socket info when mcpStatus.running is true", () => {
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true, mcpServerEnabled: true },
      mcpStatus: { running: true, socketPath: "/tmp/mt.sock" },
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    expect(screen.getAllByText(/\/tmp\/mt\.sock/).length).toBeGreaterThan(0);
    expect(screen.getByText(/add to claude code/i)).toBeTruthy();
  });

  it("shows starting message when mcp not yet running", () => {
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true, mcpServerEnabled: true },
      mcpStatus: { running: false, socketPath: null },
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    expect(screen.getByText(/starting MCP server/i)).toBeTruthy();
  });

  it("does not render mcp status block when mcpServerEnabled is false", () => {
    const props = makeProps({
      settings: { ...DEFAULT_SETTINGS, aiEnabled: true, mcpServerEnabled: false },
      mcpStatus: { running: true, socketPath: "/tmp/mt.sock" },
    });
    render(<SettingsModal {...props} />);
    gotoSection(/^AI$/);
    expect(screen.queryAllByText(/\/tmp\/mt\.sock/)).toHaveLength(0);
  });
});

describe("SettingsModal — reset & close", () => {
  it("'reset all' button calls reset", () => {
    const props = makeProps();
    render(<SettingsModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /reset all/i }));
    expect(props.reset).toHaveBeenCalled();
  });

  it("close (×) button calls onClose", () => {
    const props = makeProps();
    render(<SettingsModal {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("Escape key calls onClose", () => {
    const props = makeProps();
    render(<SettingsModal {...props} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("clicking the overlay (mousedown+mouseup on overlay) calls onClose", () => {
    const props = makeProps();
    const { container } = render(<SettingsModal {...props} />);
    const overlay = container.querySelector(".settings-overlay") as HTMLElement;
    fireEvent.mouseDown(overlay, { target: overlay });
    fireEvent.mouseUp(overlay, { target: overlay });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("clicking inside the dialog does NOT call onClose", () => {
    const props = makeProps();
    const { container } = render(<SettingsModal {...props} />);
    const dialog = container.querySelector(".settings-dialog") as HTMLElement;
    fireEvent.mouseDown(dialog);
    fireEvent.mouseUp(dialog);
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
