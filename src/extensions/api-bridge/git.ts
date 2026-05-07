/**
 * `ctx.git` — thin wrapper over `window.mt.git`.
 *
 * The wrapper exists so that the public extension API stays stable even if we
 * refactor the underlying IPC surface.
 */

import type { Disposable, GitApi } from '../ctx-types'

interface MtGit {
  status?: (cwd: string) => Promise<unknown>
  diff?: (args: unknown) => Promise<{ text: string; truncated: boolean }>
  stage?: (args: unknown) => Promise<void>
  unstage?: (args: unknown) => Promise<void>
  commit?: (args: unknown) => Promise<{ commit: string }>
  push?: (args: unknown) => Promise<void>
  pull?: (args: unknown) => Promise<void>
  fetch?: (args: unknown) => Promise<void>
  branches?: (cwd: string) => Promise<Array<{ name: string; current: boolean; remote: string | null }>>
}

export function createGitBridge(): GitApi {
  const mt = (): MtGit => (window.mt as unknown as { git?: MtGit }).git ?? {}

  return {
    async status(cwd) {
      const fn = mt().status
      if (!fn) throw new Error('git surface not available')
      return fn(cwd)
    },
    async diff(cwd, path, staged) {
      const fn = mt().diff
      if (!fn) throw new Error('git surface not available')
      return fn({ cwd, path, staged })
    },
    async stage(cwd, paths) {
      const fn = mt().stage
      if (!fn) throw new Error('git surface not available')
      await fn({ cwd, paths })
    },
    async unstage(cwd, paths) {
      const fn = mt().unstage
      if (!fn) throw new Error('git surface not available')
      await fn({ cwd, paths })
    },
    async commit(cwd, message, paths) {
      const fn = mt().commit
      if (!fn) throw new Error('git surface not available')
      return fn({ cwd, message, paths })
    },
    async push(cwd, remote, branch) {
      const fn = mt().push
      if (!fn) throw new Error('git surface not available')
      await fn({ cwd, remote, branch })
    },
    async pull(cwd, strategy) {
      const fn = mt().pull
      if (!fn) throw new Error('git surface not available')
      await fn({ cwd, strategy })
    },
    async fetch(cwd) {
      const fn = mt().fetch
      if (!fn) throw new Error('git surface not available')
      await fn({ cwd })
    },
    async branches(cwd) {
      const fn = mt().branches
      if (!fn) throw new Error('git surface not available')
      return fn(cwd)
    },
    registerAuthProvider(_p: unknown): Disposable {
      // Not implemented in v1 — git auth happens via OS credential helpers.
      console.warn('[ext git] registerAuthProvider is a no-op in v1')
      return { dispose: () => {} }
    },
  }
}
