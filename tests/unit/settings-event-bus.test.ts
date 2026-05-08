import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetForTests,
  emitCoreChange,
  emitExtChange,
  onCoreChange,
  onExtChange,
} from "../../src/settings/event-bus";

afterEach(() => {
  _resetForTests();
});

describe("settings event bus", () => {
  it("notifies core subscribers on emitCoreChange", () => {
    const cb = vi.fn();
    onCoreChange(cb);
    emitCoreChange("themeId", "dark");
    expect(cb).toHaveBeenCalledWith("themeId", "dark");
  });

  it("notifies only the matching extension subscriber", () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    onExtChange("ext-a", cbA);
    onExtChange("ext-b", cbB);

    emitExtChange("ext-a", "x", 1);
    expect(cbA).toHaveBeenCalledWith("x", 1);
    expect(cbB).not.toHaveBeenCalled();
  });

  it("returns a disposer that unsubscribes", () => {
    const cb = vi.fn();
    const off = onCoreChange(cb);
    off();
    emitCoreChange("themeId", "dark");
    expect(cb).not.toHaveBeenCalled();
  });

  it("isolates subscriber failures", () => {
    const fail = vi.fn(() => {
      throw new Error("boom");
    });
    const ok = vi.fn();
    onCoreChange(fail);
    onCoreChange(ok);
    emitCoreChange("themeId", "v");
    expect(ok).toHaveBeenCalled();
  });

  it("disposing one ext subscriber doesn't affect others", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const off1 = onExtChange("ext-a", cb1);
    onExtChange("ext-a", cb2);
    off1();
    emitExtChange("ext-a", "k", "v");
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith("k", "v");
  });
});
