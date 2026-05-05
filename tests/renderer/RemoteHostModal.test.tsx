// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import type { HostMeta } from "../../src/hooks/useRemoteHosts";

const mocks = vi.hoisted(() => ({
  openDialog: vi.fn(),
  listSshKeys: vi.fn(),
  getToolAvailability: vi.fn(),
}));

vi.mock("../../src/lib/tauri-shim", () => ({
  open: mocks.openDialog,
}));

vi.mock("../../src/hooks/useRemoteHosts", async () => {
  
  return {
    listSshKeys: mocks.listSshKeys,
    getToolAvailability: mocks.getToolAvailability,
  };
});

import { RemoteHostModal } from "../../src/components/RemoteHostModal";

function installLocalStoragePolyfill(): void {
  const store: Record<string, string> = {};
  const polyfill = {
    getItem: (k: string) =>
      Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: polyfill,
  });
}

beforeEach(() => {
  installLocalStoragePolyfill();
  mocks.openDialog.mockReset();
  mocks.listSshKeys.mockReset();
  mocks.getToolAvailability.mockReset();
  mocks.listSshKeys.mockResolvedValue([]);
  mocks.getToolAvailability.mockResolvedValue({ sshpass: true });
});

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {}
});


async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderModal(props: Partial<React.ComponentProps<typeof RemoteHostModal>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onRequestUnlock = props.onRequestUnlock ?? vi.fn();
  const utils = render(
    <RemoteHostModal
      initial={props.initial ?? null}
      vaultUnlocked={props.vaultUnlocked ?? true}
      onClose={onClose}
      onSubmit={onSubmit}
      onRequestUnlock={onRequestUnlock}
    />,
  );
  return { ...utils, onClose, onSubmit, onRequestUnlock };
}

describe("RemoteHostModal - create mode", () => {
  it("1. renders empty fields, port=22, auth=key, title 'new ssh host'", async () => {
    renderModal();
    await flush();
    expect(screen.getByText("new ssh host")).toBeTruthy();
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    
    expect(inputs[0].value).toBe("");
    const portInput = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(portInput.value).toBe("22");
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    const keyRadio = radios.find((r) => r.parentElement?.textContent === "key")!;
    expect(keyRadio.checked).toBe(true);
    
    expect(screen.getByText("add")).toBeTruthy();
  });
});

describe("RemoteHostModal - edit mode", () => {
  it("2. populates fields from initial, title says 'edit ssh host'", async () => {
    const initial: HostMeta = {
      id: "h1",
      name: "my host",
      host: "vps.example.com",
      port: 2222,
      user: "root",
      auth: "agent",
      identityPath: "",
      savePassword: false,
    };
    renderModal({ initial });
    await flush();
    expect(screen.getByText("edit ssh host")).toBeTruthy();
    expect(
      (screen.getByPlaceholderText("vps.example.com") as HTMLInputElement).value,
    ).toBe("vps.example.com");
    expect(
      (screen.getByPlaceholderText("root") as HTMLInputElement).value,
    ).toBe("root");
    const portInput = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    expect(portInput.value).toBe("2222");
    expect(screen.getByText("save")).toBeTruthy();
  });
});

describe("RemoteHostModal - validation", () => {
  it("3. submit with empty host shows 'host is required'", async () => {
    const { onSubmit } = renderModal();
    await flush();
    fireEvent.click(screen.getByText("add"));
    await flush();
    expect(screen.getByText("host is required")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("4. submit with empty user shows 'user is required'", async () => {
    const { onSubmit } = renderModal();
    await flush();
    const hostInput = screen.getByPlaceholderText("vps.example.com");
    fireEvent.change(hostInput, { target: { value: "h.example.com" } });
    fireEvent.click(screen.getByText("add"));
    await flush();
    expect(screen.getByText("user is required")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("5. key auth without identityPath shows error", async () => {
    const { onSubmit } = renderModal();
    await flush();
    fireEvent.change(screen.getByPlaceholderText("vps.example.com"), {
      target: { value: "h" },
    });
    fireEvent.change(screen.getByPlaceholderText("root"), {
      target: { value: "u" },
    });
    fireEvent.click(screen.getByText("add"));
    await flush();
    expect(
      screen.getByText("pick an identity file (or switch to agent auth)"),
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("RemoteHostModal - auth radio toggling", () => {
  it("6. switching to password shows save-password toggle", async () => {
    renderModal();
    await flush();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    const pw = radios.find((r) => r.parentElement?.textContent === "password")!;
    fireEvent.click(pw);
    await flush();
    expect(
      screen.getByText("save password (encrypted with master password)"),
    ).toBeTruthy();
  });

  it("7. switching to agent hides identity picker and password fields", async () => {
    renderModal();
    await flush();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    const agent = radios.find((r) => r.parentElement?.textContent === "agent")!;
    fireEvent.click(agent);
    await flush();
    expect(screen.queryByText("identity file")).toBeNull();
    expect(
      screen.queryByText("save password (encrypted with master password)"),
    ).toBeNull();
    expect(screen.getByText(/uses your running ssh-agent/)).toBeTruthy();
  });

  it("8. password field appears when password+savePassword on", async () => {
    renderModal();
    await flush();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    fireEvent.click(
      radios.find((r) => r.parentElement?.textContent === "password")!,
    );
    await flush();
    
    const pwInput = document.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    expect(pwInput).toBeTruthy();

    
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    fireEvent.click(checkboxes[0]);
    await flush();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});

describe("RemoteHostModal - sshpass tool warning", () => {
  it("9. password auth + sshpass missing renders warning", async () => {
    mocks.getToolAvailability.mockResolvedValue({ sshpass: false });
    renderModal();
    await flush();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    fireEvent.click(
      radios.find((r) => r.parentElement?.textContent === "password")!,
    );
    await flush();
    expect(screen.getByText(/sshpass not found on PATH/)).toBeTruthy();
  });
});

describe("RemoteHostModal - identity picker", () => {
  it("10. lists ssh keys from listSshKeys()", async () => {
    mocks.listSshKeys.mockResolvedValue([
      { path: "/home/u/.ssh/id_ed25519", name: "id_ed25519", keyType: "ed25519" },
      { path: "/home/u/.ssh/id_rsa", name: "id_rsa", keyType: "rsa" },
    ]);
    renderModal();
    await flush();
    expect(screen.getByText("id_ed25519 (ed25519)")).toBeTruthy();
    expect(screen.getByText("id_rsa (rsa)")).toBeTruthy();
  });

  it("11. clicking 'browse...' triggers openDialog and updates identityPath", async () => {
    mocks.openDialog.mockResolvedValue("/picked/key");
    renderModal();
    await flush();
    fireEvent.click(screen.getByText("browse..."));
    await flush();
    expect(mocks.openDialog).toHaveBeenCalled();
    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("/picked/key");
  });
});

describe("RemoteHostModal - submit", () => {
  it("12. valid agent submit calls onSubmit with sanitized meta and closes", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ onSubmit, onClose });
    await flush();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    fireEvent.click(
      radios.find((r) => r.parentElement?.textContent === "agent")!,
    );
    fireEvent.change(screen.getByPlaceholderText("vps.example.com"), {
      target: { value: "h.example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("root"), {
      target: { value: "alice" },
    });
    await flush();
    fireEvent.click(screen.getByText("add"));
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [meta, pw] = onSubmit.mock.calls[0];
    expect(meta.host).toBe("h.example.com");
    expect(meta.user).toBe("alice");
    expect(meta.auth).toBe("agent");
    expect(meta.name).toBe("alice@h.example.com"); // fallback name
    expect(meta.identityPath).toBeUndefined();
    expect(meta.savePassword).toBe(false);
    expect(pw).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
  });

  it("13. password submit forwards password when savePassword=true", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderModal({ onSubmit, vaultUnlocked: true });
    await flush();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    fireEvent.click(
      radios.find((r) => r.parentElement?.textContent === "password")!,
    );
    fireEvent.change(screen.getByPlaceholderText("vps.example.com"), {
      target: { value: "h" },
    });
    fireEvent.change(screen.getByPlaceholderText("root"), {
      target: { value: "u" },
    });
    const pwInput = document.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    fireEvent.change(pwInput, { target: { value: "secret" } });
    await flush();
    fireEvent.click(screen.getByText("add"));
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1]).toBe("secret");
  });

  it("14. password+savePassword while vault locked → calls onRequestUnlock and skips onSubmit", async () => {
    const onSubmit = vi.fn();
    const onRequestUnlock = vi.fn();
    renderModal({ onSubmit, onRequestUnlock, vaultUnlocked: false });
    await flush();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    fireEvent.click(
      radios.find((r) => r.parentElement?.textContent === "password")!,
    );
    fireEvent.change(screen.getByPlaceholderText("vps.example.com"), {
      target: { value: "h" },
    });
    fireEvent.change(screen.getByPlaceholderText("root"), {
      target: { value: "u" },
    });
    await flush();
    fireEvent.click(screen.getByText("add"));
    await flush();
    expect(onRequestUnlock).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("15. create+savePassword with no password shows error", async () => {
    const onSubmit = vi.fn();
    renderModal({ onSubmit, vaultUnlocked: true });
    await flush();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    fireEvent.click(
      radios.find((r) => r.parentElement?.textContent === "password")!,
    );
    fireEvent.change(screen.getByPlaceholderText("vps.example.com"), {
      target: { value: "h" },
    });
    fireEvent.change(screen.getByPlaceholderText("root"), {
      target: { value: "u" },
    });
    await flush();
    fireEvent.click(screen.getByText("add"));
    await flush();
    expect(
      screen.getByText("enter the password to save, or uncheck 'save password'"),
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("RemoteHostModal - close paths", () => {
  it("16. cancel button calls onClose", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await flush();
    fireEvent.click(screen.getByText("cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("17. Escape key calls onClose", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await flush();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("18. overlay click (mousedown on overlay itself) calls onClose", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await flush();
    const overlay = document.querySelector(".settings-overlay") as HTMLElement;
    
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});
