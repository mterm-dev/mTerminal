import { Fragment, type ReactNode } from "react";
import type { GitFile } from "../hooks/useGitStatus";
import {
  collectFilePaths,
  dirCheckState,
  type TreeNode,
} from "../lib/git-tree";
import { Checkbox } from "./Checkbox";
import { ChevronToggle, FolderIcon } from "./icons";

export function fileBadge(f: GitFile): { letter: string; cls: string; title: string } {
  if (f.untracked) return { letter: "?", cls: "untracked", title: "untracked" };
  const idx = f.indexStatus;
  const wt = f.worktreeStatus;
  const code = idx !== "." ? idx : wt;
  switch (code) {
    case "A": return { letter: "A", cls: "added", title: "added" };
    case "M": return { letter: "M", cls: "modified", title: "modified" };
    case "D": return { letter: "D", cls: "deleted", title: "deleted" };
    case "R": return { letter: "R", cls: "modified", title: "renamed" };
    case "C": return { letter: "C", cls: "modified", title: "copied" };
    case "T": return { letter: "T", cls: "modified", title: "type changed" };
    case "U": return { letter: "U", cls: "deleted", title: "unmerged" };
    default: return { letter: code || "·", cls: "modified", title: "changed" };
  }
}

export interface RenderCtx {
  checked: Set<string>;
  collapsedDirs: Set<string>;
  busy: boolean;
  onToggleFile: (f: GitFile) => void;
  onToggleDir: (n: TreeNode) => void;
  onToggleDirCollapse: (path: string) => void;
  onOpenDiff: (f: GitFile) => void;
}

export function renderTree(
  node: TreeNode,
  depth: number,
  isRoot: boolean,
  ctx: RenderCtx,
): ReactNode {
  if (isRoot) {
    return node.children.map((c) => (
      <Fragment key={c.fullPath}>{renderTree(c, 0, false, ctx)}</Fragment>
    ));
  }
  if (node.isDir) {
    const isCollapsed = ctx.collapsedDirs.has(node.fullPath);
    const state = dirCheckState(node, ctx.checked);
    const fileCount = collectFilePaths(node).length;
    return (
      <Fragment>
        <div
          className="git-tree-row dir"
          style={{ paddingLeft: depth * 14 + 4 }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest(".git-checkbox")) return;
            ctx.onToggleDirCollapse(node.fullPath);
          }}
          role="treeitem"
          aria-expanded={!isCollapsed}
        >
          <ChevronToggle collapsed={isCollapsed} />
          <Checkbox
            state={state}
            onChange={() => ctx.onToggleDir(node)}
            disabled={ctx.busy}
            ariaLabel={`stage ${node.fullPath}`}
          />
          <FolderIcon open={!isCollapsed} />
          <span className="git-tree-dir-name" title={node.fullPath}>
            {node.name}
          </span>
          <span className="git-tree-dir-count">{fileCount}</span>
        </div>
        {!isCollapsed &&
          node.children.map((c) => (
            <Fragment key={c.fullPath}>{renderTree(c, depth + 1, false, ctx)}</Fragment>
          ))}
      </Fragment>
    );
  }
  const f = node.file!;
  return (
    <FileRow
      file={f}
      depth={depth}
      checked={ctx.checked.has(f.path)}
      busy={ctx.busy}
      onToggle={() => ctx.onToggleFile(f)}
      onOpenDiff={() => ctx.onOpenDiff(f)}
      displayName={node.name}
      withChevronSpacer
    />
  );
}

interface FileRowProps {
  file: GitFile;
  depth: number;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onOpenDiff: () => void;
  displayName?: string;
  withChevronSpacer?: boolean;
}

export function FileRow({
  file,
  depth,
  checked,
  busy,
  onToggle,
  onOpenDiff,
  displayName,
  withChevronSpacer,
}: FileRowProps) {
  const badge = fileBadge(file);
  return (
    <div
      className="git-tree-row file"
      style={{ paddingLeft: depth * 14 + 4 }}
      role="listitem"
      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
    >
      {withChevronSpacer && <span className="git-chevron-spacer" aria-hidden="true" />}
      <Checkbox
        state={checked ? "checked" : "unchecked"}
        onChange={onToggle}
        disabled={busy}
        ariaLabel={`stage ${file.path}`}
      />
      <span className={`badge ${badge.cls}`} title={badge.title} aria-label={badge.title}>
        {badge.letter}
      </span>
      <span className="git-file-path" onClick={onOpenDiff}>
        {displayName ?? file.path}
      </span>
    </div>
  );
}
