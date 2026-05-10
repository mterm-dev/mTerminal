import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeAccent, pickDefaultAccent } from "../utils/accent";
import {
  rowsForCount,
  syncLayoutSizes,
  syncSlotOrder,
  type CustomLayout,
} from "../lib/grid-layout";

export type GroupLayout = CustomLayout;

function isWindowsPath(p: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  if (p.startsWith("\\\\") || p.startsWith("//")) return true;
  return false;
}

export function basename(p: string): string {
  if (!p) return "";
  const userHome = (window as unknown as { __MT_HOME?: string }).__MT_HOME;
  const win = isWindowsPath(p);
  const sepRe = win ? /[\\/]+$/ : /\/+$/;
  const trimmed = p.replace(sepRe, "");
  if (trimmed === "" || trimmed === "/" || /^[A-Za-z]:$/.test(trimmed)) {
    return win ? trimmed.toUpperCase() || "\\" : "/";
  }
  if (userHome) {
    if (win) {
      if (trimmed.toLowerCase() === userHome.toLowerCase()) return "~";
    } else if (trimmed === userHome) {
      return "~";
    }
  }
  const splitRe = win ? /[\\/]/ : /\//;
  const parts = trimmed.split(splitRe);
  return parts[parts.length - 1] || (win ? "\\" : "/");
}

export type TabKind = "local" | "custom";

export interface Tab {
  id: number;
  label: string;
  sub?: string;
  cwd?: string;
  groupId: string | null;
  autoLabel: boolean;
  kind: TabKind;
  customType?: string;
  customProps?: unknown;
  profileId?: string;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
  accent: string;
  defaultCwd?: string;
}

export interface WorkspaceState {
  tabs: Tab[];
  groups: Group[];
  activeId: number | null;
  nextTabId: number;
  groupLayouts: Record<string, GroupLayout>;
}

const STORAGE_KEY = "mterminal:workspace:v2";
const LEGACY_STORAGE_KEY = "mterminal:workspace:v1";

interface WorkspaceMtApi {
  loadSync?: () => string | null;
  save?: (json: string) => Promise<void> | void;
}

function workspaceMtApi(): WorkspaceMtApi | null {
  if (typeof window === "undefined") return null;
  const mt = (window as unknown as { mt?: { workspace?: WorkspaceMtApi } }).mt;
  return mt?.workspace ?? null;
}

function readRawState(): string | null {
  const api = workspaceMtApi();
  if (api?.loadSync) {
    try {
      const v = api.loadSync();
      if (typeof v === "string" && v.length > 0) return v;
    } catch {}
  }
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) return raw;
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        try {
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {}
        return legacy;
      }
    } catch {}
  }
  return null;
}

function persistRawState(json: string): void {
  const api = workspaceMtApi();
  if (api?.save) {
    try {
      const r = api.save(json);
      if (r && typeof (r as Promise<void>).catch === "function") {
        (r as Promise<void>).catch(() => {});
      }
      return;
    } catch {}
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, json);
    } catch {}
  }
}

function loadInitial(): WorkspaceState {
  const raw = readRawState();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
      if (
        parsed &&
        Array.isArray(parsed.groups) &&
        Array.isArray(parsed.tabs) &&
        typeof parsed.nextTabId === "number"
      ) {
        const groups: Group[] = parsed.groups.map((g, i) => ({
          id: g.id!,
          name: g.name || "group",
          collapsed: !!g.collapsed,
          accent: normalizeAccent(g.accent, i),
          defaultCwd:
            typeof g.defaultCwd === "string" && g.defaultCwd.length > 0
              ? g.defaultCwd
              : undefined,
        }));
        const groupIds = new Set(groups.map((g) => g.id));
        const tabs: Tab[] = parsed.tabs
          .filter((t) => (t.kind as string | undefined) !== "remote")
          .map((t) => {
            const kind: TabKind = t.kind === "custom" ? "custom" : "local";
            const gid =
              typeof t.groupId === "string" && groupIds.has(t.groupId)
                ? t.groupId
                : null;
            const tab: Tab = {
              id: t.id!,
              label: t.label || "shell",
              sub: t.sub,
              cwd: t.cwd,
              groupId: gid,
              autoLabel: t.autoLabel ?? true,
              kind,
            };
            if (kind === "custom") {
              tab.customType =
                typeof (t as { customType?: unknown }).customType === "string"
                  ? ((t as { customType?: string }).customType as string)
                  : undefined;
              tab.customProps = (t as { customProps?: unknown }).customProps;
            }
            return tab;
          });
        const groupLayouts = sanitizeGroupLayouts(
          (parsed as { groupLayouts?: Record<string, unknown> }).groupLayouts,
          groups,
          tabs,
        );
        return {
          tabs,
          groups,
          activeId: parsed.activeId ?? tabs[0]?.id ?? null,
          nextTabId: Math.max(
            parsed.nextTabId,
            tabs.reduce((m, t) => Math.max(m, t.id + 1), 1),
          ),
          groupLayouts,
        };
      }
    } catch {}
  }
  const firstId = 1;
  return {
    tabs: [
      {
        id: firstId,
        label: "shell",
        groupId: null,
        autoLabel: true,
        kind: "local",
      },
    ],
    groups: [],
    activeId: firstId,
    nextTabId: firstId + 1,
    groupLayouts: {},
  };
}

function sanitizeGroupLayouts(
  raw: unknown,
  groups: Group[],
  tabs: Tab[],
): Record<string, GroupLayout> {
  const out: Record<string, GroupLayout> = {};
  if (!raw || typeof raw !== "object") return out;
  const validGroupIds = new Set(groups.map((g) => g.id));
  for (const [gid, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!validGroupIds.has(gid)) continue;
    const layout = parseLayout(val);
    if (!layout) continue;
    const count = tabs.filter((t) => t.groupId === gid).length;
    if (count <= 0) continue;
    out[gid] = syncLayoutSizes(layout, count);
  }
  return out;
}

function parseLayout(val: unknown): GroupLayout | null {
  if (!val || typeof val !== "object") return null;
  const obj = val as {
    cols?: unknown;
    colSizes?: unknown;
    rowSizes?: unknown;
    slotOrder?: unknown;
  };
  const cols = typeof obj.cols === "number" && obj.cols >= 1 ? Math.floor(obj.cols) : null;
  if (!cols) return null;
  const colSizes = parseSizeArray(obj.colSizes);
  const rowSizes = parseSizeArray(obj.rowSizes);
  if (!colSizes || !rowSizes) return null;
  const slotOrder = parseIntArray(obj.slotOrder);
  return { cols, colSizes, rowSizes, slotOrder };
}

function parseSizeArray(val: unknown): number[] | null {
  if (!Array.isArray(val) || val.length === 0) return null;
  const out: number[] = [];
  for (const v of val) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
    out.push(v);
  }
  return out;
}

function parseIntArray(val: unknown): number[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const out: number[] = [];
  for (const v of val) {
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    out.push(Math.floor(v));
  }
  return out;
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>(loadInitial);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState((s) => {
      const validGids = new Set(s.groups.map((g) => g.id));
      const next: Record<string, GroupLayout> = {};
      let changed = false;
      for (const [gid, layout] of Object.entries(s.groupLayouts)) {
        if (!validGids.has(gid)) {
          changed = true;
          continue;
        }
        const presentIds = s.tabs
          .filter((t) => t.groupId === gid)
          .map((t) => t.id);
        if (presentIds.length <= 0) {
          changed = true;
          continue;
        }
        const sized = syncLayoutSizes(layout, presentIds.length);
        const slotOrder = syncSlotOrder(sized.slotOrder, presentIds);
        const synced =
          slotOrder === sized.slotOrder ? sized : { ...sized, slotOrder };
        if (synced !== layout) changed = true;
        next[gid] = synced;
      }
      if (
        !changed &&
        Object.keys(next).length === Object.keys(s.groupLayouts).length
      ) {
        return s;
      }
      return { ...s, groupLayouts: next };
    });
  }, [state.tabs, state.groups]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        persistRawState(JSON.stringify(state));
      } catch {}
    }, 200);
    return () => window.clearTimeout(id);
  }, [state]);

  useEffect(() => {
    const flush = (): void => {
      try {
        persistRawState(JSON.stringify(stateRef.current));
      } catch {}
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  const setActive = useCallback((id: number | null) => {
    setState((s) => ({ ...s, activeId: id }));
  }, []);

  const addTab = useCallback(
    (groupId?: string | null, opts?: { profileId?: string | null }): number => {
      let createdId = -1;
      setState((s) => {
        const active = s.tabs.find((t) => t.id === s.activeId);
        const activeGroup =
          active && (active.kind === "local" || active.kind === "custom")
            ? active.groupId
            : null;
        const targetGroup =
          groupId === undefined ? activeGroup ?? null : groupId;
        const group = targetGroup
          ? s.groups.find((g) => g.id === targetGroup)
          : null;
        const id = s.nextTabId;
        createdId = id;
        const tab: Tab = {
          id,
          label: "shell",
          groupId: targetGroup,
          autoLabel: true,
          kind: "local",
          cwd: group?.defaultCwd,
          ...(opts?.profileId ? { profileId: opts.profileId } : {}),
        };
        return {
          ...s,
          tabs: [...s.tabs, tab],
          activeId: id,
          nextTabId: id + 1,
        };
      });
      return createdId;
    },
    [],
  );

  const addCustomTab = useCallback(
    (opts: {
      customType: string;
      label?: string;
      sub?: string;
      groupId?: string | null;
      cwd?: string;
      props?: unknown;
    }): number => {
      let createdId = -1;
      setState((s) => {
        const active = s.tabs.find((t) => t.id === s.activeId);
        const activeGroup =
          active && (active.kind === "local" || active.kind === "custom")
            ? active.groupId
            : null;
        const targetGroup =
          opts.groupId === undefined ? activeGroup ?? null : opts.groupId;
        const id = s.nextTabId;
        createdId = id;
        const tab: Tab = {
          id,
          label: opts.label ?? opts.customType,
          sub: opts.sub,
          cwd: opts.cwd,
          groupId: targetGroup,
          autoLabel: false,
          kind: "custom",
          customType: opts.customType,
          customProps: opts.props,
        };
        return {
          ...s,
          tabs: [...s.tabs, tab],
          activeId: id,
          nextTabId: id + 1,
        };
      });
      return createdId;
    },
    [],
  );

  const closeTab = useCallback((id: number) => {
    setState((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx < 0) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeId = s.activeId;
      if (activeId === id) {
        if (tabs.length === 0) activeId = null;
        else activeId = tabs[Math.min(idx, tabs.length - 1)].id;
      }
      return { ...s, tabs, activeId };
    });
  }, []);

  const renameTab = useCallback((id: number, label: string) => {
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              label: label.trim() || t.label,
              autoLabel: false,
            }
          : t,
      ),
    }));
  }, []);

  const updateTabInfo = useCallback(
    (id: number, info: { cwd: string | null; cmd: string | null }) => {
      setState((s) => {
        const t = s.tabs.find((x) => x.id === id);
        if (!t) return s;
        const cwd = info.cwd ?? undefined;
        const cmd = info.cmd ?? undefined;
        const baseFromCwd = info.cwd ? basename(info.cwd) : undefined;
        const isShell =
          cmd != null &&
          [
            "bash",
            "zsh",
            "fish",
            "sh",
            "dash",
            "ksh",
            "powershell",
            "pwsh",
            "cmd",
            "wsl",
            "bash.exe",
            "powershell.exe",
            "pwsh.exe",
            "cmd.exe",
            "wsl.exe",
          ].includes(cmd.toLowerCase());
        const autoSub = isShell ? baseFromCwd : cmd;
        const autoLabel = isShell
          ? baseFromCwd ?? "shell"
          : cmd ?? baseFromCwd ?? "shell";
        const nextLabel = t.autoLabel ? autoLabel : t.label;
        if (
          t.cwd === cwd &&
          t.sub === autoSub &&
          t.label === nextLabel
        ) {
          return s;
        }
        return {
          ...s,
          tabs: s.tabs.map((x) =>
            x.id === id
              ? { ...x, cwd, sub: autoSub, label: nextLabel }
              : x,
          ),
        };
      });
    },
    [],
  );

  const moveTab = useCallback((id: number, groupId: string | null) => {
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) =>
        t.id === id && t.kind === "local" ? { ...t, groupId } : t,
      ),
    }));
  }, []);

  const reorderTab = useCallback(
    (id: number, beforeId: number | null, groupId: string | null) => {
      setState((s) => {
        const tab = s.tabs.find((t) => t.id === id);
        if (!tab) return s;
        const without = s.tabs.filter((t) => t.id !== id);
        const updated: Tab = { ...tab, groupId };
        let insertAt: number;
        if (beforeId == null) {
          let lastIdx = -1;
          without.forEach((t, i) => {
            if (t.groupId === groupId) lastIdx = i;
          });
          insertAt = lastIdx >= 0 ? lastIdx + 1 : without.length;
        } else {
          insertAt = without.findIndex((t) => t.id === beforeId);
          if (insertAt < 0) insertAt = without.length;
        }
        const tabs = [
          ...without.slice(0, insertAt),
          updated,
          ...without.slice(insertAt),
        ];
        return { ...s, tabs };
      });
    },
    [],
  );

  const addGroup = useCallback((name?: string): string => {
    const id = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    setState((s) => ({
      ...s,
      groups: [
        ...s.groups,
        {
          id,
          name: name || `group ${s.groups.length + 1}`,
          collapsed: false,
          accent: pickDefaultAccent(s.groups.length),
        },
      ],
    }));
    return id;
  }, []);

  const updateGroup = useCallback(
    (id: string, patch: (g: Group) => Partial<Group>) => {
      setState((s) => ({
        ...s,
        groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch(g) } : g)),
      }));
    },
    [],
  );

  const setGroupAccent = useCallback(
    (id: string, accent: string) => updateGroup(id, () => ({ accent })),
    [updateGroup],
  );

  const setGroupCwd = useCallback(
    (id: string, cwd: string | null) =>
      updateGroup(id, () => ({
        defaultCwd: cwd && cwd.trim() ? cwd : undefined,
      })),
    [updateGroup],
  );

  const renameGroup = useCallback(
    (id: string, name: string) =>
      updateGroup(id, (g) => ({ name: name.trim() || g.name })),
    [updateGroup],
  );

  const toggleGroup = useCallback(
    (id: string) => updateGroup(id, (g) => ({ collapsed: !g.collapsed })),
    [updateGroup],
  );

  const reorderGroup = useCallback((id: string, beforeId: string | null) => {
    setState((s) => {
      const group = s.groups.find((g) => g.id === id);
      if (!group || beforeId === id) return s;

      const without = s.groups.filter((g) => g.id !== id);
      let insertAt =
        beforeId == null
          ? without.length
          : without.findIndex((g) => g.id === beforeId);
      if (insertAt < 0) insertAt = without.length;

      const groups = [
        ...without.slice(0, insertAt),
        group,
        ...without.slice(insertAt),
      ];
      const unchanged = groups.every((g, i) => g.id === s.groups[i]?.id);
      return unchanged ? s : { ...s, groups };
    });
  }, []);

  const deleteGroup = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      groups: s.groups.filter((g) => g.id !== id),
      tabs: s.tabs.map((t) =>
        t.groupId === id ? { ...t, groupId: null } : t,
      ),
    }));
  }, []);

  const setGroupLayout = useCallback(
    (groupId: string, patch: Partial<GroupLayout>) => {
      setState((s) => {
        const count = s.tabs.filter((t) => t.groupId === groupId).length;
        if (count <= 0) return s;
        const existing = s.groupLayouts[groupId];
        const baseCols =
          patch.cols ??
          existing?.cols ??
          Math.max(1, Math.ceil(Math.sqrt(count)));
        const baseColSizes =
          patch.colSizes ??
          existing?.colSizes ??
          Array.from({ length: baseCols }, () => 1);
        const targetRows = rowsForCount(count, baseCols);
        const baseRowSizes =
          patch.rowSizes ??
          existing?.rowSizes ??
          Array.from({ length: targetRows }, () => 1);
        const baseSlotOrder =
          patch.slotOrder !== undefined ? patch.slotOrder : existing?.slotOrder;
        const merged = syncLayoutSizes(
          {
            cols: baseCols,
            colSizes: baseColSizes,
            rowSizes: baseRowSizes,
            slotOrder: baseSlotOrder,
          },
          count,
        );
        if (
          existing &&
          existing.cols === merged.cols &&
          arraysEqual(existing.colSizes, merged.colSizes) &&
          arraysEqual(existing.rowSizes, merged.rowSizes) &&
          arraysEqual(existing.slotOrder, merged.slotOrder)
        ) {
          return s;
        }
        return {
          ...s,
          groupLayouts: { ...s.groupLayouts, [groupId]: merged },
        };
      });
    },
    [],
  );

  const swapTabsInGroup = useCallback((aId: number, bId: number) => {
    if (aId === bId) return;
    setState((s) => {
      const a = s.tabs.find((t) => t.id === aId);
      const b = s.tabs.find((t) => t.id === bId);
      if (!a || !b) return s;
      const gid = a.groupId;
      if (gid == null || gid !== b.groupId) return s;
      const presentIds = s.tabs
        .filter((t) => t.groupId === gid)
        .map((t) => t.id);
      if (presentIds.length < 2) return s;
      const existing = s.groupLayouts[gid];
      const baseCols =
        existing?.cols ?? Math.max(1, Math.ceil(Math.sqrt(presentIds.length)));
      const baseColSizes =
        existing?.colSizes ?? Array.from({ length: baseCols }, () => 1);
      const baseRowSizes =
        existing?.rowSizes ??
        Array.from({ length: rowsForCount(presentIds.length, baseCols) }, () => 1);
      const baseSlotOrder = existing?.slotOrder ?? presentIds;
      const ai = baseSlotOrder.indexOf(aId);
      const bi = baseSlotOrder.indexOf(bId);
      if (ai < 0 || bi < 0) return s;
      const slotOrder = baseSlotOrder.slice();
      slotOrder[ai] = bId;
      slotOrder[bi] = aId;
      const merged = syncLayoutSizes(
        {
          cols: baseCols,
          colSizes: baseColSizes,
          rowSizes: baseRowSizes,
          slotOrder,
        },
        presentIds.length,
      );
      return {
        ...s,
        groupLayouts: { ...s.groupLayouts, [gid]: merged },
      };
    });
  }, []);

  const selectIndex = useCallback((idx: number) => {
    const cur = stateRef.current;
    if (idx < 0 || idx >= cur.tabs.length) return;
    const target = cur.tabs[idx];
    setState((s) => {
      const group = target.groupId
        ? s.groups.find((g) => g.id === target.groupId)
        : null;
      const groups = group?.collapsed
        ? s.groups.map((g) =>
            g.id === target.groupId ? { ...g, collapsed: false } : g,
          )
        : s.groups;
      return { ...s, groups, activeId: target.id };
    });
  }, []);

  return {
    ...state,
    setActive,
    addTab,
    addCustomTab,
    closeTab,
    renameTab,
    updateTabInfo,
    moveTab,
    reorderTab,
    addGroup,
    renameGroup,
    setGroupAccent,
    setGroupCwd,
    toggleGroup,
    reorderGroup,
    deleteGroup,
    selectIndex,
    setGroupLayout,
    swapTabsInGroup,
  };
}

function arraysEqual(a: number[] | undefined, b: number[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
