import React from 'react'
import { IconChevronDown, IconChevronRight, IconFile, IconFolder, IconLink } from './icons'
import type { FileNode } from '../shared/types'

interface NodeProps {
  node: FileNode
  depth: number
  selected: boolean
  childNodes: FileNode[]
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onActivate: (node: FileNode) => void
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
  renderChildren: (parentPath: string) => React.ReactNode
}

function FileTreeNodeImpl(props: NodeProps): React.JSX.Element {
  const { node, depth, selected, onToggle, onSelect, onActivate, onContextMenu, renderChildren } = props
  const looksDir = node.kind === 'dir'
  const indent = depth * 12

  const icon = looksDir ? <IconFolder /> : node.kind === 'symlink' ? <IconLink /> : <IconFile />

  return (
    <>
      <div
        className={`fb-node${selected ? ' selected' : ''}${node.isHidden ? ' hidden-file' : ''}`}
        style={{ paddingLeft: indent + 22 }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node.path)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onActivate(node)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onSelect(node.path)
          onContextMenu(e, node)
        }}
        title={node.path}
      >
        <span
          className="fb-chevron"
          onClick={(e) => {
            if (!looksDir) return
            e.stopPropagation()
            onToggle(node.path)
          }}
          aria-hidden
        >
          {looksDir ? (node.expanded ? <IconChevronDown /> : <IconChevronRight />) : null}
        </span>
        <span className="fb-icon" aria-hidden>{icon}</span>
        <span className="fb-name">{node.name}</span>
        {node.loading && <span className="fb-spinner">…</span>}
      </div>
      {looksDir && node.expanded && (
        <div className="fb-children">
          {node.error ? (
            <div className="fb-error" style={{ paddingLeft: indent + 32 }}>{node.error}</div>
          ) : (
            renderChildren(node.path)
          )}
        </div>
      )}
    </>
  )
}

export const FileTreeNode = React.memo(FileTreeNodeImpl)
