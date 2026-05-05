import type { GitFile } from "../hooks/useGitStatus";

export interface TreeNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  file?: GitFile;
  children: TreeNode[];
}

export function buildTree(files: GitFile[]): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", isDir: true, children: [] };
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");
      let child = cur.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          fullPath,
          isDir: !isLast,
          file: isLast ? f : undefined,
          children: [],
        };
        cur.children.push(child);
      } else if (isLast && !child.file) {
        child.file = f;
        child.isDir = false;
      }
      cur = child;
    }
  }
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

function compactDirChain(node: TreeNode): TreeNode {
  if (!node.isDir) return node;
  let cur = node;
  while (
    cur.isDir &&
    cur.children.length === 1 &&
    cur.children[0]!.isDir
  ) {
    const child = cur.children[0]!;
    cur = {
      name: cur.name ? `${cur.name}/${child.name}` : child.name,
      fullPath: child.fullPath,
      isDir: true,
      children: child.children,
    };
  }
  return {
    ...cur,
    children: cur.children.map(compactDirChain),
  };
}

export function compactTree(root: TreeNode): TreeNode {
  return {
    ...root,
    children: root.children.map(compactDirChain),
  };
}

export function collectFilePaths(node: TreeNode): string[] {
  if (node.file) return [node.file.path];
  const out: string[] = [];
  for (const c of node.children) out.push(...collectFilePaths(c));
  return out;
}

export function collectDirPaths(node: TreeNode): string[] {
  const out: string[] = [];
  const walk = (n: TreeNode) => {
    if (n.isDir && n.fullPath) out.push(n.fullPath);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

export type CheckState = "checked" | "unchecked" | "indeterminate";

export function dirCheckState(node: TreeNode, checked: Set<string>): CheckState {
  const paths = collectFilePaths(node);
  if (paths.length === 0) return "unchecked";
  let n = 0;
  for (const p of paths) if (checked.has(p)) n++;
  if (n === 0) return "unchecked";
  if (n === paths.length) return "checked";
  return "indeterminate";
}
