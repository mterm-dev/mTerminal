/**
 * Keybinding registry. Captures key combinations on `window` and dispatches
 * to the matching command, gated by an optional `when` clause.
 *
 * Key syntax (cross-platform):
 *   `Ctrl+Shift+P`, `Cmd+Enter`, `Alt+`, `Escape`
 *   - `Cmd` aliases to `Meta` on macOS and `Ctrl` elsewhere.
 *   - case-insensitive
 *
 * Conflicts: last registration wins. The Plugin Manager surfaces a "shadowed
 * keybinding" warning when two extensions claim the same shortcut.
 */

import type { Disposable, KeybindingSpec } from '../ctx-types'
import { getCommandRegistry } from './commands'

interface BindingEntry extends KeybindingSpec {
  source: string
  parsed: ParsedKey
}

interface ParsedKey {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  key: string
}

type WhenEvaluator = (when: string | undefined) => boolean

let whenEvaluator: WhenEvaluator = () => true

export function setKeybindingWhenEvaluator(fn: WhenEvaluator): void {
  whenEvaluator = fn
}

export class KeybindingRegistry {
  private bindings: BindingEntry[] = []
  private bound = false

  ensureBound(): void {
    if (this.bound || typeof window === 'undefined') return
    this.bound = true
    window.addEventListener('keydown', this.handle, true)
  }

  unbind(): void {
    if (!this.bound || typeof window === 'undefined') return
    window.removeEventListener('keydown', this.handle, true)
    this.bound = false
  }

  register(spec: KeybindingSpec & { source: string }): Disposable {
    this.ensureBound()
    const entry: BindingEntry = { ...spec, parsed: parseKey(spec.key) }
    this.bindings.push(entry)
    return {
      dispose: () => {
        const i = this.bindings.indexOf(entry)
        if (i >= 0) this.bindings.splice(i, 1)
      },
    }
  }

  removeBySource(source: string): void {
    this.bindings = this.bindings.filter((b) => b.source !== source)
  }

  private handle = (e: KeyboardEvent): void => {
    if (!this.bindings.length) return
    for (let i = this.bindings.length - 1; i >= 0; i--) {
      const b = this.bindings[i]
      if (!matches(e, b.parsed)) continue
      if (!whenEvaluator(b.when)) continue
      e.preventDefault()
      e.stopPropagation()
      void getCommandRegistry().execute(b.command, b.args).catch((err) => {
        console.error(`[ext keybinding] command "${b.command}" failed:`, err)
      })
      return
    }
  }
}

function parseKey(combo: string): ParsedKey {
  const parts = combo.split('+').map((p) => p.trim().toLowerCase())
  const out: ParsedKey = { ctrl: false, shift: false, alt: false, meta: false, key: '' }
  const isMac = typeof navigator !== 'undefined' && /mac|darwin/i.test(navigator.platform || '')
  for (const p of parts) {
    if (p === 'ctrl') out.ctrl = true
    else if (p === 'shift') out.shift = true
    else if (p === 'alt' || p === 'option') out.alt = true
    else if (p === 'meta' || p === 'cmd' || p === 'super' || p === 'win') {
      if (p === 'cmd' && !isMac) out.ctrl = true
      else out.meta = true
    } else out.key = p
  }
  return out
}

function matches(e: KeyboardEvent, p: ParsedKey): boolean {
  return (
    e.ctrlKey === p.ctrl &&
    e.shiftKey === p.shift &&
    e.altKey === p.alt &&
    e.metaKey === p.meta &&
    e.key.toLowerCase() === p.key
  )
}

let kbInstance: KeybindingRegistry | null = null
export function getKeybindingRegistry(): KeybindingRegistry {
  if (!kbInstance) kbInstance = new KeybindingRegistry()
  return kbInstance
}
