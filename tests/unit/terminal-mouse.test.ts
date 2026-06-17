import { describe, it, expect } from "vitest";
import { isMouseTrackingDecset } from "../../src/lib/terminal-mouse";

describe("isMouseTrackingDecset", () => {
  it("matches single mouse-tracking modes", () => {
    for (const mode of [9, 1000, 1001, 1002, 1003, 1005, 1006, 1015, 1016]) {
      expect(isMouseTrackingDecset([mode])).toBe(true);
    }
  });

  it("matches a batched all-mouse sequence (e.g. ?1000;1002;1003;1006h)", () => {
    expect(isMouseTrackingDecset([1000, 1002, 1003, 1006])).toBe(true);
  });

  it("does not match non-mouse modes", () => {
    expect(isMouseTrackingDecset([25])).toBe(false); // cursor visibility
    expect(isMouseTrackingDecset([1049])).toBe(false); // alt screen
    expect(isMouseTrackingDecset([2004])).toBe(false); // bracketed paste
    expect(isMouseTrackingDecset([1004])).toBe(false); // focus reporting
  });

  it("does not match when a non-mouse mode is mixed in (avoids swallowing cursor/alt-screen state)", () => {
    expect(isMouseTrackingDecset([25, 1002])).toBe(false);
    expect(isMouseTrackingDecset([1002, 1049])).toBe(false);
  });

  it("does not match empty params or subparam arrays", () => {
    expect(isMouseTrackingDecset([])).toBe(false);
    expect(isMouseTrackingDecset([[1002, 1]])).toBe(false);
  });
});
