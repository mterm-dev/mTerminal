import { useCallback, useEffect, useState } from "react";
import { invoke } from "../lib/ipc";
import { normalizeAccent, pickDefaultAccent } from "../utils/accent";

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
  accent: string;
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
        (r.groups ?? []).map((g, i) => ({
          ...g,
          accent: normalizeAccent(g.accent, i),
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
      const accent = pickDefaultAccent(groups.length);
      return saveGroup({
        id: "",
        name: name || `group ${groups.length + 1}`,
        collapsed: false,
        accent,
      });
    },
    [groups.length, saveGroup],
  );

  const updateGroup = useCallback(
    async (id: string, patch: (g: HostGroup) => Partial<HostGroup>) => {
      const g = groups.find((x) => x.id === id);
      if (!g) return;
      await saveGroup({ ...g, ...patch(g) });
    },
    [groups, saveGroup],
  );

  const renameGroup = useCallback(
    (id: string, name: string) => updateGroup(id, () => ({ name })),
    [updateGroup],
  );

  const toggleGroup = useCallback(
    (id: string) => updateGroup(id, (g) => ({ collapsed: !g.collapsed })),
    [updateGroup],
  );

  const setGroupAccent = useCallback(
    (id: string, accent: string) => updateGroup(id, () => ({ accent })),
    [updateGroup],
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
