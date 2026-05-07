/**
 * Proposed (experimental) APIs.
 *
 * These are subject to change without notice. Plugins that use them MUST
 * declare each used proposal in their manifest:
 *
 *   "mterminal": { "enabledApiProposals": ["terminalRawOutput"] }
 *
 * Calling a proposed API without the corresponding flag throws `ProposedApiError`.
 *
 * Promotion path: once stable, a proposal is moved into `index.d.ts` and the
 * proposal entry is kept here for one release as a deprecated re-export, then
 * removed. Plugins should drop the flag at that point.
 */

import type { Disposable, ExtensionContext } from './index'

// ─────────────────────────────────────────────────────────────────────────────
// Proposal: terminalRawOutput
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to raw, un-throttled terminal output. The default
 * `ctx.terminal.byId(...).onData(...)` is throttled to ~30Hz and chunk-batched.
 *
 * This proposal exposes per-byte streaming. High-volume sessions can saturate
 * the renderer; use `ctx.decorators.skip(tabId)` or your own throttle.
 */
export interface TerminalRawOutputProposal {
  onRawOutput(
    tabId: number,
    cb: (chunk: string) => void,
  ): Disposable
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposal: terminalProcessTree
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inspect the process tree under a terminal's root PTY. Useful for "is the
 * shell idle" detection or attaching context to a foreground process.
 */
export interface TerminalProcessTreeProposal {
  getProcessTree(tabId: number): Promise<{
    rootPid: number
    foregroundPid: number | null
    processes: Array<{ pid: number; ppid: number; cmd: string }>
  }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposal: workspaceMutations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mutate workspace state (groups, layout). Currently the renderer host owns
 * layout; this proposal is on track for stabilization once the API has been
 * exercised by at least one production extension.
 */
export interface WorkspaceMutationsProposal {
  createGroup(label: string): Promise<string>
  closeGroup(id: string): Promise<void>
  moveTabToGroup(tabId: number, groupId: string): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Augmentation
// ─────────────────────────────────────────────────────────────────────────────

declare module './index' {
  interface ExtensionContext {
    /** @proposed terminalRawOutput */
    readonly terminalRaw?: TerminalRawOutputProposal
    /** @proposed terminalProcessTree */
    readonly terminalProcessTree?: TerminalProcessTreeProposal
    /** @proposed workspaceMutations */
    readonly workspaceMutations?: WorkspaceMutationsProposal
  }
}

export type ProposalName =
  | 'terminalRawOutput'
  | 'terminalProcessTree'
  | 'workspaceMutations'

export type { ExtensionContext }
