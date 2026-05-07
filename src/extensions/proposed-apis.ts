/**
 * Renderer-side proposed API gating.
 *
 * Wraps an API surface with a Proxy that throws `ProposedApiError` if the
 * extension's manifest does not include the proposal name.
 */

export class ProposedApiError extends Error {
  constructor(public readonly proposalName: string) {
    super(
      `proposed API "${proposalName}" used without manifest entry. Add "${proposalName}" to mterminal.enabledApiProposals.`,
    )
    this.name = 'ProposedApiError'
  }
}

export function gateProposed<T extends object>(proposalName: string, enabled: boolean, impl: T): T {
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

export function isProposalEnabled(proposals: readonly string[], name: string): boolean {
  return proposals.includes(name)
}
