import { useCallback, useEffect, useState } from 'react'
import type {
  HostGroup,
  HostMeta,
  HostsSnapshot,
  SshKey,
} from '../shared/types'

export interface ExtIpcLite {
  invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
  on(channel: string, cb: (payload: unknown) => void): { dispose(): void }
}

export interface UseHostRegistryResult {
  hosts: HostMeta[]
  groups: HostGroup[]
  loading: boolean
  refresh(): Promise<void>
  saveHost(host: Partial<HostMeta>): Promise<HostMeta>
  deleteHost(id: string): Promise<void>
  setHostGroup(hostId: string, groupId: string | null): Promise<void>
  reorderHost(
    hostId: string,
    beforeHostId: string | null,
    groupId: string | null,
  ): Promise<void>
  saveGroup(group: Partial<HostGroup>): Promise<HostGroup>
  deleteGroup(id: string): Promise<void>
  reorderGroup(groupId: string, beforeGroupId: string | null): Promise<void>
  listSshKeys(): Promise<SshKey[]>
  touchLastUsed(hostId: string): Promise<void>
}

export function useHostRegistry(ipc: ExtIpcLite): UseHostRegistryResult {
  const [hosts, setHosts] = useState<HostMeta[]>([])
  const [groups, setGroups] = useState<HostGroup[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const snapshot = await ipc.invoke<HostsSnapshot>('hosts:list')
      setHosts(snapshot.hosts ?? [])
      setGroups(snapshot.groups ?? [])
    } finally {
      setLoading(false)
    }
  }, [ipc])

  useEffect(() => {
    void refresh()
    const sub = ipc.on('hosts:changed', (payload) => {
      const snapshot = payload as HostsSnapshot
      setHosts(snapshot.hosts ?? [])
      setGroups(snapshot.groups ?? [])
    })
    return () => sub.dispose()
  }, [ipc, refresh])

  const saveHost = useCallback(
    (host: Partial<HostMeta>): Promise<HostMeta> =>
      ipc.invoke<HostMeta>('hosts:save', { host }),
    [ipc],
  )

  const deleteHost = useCallback(
    (id: string): Promise<void> => ipc.invoke('hosts:delete', { id }) as Promise<void>,
    [ipc],
  )

  const setHostGroup = useCallback(
    (hostId: string, groupId: string | null): Promise<void> =>
      ipc.invoke('hosts:set-group', { hostId, groupId }) as Promise<void>,
    [ipc],
  )

  const reorderHost = useCallback(
    (hostId: string, beforeHostId: string | null, groupId: string | null): Promise<void> =>
      ipc.invoke('hosts:reorder', { hostId, beforeHostId, groupId }) as Promise<void>,
    [ipc],
  )

  const saveGroup = useCallback(
    (group: Partial<HostGroup>): Promise<HostGroup> => ipc.invoke<HostGroup>('groups:save', { group }),
    [ipc],
  )

  const deleteGroup = useCallback(
    (id: string): Promise<void> => ipc.invoke('groups:delete', { id }) as Promise<void>,
    [ipc],
  )

  const reorderGroup = useCallback(
    (groupId: string, beforeGroupId: string | null): Promise<void> =>
      ipc.invoke('groups:reorder', { groupId, beforeGroupId }) as Promise<void>,
    [ipc],
  )

  const listSshKeys = useCallback(
    (): Promise<SshKey[]> => ipc.invoke<SshKey[]>('hosts:list-keys'),
    [ipc],
  )

  const touchLastUsed = useCallback(
    (hostId: string): Promise<void> =>
      ipc.invoke('hosts:touch', { hostId }) as Promise<void>,
    [ipc],
  )

  return {
    hosts,
    groups,
    loading,
    refresh,
    saveHost,
    deleteHost,
    setHostGroup,
    reorderHost,
    saveGroup,
    deleteGroup,
    reorderGroup,
    listSshKeys,
    touchLastUsed,
  }
}
