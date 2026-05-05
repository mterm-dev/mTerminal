// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { Clock } from "../../src/components/Clock";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Clock", () => {
  it("renders an HH:MM:SS string in 24-hour format", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T13:45:07Z"));
    const { container } = render(<Clock />);
    const span = container.querySelector("span") as HTMLSpanElement;
    expect(span).not.toBeNull();
    expect(span.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("updates roughly every 1000ms", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T13:45:07Z"));
    const { container } = render(<Clock />);
    const span = container.querySelector("span") as HTMLSpanElement;
    const initial = span.textContent;
    expect(initial).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    
    
    act(() => {
      vi.setSystemTime(new Date("2026-05-05T13:45:08Z"));
      vi.advanceTimersByTime(1000);
    });
    const after = span.textContent;
    expect(after).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(after).not.toBe(initial);
  });

  it("cleans up the interval on unmount (no throw when advancing timers later)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T13:45:07Z"));
    const { unmount } = render(<Clock />);
    unmount();
    expect(() => {
      vi.advanceTimersByTime(5000);
    }).not.toThrow();
  });
});
