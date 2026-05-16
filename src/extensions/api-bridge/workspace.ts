/**
 * `ctx.workspace` — read-only view of the tab/group state plus tab.open/close.
 *
 * The host injects a `WorkspaceBackend` at boot that bridges to the
 * `useWorkspace()` React state. Until that backend is set, all queries
 * return empty arrays.
 */

import type { Disposable, WorkspaceApi } from '../ctx-types'
import { getWorkspaceSectionRegistry } from '../registries/workspace-sections'

export interface WorkspaceTab {
  id: number
  type: string
  title: string
  groupId: string | null
  active: boolean
}

export interface WorkspaceBackend {
  groups(): Array<{ id: string; label: string }>
  activeGroup(): string | null
  setActiveGroup(id: string): void
  tabs(groupId?: string): WorkspaceTab[]
  cwd(): string | null
  openTab(args: { type: string; title?: string; props?: unknown; groupId?: string | null }): Promise<number>
  closeTab(tabId: number): void
  active(): { id: number; type: string } | null
  list(): WorkspaceTab[]
  onTabsChange(cb: (tabs: WorkspaceTab[]) => void): Disposable
}

let backend: WorkspaceBackend = createNoopBackend()

export function setWorkspaceBackend(b: WorkspaceBackend): void {
  backend = b
}
export function getWorkspaceBackend(): WorkspaceBackend {
  return backend
}

function createNoopBackend(): WorkspaceBackend {
  return {
    groups: () => [],
    activeGroup: () => null,
    setActiveGroup: () => {},
    tabs: () => [],
    cwd: () => null,
    openTab: async () => -1,
    closeTab: () => {},
    active: () => null,
    list: () => [],
    onTabsChange: () => ({ dispose: () => {} }),
  }
}

export function createWorkspaceBridge(extId: string): WorkspaceApi {
  const sectionReg = getWorkspaceSectionRegistry()
  return {
    groups: () => backend.groups(),
    activeGroup: () => backend.activeGroup(),
    setActiveGroup: (id) => backend.setActiveGroup(id),
    tabs: (groupId) => backend.tabs(groupId),
    cwd: () => backend.cwd(),
    sections: {
      register: (section) => sectionReg.register(section, extId),
      list: () =>
        sectionReg
          .list()
          .map(({ id, label, allowNewTab, allowNewGroup }) => ({
            id,
            label,
            allowNewTab,
            allowNewGroup,
          })),
    },
  }
}
