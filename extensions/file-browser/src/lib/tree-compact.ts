import type { FileNode } from '../shared/types'

export interface CompactView {
  tail: FileNode
  togglePath: string
  displayName: string
  headPath: string
}

export function computeCompactView(
  head: FileNode,
  nodes: Record<string, FileNode>,
): CompactView {
  if (head.kind !== 'dir' || !head.loaded) {
    return {
      tail: head,
      togglePath: head.path,
      displayName: head.name,
      headPath: head.path,
    }
  }
  let tail = head
  let displayName = head.name
  while (
    tail.kind === 'dir' &&
    tail.loaded &&
    tail.childPaths &&
    tail.childPaths.length === 1
  ) {
    const onlyChildPath = tail.childPaths[0]!
    const child = nodes[onlyChildPath]
    if (!child) break
    if (child.kind !== 'dir' || !child.loaded) break
    tail = child
    displayName = `${displayName}/${child.name}`
  }
  return {
    tail,
    togglePath: tail.path,
    displayName,
    headPath: head.path,
  }
}
