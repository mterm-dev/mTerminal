// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkspace } from "../../src/hooks/useWorkspace";
import { DEFAULT_ACCENTS } from "../../src/utils/accent";

const STORAGE_KEY = "mterminal:workspace:v2";
const LEGACY_STORAGE_KEY = "mterminal:workspace:v1";



function installLocalStoragePolyfill(): void {
  const store: Record<string, string> = {};
  const polyfill = {
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string): void {
      store[key] = String(value);
    },
    removeItem(key: string): void {
      delete store[key];
    },
    clear(): void {
      for (const k of Object.keys(store)) delete store[k];
    },
    key(i: number): string | null {
      return Object.keys(store)[i] ?? null;
    },
    get length(): number {
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
  delete (window as unknown as { __MT_HOME?: string }).__MT_HOME;
});

afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {}
  delete (window as unknown as { __MT_HOME?: string }).__MT_HOME;
});

describe("useWorkspace - initial state", () => {
  it("1. empty localStorage yields one default 'shell' tab", () => {
    const { result } = renderHook(() => useWorkspace());
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].label).toBe("shell");
    expect(result.current.tabs[0].kind).toBe("local");
    expect(result.current.tabs[0].groupId).toBeNull();
    expect(result.current.groups).toEqual([]);
    expect(result.current.activeId).toBe(result.current.tabs[0].id);
  });

  it("2. migrates v1 payload to v2 key", () => {
    const seed = {
      tabs: [
        { id: 1, label: "x", groupId: null, autoLabel: true, kind: "local" },
      ],
      groups: [],
      activeId: 1,
      nextTabId: 2,
    };
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(seed));
    const { result } = renderHook(() => useWorkspace());
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].id).toBe(1);
    expect(result.current.tabs[0].label).toBe("x");
    expect(result.current.activeId).toBe(1);
  });

  it("3. corrupted JSON falls back to fresh state", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json{{{");
    expect(() => renderHook(() => useWorkspace())).not.toThrow();
    const { result } = renderHook(() => useWorkspace());
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].label).toBe("shell");
  });

  it("4. invalid groupId is normalized to null", () => {
    const seed = {
      tabs: [
        { id: 1, label: "a", groupId: "g1", autoLabel: true, kind: "local" },
        { id: 2, label: "b", groupId: "g2", autoLabel: true, kind: "local" },
        { id: 3, label: "c", groupId: "ghost", autoLabel: true, kind: "local" },
      ],
      groups: [
        { id: "g1", name: "one", collapsed: false, accent: "orange" },
        { id: "g2", name: "two", collapsed: false, accent: "blue" },
      ],
      activeId: 1,
      nextTabId: 4,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    const { result } = renderHook(() => useWorkspace());
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.tabs).toHaveLength(3);
    expect(result.current.tabs[0].groupId).toBe("g1");
    expect(result.current.tabs[1].groupId).toBe("g2");
    expect(result.current.tabs[2].groupId).toBeNull();
  });

  it("5. remote tab seed has groupId forced to null", () => {
    const seed = {
      tabs: [
        {
          id: 1,
          label: "ssh",
          groupId: "g1",
          autoLabel: false,
          kind: "remote",
          remoteHostId: "h1",
        },
      ],
      groups: [
        { id: "g1", name: "one", collapsed: false, accent: "orange" },
      ],
      activeId: 1,
      nextTabId: 2,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    const { result } = renderHook(() => useWorkspace());
    expect(result.current.tabs[0].kind).toBe("remote");
    expect(result.current.tabs[0].groupId).toBeNull();
    expect(result.current.tabs[0].remoteHostId).toBe("h1");
  });
});

describe("useWorkspace - addTab", () => {
  it("6. adds local tab, increments nextTabId, sets active, autoLabel=true", () => {
    const { result } = renderHook(() => useWorkspace());
    const initialNext = result.current.nextTabId;
    let createdId = -1;
    act(() => {
      createdId = result.current.addTab();
    });
    expect(createdId).toBe(initialNext);
    expect(result.current.tabs).toHaveLength(2);
    const created = result.current.tabs.find((t) => t.id === createdId)!;
    expect(created.kind).toBe("local");
    expect(created.autoLabel).toBe(true);
    expect(created.label).toBe("shell");
    expect(result.current.activeId).toBe(createdId);
    expect(result.current.nextTabId).toBe(initialNext + 1);
  });

  it("7. with active tab in group X, new tab joins group X", () => {
    const { result } = renderHook(() => useWorkspace());
    const firstId = result.current.tabs[0].id;
    act(() => {
      result.current.addGroup("g");
    });
    const gid = result.current.groups[0].id;
    act(() => {
      result.current.moveTab(firstId, gid);
    });
    act(() => {
      result.current.addTab();
    });
    const created = result.current.tabs[result.current.tabs.length - 1];
    expect(created.groupId).toBe(gid);
  });

  it("8. addTab(null) overrides to ungrouped", () => {
    const { result } = renderHook(() => useWorkspace());
    const firstId = result.current.tabs[0].id;
    act(() => {
      result.current.addGroup("g");
    });
    const gid = result.current.groups[0].id;
    act(() => {
      result.current.moveTab(firstId, gid);
    });
    act(() => {
      result.current.addTab(null);
    });
    const created = result.current.tabs[result.current.tabs.length - 1];
    expect(created.groupId).toBeNull();
  });

  it("9. addTab(g_existing) puts it in that group", () => {
    const { result } = renderHook(() => useWorkspace());
    act(() => {
      result.current.addGroup("g");
    });
    const gid = result.current.groups[0].id;
    act(() => {
      result.current.addTab(gid);
    });
    const created = result.current.tabs[result.current.tabs.length - 1];
    expect(created.groupId).toBe(gid);
  });
});

describe("useWorkspace - addRemoteTab", () => {
  it("10. adds remote tab with proper defaults", () => {
    const { result } = renderHook(() => useWorkspace());
    let createdId = -1;
    act(() => {
      createdId = result.current.addRemoteTab("host-42", "my-host");
    });
    const created = result.current.tabs.find((t) => t.id === createdId)!;
    expect(created.kind).toBe("remote");
    expect(created.autoLabel).toBe(false);
    expect(created.sub).toBe("remote");
    expect(created.groupId).toBeNull();
    expect(created.label).toBe("my-host");
    expect(created.remoteHostId).toBe("host-42");
    expect(result.current.activeId).toBe(createdId);
  });
});

describe("useWorkspace - closeTab", () => {
  it("11. closing active promotes neighbor (idx clamped)", () => {
    const { result } = renderHook(() => useWorkspace());
    act(() => {
      result.current.addTab();
    });
    const id2 = result.current.tabs[1].id;
    act(() => {
      result.current.addTab();
    });
    const id3 = result.current.tabs[2].id;
    
    expect(result.current.activeId).toBe(id3);
    act(() => {
      result.current.closeTab(id3);
    });
    
    expect(result.current.activeId).toBe(id2);
  });

  it("12. closing only tab → activeId null, tabs empty", () => {
    const { result } = renderHook(() => useWorkspace());
    const id = result.current.tabs[0].id;
    act(() => {
      result.current.closeTab(id);
    });
    expect(result.current.tabs).toHaveLength(0);
    expect(result.current.activeId).toBeNull();
  });

  it("13. closing non-existent id is a no-op", () => {
    const { result } = renderHook(() => useWorkspace());
    const before = result.current.tabs;
    const beforeActive = result.current.activeId;
    act(() => {
      result.current.closeTab(99999);
    });
    expect(result.current.tabs).toBe(before);
    expect(result.current.activeId).toBe(beforeActive);
  });

  it("14. closing inactive tab keeps activeId", () => {
    const { result } = renderHook(() => useWorkspace());
    const firstId = result.current.tabs[0].id;
    let id2 = -1;
    act(() => {
      id2 = result.current.addTab();
    });
    
    act(() => {
      result.current.closeTab(firstId);
    });
    expect(result.current.activeId).toBe(id2);
    expect(result.current.tabs).toHaveLength(1);
  });
});

describe("useWorkspace - renameTab", () => {
  it("15. sets label and autoLabel=false", () => {
    const { result } = renderHook(() => useWorkspace());
    const id = result.current.tabs[0].id;
    act(() => {
      result.current.renameTab(id, "renamed");
    });
    const t = result.current.tabs[0];
    expect(t.label).toBe("renamed");
    expect(t.autoLabel).toBe(false);
  });

  it("16. whitespace-only rename keeps old label", () => {
    const { result } = renderHook(() => useWorkspace());
    const id = result.current.tabs[0].id;
    const orig = result.current.tabs[0].label;
    act(() => {
      result.current.renameTab(id, "   ");
    });
    expect(result.current.tabs[0].label).toBe(orig);
    
    expect(result.current.tabs[0].autoLabel).toBe(false);
  });
});

describe("useWorkspace - updateTabInfo", () => {
  it("17. shell + cwd → label=basename, sub=basename", () => {
    const { result } = renderHook(() => useWorkspace());
    const id = result.current.tabs[0].id;
    act(() => {
      result.current.updateTabInfo(id, { cwd: "/x/y", cmd: "bash" });
    });
    expect(result.current.tabs[0].label).toBe("y");
    expect(result.current.tabs[0].sub).toBe("y");
    expect(result.current.tabs[0].cwd).toBe("/x/y");
  });

  it("18. non-shell cmd → label and sub equal cmd", () => {
    const { result } = renderHook(() => useWorkspace());
    const id = result.current.tabs[0].id;
    act(() => {
      result.current.updateTabInfo(id, { cwd: "/x/y", cmd: "node" });
    });
    expect(result.current.tabs[0].label).toBe("node");
    expect(result.current.tabs[0].sub).toBe("node");
  });

  it("19. after rename, autoLabel=false → label preserved, sub still updates", () => {
    const { result } = renderHook(() => useWorkspace());
    const id = result.current.tabs[0].id;
    act(() => {
      result.current.renameTab(id, "custom");
    });
    act(() => {
      result.current.updateTabInfo(id, { cwd: "/a/b", cmd: "bash" });
    });
    expect(result.current.tabs[0].label).toBe("custom");
    expect(result.current.tabs[0].sub).toBe("b");
  });

  it("20. remote tab → no-op", () => {
    const { result } = renderHook(() => useWorkspace());
    let rid = -1;
    act(() => {
      rid = result.current.addRemoteTab("h1", "remote-label");
    });
    const before = result.current.tabs.find((t) => t.id === rid);
    act(() => {
      result.current.updateTabInfo(rid, { cwd: "/x/y", cmd: "bash" });
    });
    const after = result.current.tabs.find((t) => t.id === rid);
    expect(after).toEqual(before);
  });

  it("21. same input as current state returns same state object", () => {
    const { result } = renderHook(() => useWorkspace());
    const id = result.current.tabs[0].id;
    act(() => {
      result.current.updateTabInfo(id, { cwd: "/x/y", cmd: "bash" });
    });
    const tabsRef = result.current.tabs;
    act(() => {
      result.current.updateTabInfo(id, { cwd: "/x/y", cmd: "bash" });
    });
    expect(result.current.tabs).toBe(tabsRef);
  });

  it("22. cwd matching __MT_HOME → label='~'", () => {
    (window as unknown as { __MT_HOME?: string }).__MT_HOME = "/home/u";
    const { result } = renderHook(() => useWorkspace());
    const id = result.current.tabs[0].id;
    act(() => {
      result.current.updateTabInfo(id, { cwd: "/home/u", cmd: "bash" });
    });
    expect(result.current.tabs[0].label).toBe("~");
    expect(result.current.tabs[0].sub).toBe("~");
  });
});

describe("useWorkspace - moveTab", () => {
  it("23. moves local tab to group; remote unchanged", () => {
    const { result } = renderHook(() => useWorkspace());
    const localId = result.current.tabs[0].id;
    act(() => {
      result.current.addGroup("g");
    });
    const gid = result.current.groups[0].id;
    act(() => {
      result.current.addRemoteTab("h1", "r");
    });
    const remoteId = result.current.tabs[result.current.tabs.length - 1].id;
    act(() => {
      result.current.moveTab(localId, gid);
    });
    act(() => {
      result.current.moveTab(remoteId, gid);
    });
    const local = result.current.tabs.find((t) => t.id === localId)!;
    const remote = result.current.tabs.find((t) => t.id === remoteId)!;
    expect(local.groupId).toBe(gid);
    expect(remote.groupId).toBeNull();
  });
});

describe("useWorkspace - reorderTab", () => {
  it("24. beforeId=null + groupId='g1' places at end of g1's run", () => {
    const { result } = renderHook(() => useWorkspace());
    const t0 = result.current.tabs[0].id;
    act(() => {
      result.current.addGroup("g");
    });
    const gid = result.current.groups[0].id;
    act(() => {
      result.current.addTab(gid);
    });
    const t1 = result.current.tabs[result.current.tabs.length - 1].id;
    act(() => {
      result.current.addTab(gid);
    });
    const t2 = result.current.tabs[result.current.tabs.length - 1].id;
    
    
    act(() => {
      result.current.reorderTab(t0, null, gid);
    });
    const ids = result.current.tabs.map((t) => t.id);
    
    expect(ids).toEqual([t1, t2, t0]);
    expect(result.current.tabs.find((t) => t.id === t0)!.groupId).toBe(gid);
  });

  it("25. beforeId pointing to another tab inserts before it", () => {
    const { result } = renderHook(() => useWorkspace());
    const t0 = result.current.tabs[0].id;
    act(() => {
      result.current.addTab(null);
    });
    const t1 = result.current.tabs[result.current.tabs.length - 1].id;
    act(() => {
      result.current.addTab(null);
    });
    const t2 = result.current.tabs[result.current.tabs.length - 1].id;
    
    act(() => {
      result.current.reorderTab(t2, t1, null);
    });
    const ids = result.current.tabs.map((t) => t.id);
    expect(ids).toEqual([t0, t2, t1]);
  });

  it("26. remote tab cannot move into a group (no-op)", () => {
    const { result } = renderHook(() => useWorkspace());
    act(() => {
      result.current.addGroup("g");
    });
    const gid = result.current.groups[0].id;
    act(() => {
      result.current.addRemoteTab("h1", "r");
    });
    const rid = result.current.tabs[result.current.tabs.length - 1].id;
    const tabsBefore = result.current.tabs;
    act(() => {
      result.current.reorderTab(rid, null, gid);
    });
    expect(result.current.tabs).toBe(tabsBefore);
  });
});

describe("useWorkspace - groups", () => {
  it("27. addGroup() defaults: id has 'g_' prefix, name='group N', accent rotates", () => {
    const { result } = renderHook(() => useWorkspace());
    let g1 = "";
    let g2 = "";
    let g3 = "";
    act(() => {
      g1 = result.current.addGroup();
    });
    act(() => {
      g2 = result.current.addGroup();
    });
    act(() => {
      g3 = result.current.addGroup();
    });
    expect(g1.startsWith("g_")).toBe(true);
    expect(g2.startsWith("g_")).toBe(true);
    expect(g3.startsWith("g_")).toBe(true);
    const groups = result.current.groups;
    expect(groups.map((g) => g.name)).toEqual(["group 1", "group 2", "group 3"]);
    expect(groups[0].accent).toBe(DEFAULT_ACCENTS[0]);
    expect(groups[1].accent).toBe(DEFAULT_ACCENTS[1]);
    expect(groups[2].accent).toBe(DEFAULT_ACCENTS[2]);
    expect(new Set([g1, g2, g3]).size).toBe(3);
  });

  it("28. addGroup('custom') uses given name", () => {
    const { result } = renderHook(() => useWorkspace());
    let gid = "";
    act(() => {
      gid = result.current.addGroup("custom");
    });
    expect(result.current.groups.find((g) => g.id === gid)!.name).toBe("custom");
  });

  it("28b. reorderGroup moves a group before a sibling or to the end", () => {
    const { result } = renderHook(() => useWorkspace());
    let g1 = "";
    let g2 = "";
    let g3 = "";
    act(() => {
      g1 = result.current.addGroup("one");
    });
    act(() => {
      g2 = result.current.addGroup("two");
    });
    act(() => {
      g3 = result.current.addGroup("three");
    });

    act(() => {
      result.current.reorderGroup(g3, g1);
    });
    expect(result.current.groups.map((g) => g.id)).toEqual([g3, g1, g2]);

    act(() => {
      result.current.reorderGroup(g3, null);
    });
    expect(result.current.groups.map((g) => g.id)).toEqual([g1, g2, g3]);
  });

  it("29. renameGroup applies trim; whitespace keeps old name", () => {
    const { result } = renderHook(() => useWorkspace());
    let gid = "";
    act(() => {
      gid = result.current.addGroup("orig");
    });
    act(() => {
      result.current.renameGroup(gid, "  new  ");
    });
    expect(result.current.groups.find((g) => g.id === gid)!.name).toBe("new");
    act(() => {
      result.current.renameGroup(gid, "   ");
    });
    expect(result.current.groups.find((g) => g.id === gid)!.name).toBe("new");
  });

  it("30. setGroupAccent updates accent", () => {
    const { result } = renderHook(() => useWorkspace());
    let gid = "";
    act(() => {
      gid = result.current.addGroup("g");
    });
    act(() => {
      result.current.setGroupAccent(gid, "#a35cff");
    });
    expect(result.current.groups.find((g) => g.id === gid)!.accent).toBe("#a35cff");
  });

  it("31. toggleGroup flips collapsed", () => {
    const { result } = renderHook(() => useWorkspace());
    let gid = "";
    act(() => {
      gid = result.current.addGroup("g");
    });
    expect(result.current.groups[0].collapsed).toBe(false);
    act(() => {
      result.current.toggleGroup(gid);
    });
    expect(result.current.groups[0].collapsed).toBe(true);
    act(() => {
      result.current.toggleGroup(gid);
    });
    expect(result.current.groups[0].collapsed).toBe(false);
  });

  it("31b. setGroupCwd stores and clears defaultCwd", () => {
    const { result } = renderHook(() => useWorkspace());
    let gid = "";
    act(() => {
      gid = result.current.addGroup("g");
    });
    act(() => {
      result.current.setGroupCwd(gid, "/var/log");
    });
    expect(result.current.groups.find((g) => g.id === gid)!.defaultCwd).toBe(
      "/var/log",
    );
    act(() => {
      result.current.setGroupCwd(gid, null);
    });
    expect(
      result.current.groups.find((g) => g.id === gid)!.defaultCwd,
    ).toBeUndefined();
    act(() => {
      result.current.setGroupCwd(gid, "   ");
    });
    expect(
      result.current.groups.find((g) => g.id === gid)!.defaultCwd,
    ).toBeUndefined();
  });

  it("31c. addTab inherits group.defaultCwd", () => {
    const { result } = renderHook(() => useWorkspace());
    let gid = "";
    act(() => {
      gid = result.current.addGroup("g");
    });
    act(() => {
      result.current.setGroupCwd(gid, "/srv/app");
    });
    act(() => {
      result.current.addTab(gid);
    });
    const tab = result.current.tabs[result.current.tabs.length - 1];
    expect(tab.groupId).toBe(gid);
    expect(tab.cwd).toBe("/srv/app");
  });

  it("32. deleteGroup removes group and clears tab.groupId", () => {
    const { result } = renderHook(() => useWorkspace());
    let gid = "";
    act(() => {
      gid = result.current.addGroup("g");
    });
    const t0 = result.current.tabs[0].id;
    act(() => {
      result.current.moveTab(t0, gid);
    });
    expect(result.current.tabs[0].groupId).toBe(gid);
    act(() => {
      result.current.deleteGroup(gid);
    });
    expect(result.current.groups).toHaveLength(0);
    expect(result.current.tabs[0].groupId).toBeNull();
  });
});

describe("useWorkspace - selectIndex", () => {
  it("33. out-of-range index is no-op", () => {
    const { result } = renderHook(() => useWorkspace());
    const beforeActive = result.current.activeId;
    act(() => {
      result.current.selectIndex(99);
    });
    expect(result.current.activeId).toBe(beforeActive);
    act(() => {
      result.current.selectIndex(-1);
    });
    expect(result.current.activeId).toBe(beforeActive);
  });

  it("34. in-range index sets activeId", () => {
    const { result } = renderHook(() => useWorkspace());
    let t1 = -1;
    act(() => {
      t1 = result.current.addTab();
    });
    act(() => {
      result.current.selectIndex(0);
    });
    expect(result.current.activeId).toBe(result.current.tabs[0].id);
    act(() => {
      result.current.selectIndex(1);
    });
    expect(result.current.activeId).toBe(t1);
  });

  it("35. selecting tab in collapsed group expands group and selects", () => {
    const { result } = renderHook(() => useWorkspace());
    act(() => {
      result.current.addGroup("g");
    });
    const gid = result.current.groups[0].id;
    act(() => {
      result.current.addTab(gid);
    });
    const t1 = result.current.tabs[result.current.tabs.length - 1].id;
    act(() => {
      result.current.toggleGroup(gid);
    });
    expect(result.current.groups[0].collapsed).toBe(true);
    const idx = result.current.tabs.findIndex((t) => t.id === t1);
    act(() => {
      result.current.selectIndex(idx);
    });
    expect(result.current.activeId).toBe(t1);
    expect(result.current.groups[0].collapsed).toBe(false);
  });
});

describe("useWorkspace - persistence", () => {
  it("36. mutations are written to localStorage after 200ms debounce", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useWorkspace());
      act(() => {
        result.current.addTab();
      });
      act(() => {
        vi.advanceTimersByTime(250);
      });
      const raw = window.localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.tabs).toHaveLength(2);
      expect(parsed.activeId).toBe(result.current.activeId);
      expect(parsed.nextTabId).toBe(result.current.nextTabId);
    } finally {
      vi.useRealTimers();
    }
  });
});
