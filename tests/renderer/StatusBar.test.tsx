// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";


vi.mock("../../src/components/Clock", () => ({
  Clock: () => <span data-testid="clock-stub">12:34:56</span>,
}));

import { StatusBar } from "../../src/components/StatusBar";

beforeEach(() => {
  delete (window as unknown as { __MT_HOME?: string }).__MT_HOME;
});

afterEach(() => {
  cleanup();
});

describe("StatusBar", () => {
  it("renders activeLabel uppercased and tab/group counts", () => {
    render(
      <StatusBar
        activeLabel="shell"
        tabCount={3}
        groupCount={1}
      />,
    );
    expect(screen.getByText("SHELL")).toBeTruthy();
    expect(screen.getByText(/3 tabs · 1 group/)).toBeTruthy();
    expect(screen.getByText("UTF-8")).toBeTruthy();
    expect(screen.getByTestId("clock-stub")).toBeTruthy();
  });

  it("singularizes 'tab' and 'group' when count is 1", () => {
    render(<StatusBar activeLabel="x" tabCount={1} groupCount={1} />);
    expect(screen.getByText(/1 tab · 1 group/)).toBeTruthy();
  });

  it("renders cwd shortened with ~ when matching __MT_HOME", () => {
    (window as unknown as { __MT_HOME?: string }).__MT_HOME = "/home/u";
    render(
      <StatusBar activeLabel="x" tabCount={1} groupCount={0} cwd="/home/u/projects/foo" />,
    );
    expect(screen.getByText("~/projects/foo")).toBeTruthy();
  });

  it("renders raw cwd when no __MT_HOME and short path", () => {
    render(<StatusBar activeLabel="x" tabCount={1} groupCount={0} cwd="/etc" />);
    expect(screen.getByText("/etc")).toBeTruthy();
  });

  it("collapses long cwd to last 3 segments", () => {
    render(
      <StatusBar
        activeLabel="x"
        tabCount={1}
        groupCount={0}
        cwd="/very/long/absolute/path/that/exceeds/forty/characters/here"
      />,
    );
    expect(screen.getByText("/forty/characters/here")).toBeTruthy();
  });

  it("does not render cmd seg when not provided", () => {
    const { container } = render(
      <StatusBar activeLabel="shell" tabCount={1} groupCount={0} />,
    );
    
    expect(container.textContent).not.toContain("vim");
  });

  it("renders cmd seg when provided", () => {
    render(<StatusBar activeLabel="x" tabCount={1} groupCount={0} cmd="vim" />);
    expect(screen.getByText("vim")).toBeTruthy();
  });

  it("renders aiUsage cost when there are tokens", () => {
    render(
      <StatusBar
        activeLabel="x"
        tabCount={1}
        groupCount={0}
        aiUsage={{ inTokens: 100, outTokens: 50, costUsd: 0.0123 }}
      />,
    );
    expect(screen.getByText(/\$0\.012/)).toBeTruthy();
  });

  it("hides aiUsage when both token counts are zero", () => {
    const { container } = render(
      <StatusBar
        activeLabel="x"
        tabCount={1}
        groupCount={0}
        aiUsage={{ inTokens: 0, outTokens: 0, costUsd: 0 }}
      />,
    );
    expect(container.querySelector(".ai-usage")).toBeNull();
  });

  it("hides aiUsage when prop omitted", () => {
    const { container } = render(
      <StatusBar activeLabel="x" tabCount={1} groupCount={0} />,
    );
    expect(container.querySelector(".ai-usage")).toBeNull();
  });
});
