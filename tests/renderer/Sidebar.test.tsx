// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, createEvent } from "@testing-library/react";
import { Sidebar } from "../../src/components/Sidebar";
import type { Tab, Group } from "../../src/hooks/useWorkspace";
import type { CcStatus } from "../../src/hooks/useClaudeCodeStatus";

afterEach(() => {
  cleanup();
});



function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 1,
    label: "tab",
    groupId: null,
    autoLabel: true,
    kind: "local",
    ...overrides,
  } as Tab;
}

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: "g1",
    name: "group one",
    collapsed: false,
    accent: "orange",
    ...overrides,
  };
}

interface Handlers {
  setEditingTabId: ReturnType<typeof vi.fn>;
  setEditingGroupId: ReturnType<typeof vi.fn>;
  onSelectTab: ReturnType<typeof vi.fn>;
  onAddTab: ReturnType<typeof vi.fn>;
  onAddGroup: ReturnType<typeof vi.fn>;
  onToggleGroup: ReturnType<typeof vi.fn>;
  onRenameTab: ReturnType<typeof vi.fn>;
  onRenameGroup: ReturnType<typeof vi.fn>;
  onTabContextMenu: ReturnType<typeof vi.fn>;
  onGroupContextMenu: ReturnType<typeof vi.fn>;
  onReorderTab: ReturnType<typeof vi.fn>;
  onReorderGroup: ReturnType<typeof vi.fn>;
  onOpenSettings: ReturnType<typeof vi.fn>;
  onSelectGroup: ReturnType<typeof vi.fn>;
  onResize: ReturnType<typeof vi.fn>;
}

function makeHandlers(): Handlers {
  return {
    setEditingTabId: vi.fn(),
    setEditingGroupId: vi.fn(),
    onSelectTab: vi.fn(),
    onAddTab: vi.fn(),
    onAddGroup: vi.fn(),
    onToggleGroup: vi.fn(),
    onRenameTab: vi.fn(),
    onRenameGroup: vi.fn(),
    onTabContextMenu: vi.fn(),
    onGroupContextMenu: vi.fn(),
    onReorderTab: vi.fn(),
    onReorderGroup: vi.fn(),
    onOpenSettings: vi.fn(),
    onSelectGroup: vi.fn(),
    onResize: vi.fn(),
  };
}

function renderSidebar(opts: {
  tabs?: Tab[];
  groups?: Group[];
  activeId?: number | null;
  editingTabId?: number | null;
  editingGroupId?: string | null;
  activeGroupId?: string | null;
  ccStatuses?: Map<number, CcStatus>;
  handlers?: Partial<Handlers>;
} = {}) {
  const handlers = { ...makeHandlers(), ...(opts.handlers || {}) };
  const utils = render(
    <Sidebar
      tabs={opts.tabs ?? []}
      groups={opts.groups ?? []}
      activeId={opts.activeId ?? null}
      sessionLabel="user@host"
      editingTabId={opts.editingTabId ?? null}
      editingGroupId={opts.editingGroupId ?? null}
      setEditingTabId={handlers.setEditingTabId}
      setEditingGroupId={handlers.setEditingGroupId}
      onSelectTab={handlers.onSelectTab}
      onAddTab={handlers.onAddTab}
      onAddGroup={handlers.onAddGroup}
      onToggleGroup={handlers.onToggleGroup}
      onRenameTab={handlers.onRenameTab}
      onRenameGroup={handlers.onRenameGroup}
      onTabContextMenu={handlers.onTabContextMenu}
      onGroupContextMenu={handlers.onGroupContextMenu}
      onReorderTab={handlers.onReorderTab}
      onReorderGroup={handlers.onReorderGroup}
      onOpenSettings={handlers.onOpenSettings}
      activeGroupId={opts.activeGroupId ?? null}
      onSelectGroup={handlers.onSelectGroup}
      width={300}
      onResize={handlers.onResize}
      ccStatuses={opts.ccStatuses}
    />,
  );
  return { ...utils, handlers };
}


function makeDataTransfer(): DataTransfer {
  const data: Record<string, string> = {};
  return {
    dropEffect: "none",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: vi.fn(),
    getData: (k: string) => data[k] ?? "",
    setData: (k: string, v: string) => {
      data[k] = v;
    },
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}



describe("Sidebar - render", () => {
  it("1. empty tabs and groups renders header + ungrouped placeholder", () => {
    const { container } = renderSidebar();
    expect(screen.getByText("mTerminal")).toBeTruthy();
    expect(screen.getByText("local workspace")).toBeTruthy();
    
    expect(screen.getByText("ungrouped tabs")).toBeTruthy();
    
    expect(container.querySelectorAll("[data-tab-id]").length).toBe(0);
  });

  it("2. with two ungrouped tabs both render and active gets the active class + aria-selected", () => {
    const tabs = [
      makeTab({ id: 1, label: "alpha" }),
      makeTab({ id: 2, label: "beta" }),
    ];
    const { container } = renderSidebar({ tabs, activeId: 2 });
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    const t1 = container.querySelector('[data-tab-id="1"]')!;
    const t2 = container.querySelector('[data-tab-id="2"]')!;
    expect(t1.className).toContain("idle");
    expect(t2.className).toContain("active");
    expect(t2.getAttribute("aria-selected")).toBe("true");
    expect(t1.getAttribute("aria-selected")).toBe("false");
  });

  it("3. group with two tabs: group header + both tabs render under it", () => {
    const groups = [makeGroup({ id: "g1", name: "work" })];
    const tabs = [
      makeTab({ id: 1, label: "a", groupId: "g1" }),
      makeTab({ id: 2, label: "b", groupId: "g1" }),
    ];
    const { container } = renderSidebar({ tabs, groups });
    expect(screen.getByText("work")).toBeTruthy();
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
    
    const group = container.querySelector(".term-group")!;
    expect(group.querySelector(".term-group-count")!.textContent).toBe("2");
  });

  it("4. collapsed group hides its tabs", () => {
    const groups = [makeGroup({ id: "g1", name: "work", collapsed: true })];
    const tabs = [
      makeTab({ id: 1, label: "a", groupId: "g1" }),
      makeTab({ id: 2, label: "b", groupId: "g1" }),
    ];
    const { container } = renderSidebar({ tabs, groups });
    expect(screen.getByText("work")).toBeTruthy();
    
    expect(container.querySelectorAll("[data-tab-id]").length).toBe(0);
    expect(screen.queryByText("a")).toBeNull();
    expect(screen.queryByText("b")).toBeNull();
    
    const header = container.querySelector(".term-group-h")!;
    expect(header.getAttribute("aria-expanded")).toBe("false");
    const chevron = container.querySelector(".chevron")!;
    expect(chevron.className).toContain("collapsed");
  });

  it("5. group accent dot reflects accent prop via --group-accent CSS var", () => {
    const groups = [makeGroup({ id: "g1", name: "x", accent: "#bb9af7" })];
    const { container } = renderSidebar({ groups });
    const group = container.querySelector(".term-group") as HTMLElement;

    expect(group.style.getPropertyValue("--group-accent")).toBe("#bb9af7");
  });
});

describe("Sidebar - tab interactions", () => {
  it("6. clicking a tab calls onSelectTab(id)", () => {
    const tabs = [makeTab({ id: 7, label: "x" })];
    const { container, handlers } = renderSidebar({ tabs, activeId: null });
    const tab = container.querySelector('[data-tab-id="7"]') as HTMLElement;
    fireEvent.click(tab);
    expect(handlers.onSelectTab).toHaveBeenCalledWith(7);
  });

  it("7. right-click on a tab calls onTabContextMenu(id, x, y)", () => {
    const tabs = [makeTab({ id: 5, label: "x" })];
    const { container, handlers } = renderSidebar({ tabs });
    const tab = container.querySelector('[data-tab-id="5"]') as HTMLElement;
    fireEvent.contextMenu(tab, { clientX: 123, clientY: 456 });
    expect(handlers.onTabContextMenu).toHaveBeenCalledWith(5, 123, 456);
  });

  it("8. double-click a tab puts it in inline-edit mode (calls setEditingTabId)", () => {
    const tabs = [makeTab({ id: 9, label: "x" })];
    const { container, handlers } = renderSidebar({ tabs });
    const tab = container.querySelector('[data-tab-id="9"]') as HTMLElement;
    fireEvent.doubleClick(tab);
    expect(handlers.setEditingTabId).toHaveBeenCalledWith(9);
  });

  it("9. + tab button calls onAddTab() with no args (ungrouped)", () => {
    const { handlers } = renderSidebar();
    fireEvent.click(screen.getByTitle("new tab"));
    expect(handlers.onAddTab).toHaveBeenCalledTimes(1);
    expect(handlers.onAddTab).toHaveBeenCalledWith();
  });

  it("10. + group button calls onAddGroup", () => {
    const { handlers } = renderSidebar();
    fireEvent.click(screen.getByTitle("new group"));
    expect(handlers.onAddGroup).toHaveBeenCalledTimes(1);
  });

  it("11. + button on a group header calls onAddTab(groupId)", () => {
    const groups = [makeGroup({ id: "gX" })];
    const { handlers } = renderSidebar({ groups });
    fireEvent.click(screen.getByLabelText("new tab in group"));
    expect(handlers.onAddTab).toHaveBeenCalledWith("gX");
  });
});

describe("Sidebar - group interactions", () => {
  it("12. clicking a group header (not a button) calls onSelectGroup(id)", () => {
    const groups = [makeGroup({ id: "g1", name: "work" })];
    const { container, handlers } = renderSidebar({ groups });
    const header = container.querySelector(".term-group-h") as HTMLElement;
    
    const nameSpan = header.querySelector(".term-group-name") as HTMLElement;
    fireEvent.click(nameSpan);
    expect(handlers.onSelectGroup).toHaveBeenCalledWith("g1");
  });

  it("13. clicking the chevron toggles the group via onToggleGroup", () => {
    const groups = [makeGroup({ id: "g1" })];
    const { container, handlers } = renderSidebar({ groups });
    const chevron = container.querySelector(".chevron") as HTMLElement;
    fireEvent.click(chevron);
    expect(handlers.onToggleGroup).toHaveBeenCalledWith("g1");
  });

  it("14. right-click on group header calls onGroupContextMenu(id, x, y)", () => {
    const groups = [makeGroup({ id: "g1" })];
    const { container, handlers } = renderSidebar({ groups });
    const header = container.querySelector(".term-group-h") as HTMLElement;
    fireEvent.contextMenu(header, { clientX: 10, clientY: 20 });
    expect(handlers.onGroupContextMenu).toHaveBeenCalledWith("g1", 10, 20);
  });
});

describe("Sidebar - drag and drop", () => {
  it("15. drag a tab and drop on a sibling calls onReorderTab(id, beforeId, groupId)", () => {
    const tabs = [
      makeTab({ id: 1, label: "a" }),
      makeTab({ id: 2, label: "b" }),
      makeTab({ id: 3, label: "c" }),
    ];
    const { container, handlers } = renderSidebar({ tabs });
    const t3 = container.querySelector('[data-tab-id="3"]') as HTMLElement;
    const t1 = container.querySelector('[data-tab-id="1"]') as HTMLElement;
    const dt = makeDataTransfer();

    
    
    
    
    Object.defineProperty(t1, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          top: 0,
          height: 40,
          bottom: 40,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    fireEvent.dragStart(t3, { dataTransfer: dt });
    
    
    const overEvt = createEvent.dragOver(t1, { dataTransfer: dt });
    Object.defineProperty(overEvt, "clientY", { value: 5 });
    fireEvent(t1, overEvt);
    fireEvent.drop(t1, { dataTransfer: dt });

    expect(handlers.onReorderTab).toHaveBeenCalledWith(3, 1, null);
  });

  it("15b. dragOver lower half of a sibling marks 'before next', drop reorders accordingly", () => {
    const tabs = [
      makeTab({ id: 1, label: "a" }),
      makeTab({ id: 2, label: "b" }),
      makeTab({ id: 3, label: "c" }),
    ];
    const { container, handlers } = renderSidebar({ tabs });
    const t3 = container.querySelector('[data-tab-id="3"]') as HTMLElement;
    const t1 = container.querySelector('[data-tab-id="1"]') as HTMLElement;
    const dt = makeDataTransfer();

    fireEvent.dragStart(t3, { dataTransfer: dt });
    
    
    fireEvent.dragOver(t1, { dataTransfer: dt, clientY: 0 });
    fireEvent.drop(t1, { dataTransfer: dt });

    expect(handlers.onReorderTab).toHaveBeenCalledWith(3, 2, null);
  });

  it("16. drag a tab over a group header marks endOf(group); drop calls onReorderTab(id, null, groupId)", () => {
    const groups = [makeGroup({ id: "gA" })];
    const tabs = [
      makeTab({ id: 1, label: "a" }),
      makeTab({ id: 2, label: "b", groupId: "gA" }),
    ];
    const { container, handlers } = renderSidebar({ tabs, groups });
    const t1 = container.querySelector('[data-tab-id="1"]') as HTMLElement;
    const header = container.querySelector(".term-group-h") as HTMLElement;
    const dt = makeDataTransfer();

    fireEvent.dragStart(t1, { dataTransfer: dt });
    fireEvent.dragOver(header, { dataTransfer: dt });
    fireEvent.drop(header, { dataTransfer: dt });

    expect(handlers.onReorderTab).toHaveBeenCalledWith(1, null, "gA");
  });

  it("17. dragging a tab to the empty ungrouped section drops with groupId=null", () => {
    
    const groups = [makeGroup({ id: "gA" })];
    const tabs = [makeTab({ id: 5, label: "lone", groupId: "gA" })];
    const { container, handlers } = renderSidebar({ tabs, groups });
    const tab = container.querySelector('[data-tab-id="5"]') as HTMLElement;
    const ungrouped = container.querySelector(".term-ungrouped") as HTMLElement;
    const dt = makeDataTransfer();

    fireEvent.dragStart(tab, { dataTransfer: dt });
    fireEvent.dragOver(ungrouped, { dataTransfer: dt });
    fireEvent.drop(ungrouped, { dataTransfer: dt });

    expect(handlers.onReorderTab).toHaveBeenCalledWith(5, null, null);
  });

  it("17b. drag a group and drop on upper half of a sibling calls onReorderGroup(id, beforeId)", () => {
    const groups = [
      makeGroup({ id: "g1", name: "one" }),
      makeGroup({ id: "g2", name: "two" }),
      makeGroup({ id: "g3", name: "three" }),
    ];
    const { container, handlers } = renderSidebar({ groups });
    const source = container.querySelector(
      '[data-group-id="g3"] .term-group-h',
    ) as HTMLElement;
    const target = container.querySelector(
      '[data-group-id="g1"]',
    ) as HTMLElement;
    const dt = makeDataTransfer();

    Object.defineProperty(target, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          top: 0,
          height: 40,
          bottom: 40,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    fireEvent.dragStart(source, { dataTransfer: dt });
    const overEvt = createEvent.dragOver(target, { dataTransfer: dt });
    Object.defineProperty(overEvt, "clientY", { value: 5 });
    fireEvent(target, overEvt);
    fireEvent.drop(target, { dataTransfer: dt });

    expect(handlers.onReorderGroup).toHaveBeenCalledWith("g3", "g1");
  });

  it("17c. drag a group over lower half of the last group moves it to the end", () => {
    const groups = [
      makeGroup({ id: "g1", name: "one" }),
      makeGroup({ id: "g2", name: "two" }),
      makeGroup({ id: "g3", name: "three" }),
    ];
    const { container, handlers } = renderSidebar({ groups });
    const source = container.querySelector(
      '[data-group-id="g1"] .term-group-h',
    ) as HTMLElement;
    const target = container.querySelector(
      '[data-group-id="g3"]',
    ) as HTMLElement;
    const dt = makeDataTransfer();

    Object.defineProperty(target, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          top: 0,
          height: 40,
          bottom: 40,
          left: 0,
          right: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    fireEvent.dragStart(source, { dataTransfer: dt });
    const overEvt = createEvent.dragOver(target, { dataTransfer: dt });
    Object.defineProperty(overEvt, "clientY", { value: 35 });
    fireEvent(target, overEvt);
    fireEvent.drop(target, { dataTransfer: dt });

    expect(handlers.onReorderGroup).toHaveBeenCalledWith("g1", null);
  });
});

describe("Sidebar - claude code status", () => {
  it("18. tab with awaitingInput cc status renders cc-badge with awaitingInput class and '!' glyph", () => {
    const tabs = [makeTab({ id: 1, label: "x" })];
    const cc = new Map<number, CcStatus>([
      [
        1,
        {
          state: "awaitingInput",
          running: true,
          binary: "claude",
          lastActivityMs: 0,
        },
      ],
    ]);
    const { container } = renderSidebar({ tabs, ccStatuses: cc });
    const badge = container.querySelector(".cc-badge") as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.className).toContain("cc-awaitingInput");
    expect(badge.textContent).toBe("!");
    expect(badge.getAttribute("title")).toBe("claude code: awaitingInput");
  });

  it("19. tab with thinking cc status uses ◐ glyph", () => {
    const tabs = [makeTab({ id: 1, label: "x" })];
    const cc = new Map<number, CcStatus>([
      [
        1,
        { state: "thinking", running: true, binary: "claude", lastActivityMs: 0 },
      ],
    ]);
    const { container } = renderSidebar({ tabs, ccStatuses: cc });
    const badge = container.querySelector(".cc-badge")!;
    expect(badge.textContent).toBe("◐");
    expect(badge.className).toContain("cc-thinking");
  });

  it("20. tab without a ccStatus entry renders no cc-badge", () => {
    const tabs = [makeTab({ id: 1, label: "x" })];
    const { container } = renderSidebar({ tabs });
    expect(container.querySelector(".cc-badge")).toBeNull();
  });

  it("21. cc status with running=false renders no cc-badge", () => {
    const tabs = [makeTab({ id: 1, label: "x" })];
    const cc = new Map<number, CcStatus>([
      [
        1,
        { state: "idle", running: false, binary: null, lastActivityMs: null },
      ],
    ]);
    const { container } = renderSidebar({ tabs, ccStatuses: cc });
    expect(container.querySelector(".cc-badge")).toBeNull();
  });
});

describe("Sidebar - sub label and inline edit", () => {
  it("22. tab with `sub` different from label renders both", () => {
    const tabs = [makeTab({ id: 1, label: "primary", sub: "secondary" })];
    const { container } = renderSidebar({ tabs });
    expect(screen.getByText("primary")).toBeTruthy();
    const sub = container.querySelector(".label-sub") as HTMLElement;
    expect(sub).toBeTruthy();
    expect(sub.textContent).toBe("secondary");
    expect(sub.getAttribute("title")).toBe("secondary");
  });

  it("23. tab with sub==label hides the sub line", () => {
    const tabs = [makeTab({ id: 1, label: "same", sub: "same" })];
    const { container } = renderSidebar({ tabs });
    expect(container.querySelector(".label-sub")).toBeNull();
  });

  it("24. when editingTabId === tab.id, the InlineEdit renders an input pre-filled with the label", () => {
    const tabs = [makeTab({ id: 1, label: "name" })];
    const { container } = renderSidebar({ tabs, editingTabId: 1 });
    const input = container.querySelector("input.inline-edit") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("name");
    
    const tab = container.querySelector('[data-tab-id="1"]') as HTMLElement;
    expect(tab.getAttribute("draggable")).toBe("false");
  });

  it("25. when editingGroupId === group.id, the group-name InlineEdit renders an input", () => {
    const groups = [makeGroup({ id: "g1", name: "old" })];
    const { container } = renderSidebar({ groups, editingGroupId: "g1" });
    const groupInput = container.querySelector(
      ".term-group-name input.inline-edit",
    ) as HTMLInputElement;
    expect(groupInput).toBeTruthy();
    expect(groupInput.value).toBe("old");
  });
});

describe("Sidebar - settings footer", () => {
  it("28. clicking the Settings button calls onOpenSettings", () => {
    const { handlers } = renderSidebar();
    fireEvent.click(screen.getByText("Settings"));
    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
