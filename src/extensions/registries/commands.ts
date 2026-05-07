/**
 * Command registry — singleton across the renderer.
 *
 * Plugins register commands via `ctx.commands.register({ id, title, run })`.
 * The registry tracks the source extension (or 'core') so the Plugin Manager
 * and Command Palette can attribute and disable as needed.
 *
 * `id` is global and must be unique. Convention: `<extId>.<verb>` for plugin
 * commands (e.g. `git.commit`, `gh.checkoutPr`). Core commands use bare names.
 */

import type { CommandSpec, Disposable } from '../ctx-types'

export interface CommandEntry {
  id: string
  title?: string
  source: 'core' | string
  run(args?: unknown): unknown | Promise<unknown>
}

type Listener = () => void

export class CommandRegistry {
  private commands = new Map<string, CommandEntry>()
  private listeners = new Set<Listener>()

  register(spec: CommandSpec & { source: 'core' | string }): Disposable {
    if (this.commands.has(spec.id)) {
      const existing = this.commands.get(spec.id)!
      console.warn(
        `[ext] command "${spec.id}" already registered by "${existing.source}", replacing with "${spec.source}"`,
      )
    }
    this.commands.set(spec.id, {
      id: spec.id,
      title: spec.title,
      source: spec.source,
      run: spec.run,
    })
    this.fire()
    return {
      dispose: () => {
        const cur = this.commands.get(spec.id)
        if (cur && cur.run === spec.run) {
          this.commands.delete(spec.id)
          this.fire()
        }
      },
    }
  }

  /** Stub a declarative command from a manifest BEFORE the plugin activates. */
  registerStub(opts: {
    id: string
    title?: string
    source: string
    onInvoke(): Promise<void>
  }): Disposable {
    return this.register({
      id: opts.id,
      title: opts.title,
      source: opts.source,
      run: async () => {
        await opts.onInvoke()
        // After activation, the real handler should be registered. Re-execute.
        const real = this.commands.get(opts.id)
        if (real && real.run !== opts.onInvoke) {
          return real.run()
        }
        return undefined
      },
    })
  }

  has(id: string): boolean {
    return this.commands.has(id)
  }

  list(): CommandEntry[] {
    return Array.from(this.commands.values())
  }

  async execute<T = unknown>(id: string, args?: unknown): Promise<T> {
    const entry = this.commands.get(id)
    if (!entry) throw new Error(`unknown command: ${id}`)
    return (await entry.run(args)) as T
  }

  /** Drop all commands contributed by a single extension (on deactivate). */
  removeBySource(source: string): void {
    let changed = false
    for (const [id, entry] of this.commands) {
      if (entry.source === source) {
        this.commands.delete(id)
        changed = true
      }
    }
    if (changed) this.fire()
  }

  subscribe(cb: Listener): Disposable {
    this.listeners.add(cb)
    return { dispose: () => this.listeners.delete(cb) }
  }

  private fire(): void {
    for (const cb of this.listeners) {
      try {
        cb()
      } catch {
        /* ignore */
      }
    }
  }
}

let cmdInstance: CommandRegistry | null = null
export function getCommandRegistry(): CommandRegistry {
  if (!cmdInstance) cmdInstance = new CommandRegistry()
  return cmdInstance
}
