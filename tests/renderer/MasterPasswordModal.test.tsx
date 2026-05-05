// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MasterPasswordModal } from "../../src/components/MasterPasswordModal";

afterEach(() => {
  cleanup();
});

function getInputByLabel(labelText: string): HTMLInputElement {
  const labels = Array.from(document.querySelectorAll("label"));
  const label = labels.find((l) => l.textContent === labelText);
  if (!label) throw new Error(`label "${labelText}" not found`);
  
  const field = label.parentElement;
  const input = field?.querySelector("input.settings-input") as HTMLInputElement | null;
  if (!input) throw new Error(`input for label "${labelText}" not found`);
  return input;
}

describe("MasterPasswordModal - init mode", () => {
  it("renders title, hint, and fields", () => {
    render(
      <MasterPasswordModal
        mode="init"
        onClose={vi.fn()}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText("set master password")).toBeTruthy();
    expect(getInputByLabel("master password")).toBeTruthy();
    expect(getInputByLabel("confirm password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "cancel" })).toBeTruthy();
  });

  it("empty password shows validation error and does not call onInit", async () => {
    const onInit = vi.fn(async () => {});
    render(
      <MasterPasswordModal
        mode="init"
        onClose={vi.fn()}
        onInit={onInit}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(screen.getByText("master password is required")).toBeTruthy();
    });
    expect(onInit).not.toHaveBeenCalled();
  });

  it("password shorter than 8 shows length error", async () => {
    const onInit = vi.fn(async () => {});
    render(
      <MasterPasswordModal
        mode="init"
        onClose={vi.fn()}
        onInit={onInit}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    fireEvent.change(getInputByLabel("master password"), {
      target: { value: "short" },
    });
    fireEvent.change(getInputByLabel("confirm password"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(
        screen.getByText("master password must be at least 8 characters"),
      ).toBeTruthy();
    });
    expect(onInit).not.toHaveBeenCalled();
  });

  it("mismatched confirmation shows error", async () => {
    const onInit = vi.fn(async () => {});
    render(
      <MasterPasswordModal
        mode="init"
        onClose={vi.fn()}
        onInit={onInit}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    fireEvent.change(getInputByLabel("master password"), {
      target: { value: "longenough" },
    });
    fireEvent.change(getInputByLabel("confirm password"), {
      target: { value: "different1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(screen.getByText("passwords do not match")).toBeTruthy();
    });
    expect(onInit).not.toHaveBeenCalled();
  });

  it("valid submit calls onInit with the password and onClose", async () => {
    const onInit = vi.fn(async () => {});
    const onClose = vi.fn();
    render(
      <MasterPasswordModal
        mode="init"
        onClose={onClose}
        onInit={onInit}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    fireEvent.change(getInputByLabel("master password"), {
      target: { value: "longenough" },
    });
    fireEvent.change(getInputByLabel("confirm password"), {
      target: { value: "longenough" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(onInit).toHaveBeenCalledWith("longenough");
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe("MasterPasswordModal - unlock mode", () => {
  it("renders unlock title and a single password field", () => {
    render(
      <MasterPasswordModal
        mode="unlock"
        onClose={vi.fn()}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText("unlock vault")).toBeTruthy();
    expect(getInputByLabel("master password")).toBeTruthy();
    
    expect(() => getInputByLabel("confirm password")).toThrow();
    expect(screen.getByRole("button", { name: "unlock" })).toBeTruthy();
  });

  it("Enter on the password input submits", async () => {
    const onUnlock = vi.fn(async () => {});
    const onClose = vi.fn();
    render(
      <MasterPasswordModal
        mode="unlock"
        onClose={onClose}
        onInit={vi.fn(async () => {})}
        onUnlock={onUnlock}
      />,
    );
    const pw = getInputByLabel("master password");
    fireEvent.change(pw, { target: { value: "secret123" } });
    fireEvent.keyDown(pw, { key: "Enter" });
    await waitFor(() => {
      expect(onUnlock).toHaveBeenCalledWith("secret123");
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("propagates async failure as error string", async () => {
    const onUnlock = vi.fn(async () => {
      throw new Error("bad password");
    });
    render(
      <MasterPasswordModal
        mode="unlock"
        onClose={vi.fn()}
        onInit={vi.fn(async () => {})}
        onUnlock={onUnlock}
      />,
    );
    fireEvent.change(getInputByLabel("master password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "unlock" }));
    await waitFor(() => {
      expect(screen.getByText(/bad password/)).toBeTruthy();
    });
  });
});

describe("MasterPasswordModal - change mode", () => {
  it("renders three fields and change-specific labels", () => {
    render(
      <MasterPasswordModal
        mode="change"
        onClose={vi.fn()}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
        onChange={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText("change master password")).toBeTruthy();
    expect(getInputByLabel("current password")).toBeTruthy();
    expect(getInputByLabel("new password")).toBeTruthy();
    expect(getInputByLabel("confirm password")).toBeTruthy();
  });

  it("missing current password errors", async () => {
    const onChange = vi.fn(async () => {});
    render(
      <MasterPasswordModal
        mode="change"
        onClose={vi.fn()}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
        onChange={onChange}
      />,
    );
    fireEvent.change(getInputByLabel("new password"), {
      target: { value: "longenough" },
    });
    fireEvent.change(getInputByLabel("confirm password"), {
      target: { value: "longenough" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(screen.getByText("current password is required")).toBeTruthy();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("mismatched new passwords error", async () => {
    const onChange = vi.fn(async () => {});
    render(
      <MasterPasswordModal
        mode="change"
        onClose={vi.fn()}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
        onChange={onChange}
      />,
    );
    fireEvent.change(getInputByLabel("current password"), {
      target: { value: "oldpass" },
    });
    fireEvent.change(getInputByLabel("new password"), {
      target: { value: "longenough" },
    });
    fireEvent.change(getInputByLabel("confirm password"), {
      target: { value: "different1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(screen.getByText("new passwords do not match")).toBeTruthy();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("valid submit calls onChange(old, new)", async () => {
    const onChange = vi.fn(async () => {});
    const onClose = vi.fn();
    render(
      <MasterPasswordModal
        mode="change"
        onClose={onClose}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
        onChange={onChange}
      />,
    );
    fireEvent.change(getInputByLabel("current password"), {
      target: { value: "old-secret" },
    });
    fireEvent.change(getInputByLabel("new password"), {
      target: { value: "new-secret-1" },
    });
    fireEvent.change(getInputByLabel("confirm password"), {
      target: { value: "new-secret-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("old-secret", "new-secret-1");
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe("MasterPasswordModal - close behavior", () => {
  it("cancel button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <MasterPasswordModal
        mode="unlock"
        onClose={onClose}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("close (×) button calls onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <MasterPasswordModal
        mode="unlock"
        onClose={onClose}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    const closeBtn = container.querySelector(".settings-close") as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape on window calls onClose", () => {
    const onClose = vi.fn();
    render(
      <MasterPasswordModal
        mode="unlock"
        onClose={onClose}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the overlay closes; clicking inside does not", () => {
    const onClose = vi.fn();
    const { container } = render(
      <MasterPasswordModal
        mode="unlock"
        onClose={onClose}
        onInit={vi.fn(async () => {})}
        onUnlock={vi.fn(async () => {})}
      />,
    );
    const overlay = container.querySelector(".settings-overlay") as HTMLElement;
    const dialog = container.querySelector(".settings-dialog") as HTMLElement;
    
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
    
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});
