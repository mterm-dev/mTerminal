import { describe, expect, it } from 'vitest'
import {
  ProposedApiError,
  gateProposed,
  isProposalEnabled,
  validateProposals,
} from '../../electron/main/extensions/proposed-apis'

describe('proposed APIs', () => {
  it('passes through when proposal is enabled', () => {
    const impl = { foo: () => 42 }
    const gated = gateProposed('terminalRawOutput', true, impl)
    expect(gated.foo()).toBe(42)
  })

  it('throws ProposedApiError when proposal is not enabled', () => {
    const impl = { foo: () => 42 }
    const gated = gateProposed('terminalRawOutput', false, impl)
    expect(() => gated.foo()).toThrowError(ProposedApiError)
  })

  it('isProposalEnabled checks manifest list', () => {
    expect(isProposalEnabled(['terminalRawOutput'], 'terminalRawOutput')).toBe(true)
    expect(isProposalEnabled([], 'terminalRawOutput')).toBe(false)
  })

  it('validateProposals splits known from unknown', () => {
    const result = validateProposals(['terminalRawOutput', 'gibberishApi', 'workspaceMutations'])
    expect(result.valid).toContain('terminalRawOutput')
    expect(result.valid).toContain('workspaceMutations')
    expect(result.unknown).toContain('gibberishApi')
  })
})
