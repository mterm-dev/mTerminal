/**
 * Gating for `@proposed` APIs.
 *
 * A plugin opts into a proposal by listing it in the manifest:
 *   "enabledApiProposals": ["terminalRawOutput"]
 *
 * The renderer host wraps each proposed sub-API in a Proxy that consults
 * `isProposalEnabled(extId, name)` before forwarding. False → throw
 * `ProposedApiError`.
 *
 * Main and renderer share this list-of-strings model. We don't validate the
 * names against a host-side allowlist by default — that becomes useful once
 * proposals are versioned. For v1 we trust the manifest field, since the
 * Plugin Manager renders a "uses proposed: <name>" warning chip anyway.
 */

export class ProposedApiError extends Error {
  constructor(public readonly proposalName: string) {
    super(
      `proposed API "${proposalName}" used without manifest entry. Add "${proposalName}" to mterminal.enabledApiProposals.`,
    )
    this.name = 'ProposedApiError'
  }
}

export function isProposalEnabled(
  manifestProposals: readonly string[],
  proposalName: string,
): boolean {
  return manifestProposals.includes(proposalName)
}

export function gateProposed<T extends object>(
  proposalName: string,
  enabled: boolean,
  impl: T,
): T {
  if (enabled) return impl
  return new Proxy(impl, {
    get() {
      throw new ProposedApiError(proposalName)
    },
    apply() {
      throw new ProposedApiError(proposalName)
    },
  }) as T
}

/**
 * Known proposal names. Adding a new proposal requires:
 *   1. Define the API surface in `packages/extension-api/src/proposed.d.ts`
 *   2. Implement it on the host
 *   3. Add the name here
 */
export const KNOWN_PROPOSALS = [
  'terminalRawOutput',
  'terminalProcessTree',
  'workspaceMutations',
] as const

export type ProposalName = (typeof KNOWN_PROPOSALS)[number]

export function validateProposals(names: readonly string[]): {
  valid: ProposalName[]
  unknown: string[]
} {
  const valid: ProposalName[] = []
  const unknown: string[] = []
  for (const n of names) {
    if ((KNOWN_PROPOSALS as readonly string[]).includes(n)) valid.push(n as ProposalName)
    else unknown.push(n)
  }
  return { valid, unknown }
}
