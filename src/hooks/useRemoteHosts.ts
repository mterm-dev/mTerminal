import { useCallback, useEffect, useState } from "react";
import { invoke } from "../lib/tauri-shim";
import { GROUP_ACCENTS, type GroupAccent } from "./useWorkspace";

export interface HostMeta {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: "key" | "password" | "agent";
  identityPath?: string;
  savePassword: boolean;
  lastUsed?: number;
  groupId?: string | null;
}

export interface HostGroup {
  id: string;
  name: string;
  collapsed: boolean;
  accent: GroupAccent;
}

interface HostListResult {
  hosts: HostMeta[];
  groups: HostGroup[];
}

export interface SshKey {
  path: string;
  name: string;
  keyType: string;
}

export interface ToolAvailability {
  sshpass: boolean;
}

function normalizeAccent(a: string | undefined): GroupAccent {
  return (GROUP_ACCENTS as readonly string[]).includes(a ?? "")
    ? (a as GroupAccent)
    : "blue";
}

export function useRemoteHosts(enabled: boolean, vaultUnlocked: boolean) {
  const [hosts, setHosts] = useState<HostMeta[]>([]);
  const [groups, setGroups] = useState<HostGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setHosts([]);
      setGroups([]);
      return;
    }
    setLoading(true);
    try {
      const r = await invoke<HostListResult>("host_list");
      setHosts(r.hosts);
      setGroups(
        (r.groups ?? []).map((g) => ({
          ...g,
          accent: normalizeAccent(g.accent as string),
        })),
      );
    } catch {
      setHosts([]);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [enabled, vaultUnlocked, refresh]);

  const save = useCallback(
    async (host: HostMeta, password?: string) => {
      const id = await invoke<string>("host_save", {
        host: { ...host, groupId: host.groupId ?? null },
        password: password ?? null,
      });
      await refresh();
      return id;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await invoke("host_delete", { id });
      await refresh();
    },
    [refresh],
  );

  const setHostGroup = useCallback(
    async (hostId: string, groupId: string | null) => {
      await invoke("host_set_group", { hostId, groupId });
      await refresh();
    },
    [refresh],
  );

  const saveGroup = useCallback(
    async (group: HostGroup) => {
      const id = await invoke<string>("host_group_save", { group });
      await refresh();
      return id;
    },
    [refresh],
  );

  const deleteGroup = useCallback(
    async (id: string) => {
      await invoke("host_group_delete", { id });
      await refresh();
    },
    [refresh],
  );

  const addGroup = useCallback(
    async (name?: string) => {
      const accent = GROUP_ACCENTS[groups.length % GROUP_ACCENTS.length];
      return saveGroup({
        id: "",
        name: name || `group ${groups.length + 1}`,
        collapsed: false,
        accent,
      });
    },
    [groups.length, saveGroup],
  );

  const renameGroup = useCallback(
    async (id: string, name: string) => {
      const g = groups.find((x) => x.id === id);
      if (!g) return;
      await saveGroup({ ...g, name });
    },
    [groups, saveGroup],
  );

  const toggleGroup = useCallback(
    async (id: string) => {
      const g = groups.find((x) => x.id === id);
      if (!g) return;
      await saveGroup({ ...g, collapsed: !g.collapsed });
    },
    [groups, saveGroup],
  );

  const setGroupAccent = useCallback(
    async (id: string, accent: GroupAccent) => {
      const g = groups.find((x) => x.id === id);
      if (!g) return;
      await saveGroup({ ...g, accent });
    },
    [groups, saveGroup],
  );

  return {
    hosts,
    groups,
    loading,
    refresh,
    save,
    remove,
    setHostGroup,
    addGroup,
    renameGroup,
    toggleGroup,
    setGroupAccent,
    deleteGroup,
  };
}

export async function listSshKeys(): Promise<SshKey[]> {
  try {
    return await invoke<SshKey[]>("list_ssh_keys");
  } catch {
    return [];
  }
}

export async function getToolAvailability(): Promise<ToolAvailability> {
  try {
    return await invoke<ToolAvailability>("tool_availability");
  } catch {
    return { sshpass: false };
  }
}
