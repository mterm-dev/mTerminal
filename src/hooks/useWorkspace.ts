import { useCallback, useEffect, useRef, useState } from "react";

function basename(p: string): string {
  if (!p) return "";
  const trimmed = p.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return "/";
  const userHome = (window as unknown as { __MT_HOME?: string }).__MT_HOME;
  if (userHome && trimmed === userHome) return "~";
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || "/";
}

export type TabKind = "local" | "remote";

export interface Tab {
  id: number;
  label: string;
  sub?: string;
  cwd?: string;
  groupId: string | null;
  autoLabel: boolean;
  kind: TabKind;
  remoteHostId?: string;
}

export const GROUP_ACCENTS = [
  "orange",
  "blue",
  "violet",
  "cyan",
  "emerald",
  "purple",
  "sky",
  "amber",
  "pink",
  "red",
] as const;

export type GroupAccent = (typeof GROUP_ACCENTS)[number];

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
  accent: GroupAccent;
}

export interface WorkspaceState {
  tabs: Tab[];
  groups: Group[];
  activeId: number | null;
  nextTabId: number;
}

const STORAGE_KEY = "mterminal:workspace:v2";
const LEGACY_STORAGE_KEY = "mterminal:workspace:v1";

function loadInitial(): WorkspaceState {
  if (typeof window !== "undefined") {
    try {
      let raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          raw = legacy;
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
      if (raw) {
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
            accent: (GROUP_ACCENTS.includes(g.accent as GroupAccent)
              ? (g.accent as GroupAccent)
              : GROUP_ACCENTS[i % GROUP_ACCENTS.length]) as GroupAccent,
          }));
          const groupIds = new Set(groups.map((g) => g.id));
          const tabs: Tab[] = parsed.tabs.map((t) => {
            const kind: TabKind = t.kind === "remote" ? "remote" : "local";
            const gid =
              kind === "remote"
                ? null
                : typeof t.groupId === "string" && groupIds.has(t.groupId)
                  ? t.groupId
                  : null;
            return {
              id: t.id!,
              label: t.label || "shell",
              sub: t.sub,
              cwd: t.cwd,
              groupId: gid,
              autoLabel: t.autoLabel ?? true,
              kind,
              remoteHostId: kind === "remote" ? t.remoteHostId : undefined,
            };
          });
          return {
            tabs,
            groups,
            activeId: parsed.activeId ?? tabs[0]?.id ?? null,
            nextTabId: Math.max(
              parsed.nextTabId,
              tabs.reduce((m, t) => Math.max(m, t.id + 1), 1),
            ),
          };
        }
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
  };
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>(loadInitial);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    }, 200);
    return () => window.clearTimeout(id);
  }, [state]);

  const setActive = useCallback((id: number | null) => {
    setState((s) => ({ ...s, activeId: id }));
  }, []);

  const addTab = useCallback((groupId?: string | null): number => {
    let createdId = -1;
    setState((s) => {
      const active = s.tabs.find((t) => t.id === s.activeId);
      const activeGroup = active && active.kind === "local" ? active.groupId : null;
      const targetGroup = groupId === undefined ? activeGroup ?? null : groupId;
      const id = s.nextTabId;
      createdId = id;
      const tab: Tab = {
        id,
        label: "shell",
        groupId: targetGroup,
        autoLabel: true,
        kind: "local",
      };
      return {
        ...s,
        tabs: [...s.tabs, tab],
        activeId: id,
        nextTabId: id + 1,
      };
    });
    return createdId;
  }, []);

  const addRemoteTab = useCallback(
    (remoteHostId: string, label: string): number => {
      let createdId = -1;
      setState((s) => {
        const id = s.nextTabId;
        createdId = id;
        const tab: Tab = {
          id,
          label,
          groupId: null,
          autoLabel: false,
          kind: "remote",
          remoteHostId,
          sub: "remote",
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
        if (t.kind === "remote") return s;
        const cwd = info.cwd ?? undefined;
        const cmd = info.cmd ?? undefined;
        const baseFromCwd = info.cwd ? basename(info.cwd) : undefined;
        const isShell =
          cmd != null &&
          ["bash", "zsh", "fish", "sh", "dash", "ksh"].includes(cmd);
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
        if (tab.kind === "remote" && groupId !== null) return s;
        const without = s.tabs.filter((t) => t.id !== id);
        const updated: Tab = { ...tab, groupId: tab.kind === "remote" ? null : groupId };
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
          accent: GROUP_ACCENTS[s.groups.length % GROUP_ACCENTS.length],
        },
      ],
    }));
    return id;
  }, []);

  const setGroupAccent = useCallback((id: string, accent: GroupAccent) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === id ? { ...g, accent } : g)),
    }));
  }, []);

  const renameGroup = useCallback((id: string, name: string) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === id ? { ...g, name: name.trim() || g.name } : g,
      ),
    }));
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === id ? { ...g, collapsed: !g.collapsed } : g,
      ),
    }));
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
    addRemoteTab,
    closeTab,
    renameTab,
    updateTabInfo,
    moveTab,
    reorderTab,
    addGroup,
    renameGroup,
    setGroupAccent,
    toggleGroup,
    deleteGroup,
    selectIndex,
  };
}
