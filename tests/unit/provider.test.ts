import { describe, it, expect } from 'vitest'
import { estimateCost } from '../../electron/main/ai/provider'

describe('estimateCost', () => {
  describe('anthropic', () => {
    it('opus-4: 1M in @ $15, 1M out @ $75', () => {
      expect(
        estimateCost('anthropic', 'claude-opus-4', 1_000_000, 0)
      ).toBeCloseTo(15.0, 6)
      expect(
        estimateCost('anthropic', 'claude-opus-4', 0, 1_000_000)
      ).toBeCloseTo(75.0, 6)
      expect(
        estimateCost('anthropic', 'claude-opus-4-1', 1_000_000, 1_000_000)
      ).toBeCloseTo(90.0, 6)
    })

    it('sonnet: 1M in @ $3, 1M out @ $15', () => {
      expect(
        estimateCost('anthropic', 'claude-sonnet-4', 1_000_000, 0)
      ).toBeCloseTo(3.0, 6)
      expect(
        estimateCost('anthropic', 'claude-sonnet-4', 0, 1_000_000)
      ).toBeCloseTo(15.0, 6)
    })

    it('haiku: 1M in @ $0.8, 1M out @ $4', () => {
      expect(
        estimateCost('anthropic', 'claude-haiku-4', 1_000_000, 0)
      ).toBeCloseTo(0.8, 6)
      expect(
        estimateCost('anthropic', 'claude-haiku-4', 0, 1_000_000)
      ).toBeCloseTo(4.0, 6)
    })

    it('unknown anthropic model defaults to sonnet pricing', () => {
      expect(
        estimateCost('anthropic', 'mystery-model', 1_000_000, 1_000_000)
      ).toBeCloseTo(18.0, 6)
    })
  })

  describe('openai', () => {
    it('gpt-5: 1M in @ $15, 1M out @ $60', () => {
      expect(estimateCost('openai', 'gpt-5', 1_000_000, 0)).toBeCloseTo(15.0, 6)
      expect(estimateCost('openai', 'gpt-5', 0, 1_000_000)).toBeCloseTo(60.0, 6)
    })

    it('o1: same as gpt-5 tier', () => {
      expect(estimateCost('openai', 'o1', 1_000_000, 1_000_000)).toBeCloseTo(
        75.0,
        6
      )
      expect(
        estimateCost('openai', 'o1-preview', 1_000_000, 1_000_000)
      ).toBeCloseTo(75.0, 6)
    })

    it('gpt-4: 1M in @ $5, 1M out @ $15', () => {
      expect(estimateCost('openai', 'gpt-4', 1_000_000, 0)).toBeCloseTo(5.0, 6)
      expect(estimateCost('openai', 'gpt-4o', 0, 1_000_000)).toBeCloseTo(
        15.0,
        6
      )
    })

    it('mini: 1M in @ $0.15, 1M out @ $0.6', () => {
      expect(
        estimateCost('openai', 'something-mini', 1_000_000, 0)
      ).toBeCloseTo(0.15, 6)
      expect(
        estimateCost('openai', 'something-mini', 0, 1_000_000)
      ).toBeCloseTo(0.6, 6)
    })

    it('unknown openai model defaults to gpt-4 tier', () => {
      expect(
        estimateCost('openai', 'totally-unknown', 1_000_000, 1_000_000)
      ).toBeCloseTo(20.0, 6)
    })
  })

  describe('other providers', () => {
    it('ollama returns 0', () => {
      expect(
        estimateCost('ollama', 'llama3', 1_000_000, 1_000_000)
      ).toBeCloseTo(0, 6)
    })

    it('arbitrary unknown provider returns 0', () => {
      expect(
        estimateCost('made-up', 'whatever', 5_000_000, 5_000_000)
      ).toBeCloseTo(0, 6)
    })
  })

  describe('math', () => {
    it('zero tokens → 0', () => {
      expect(estimateCost('anthropic', 'sonnet', 0, 0)).toBeCloseTo(0, 6)
      expect(estimateCost('openai', 'gpt-4', 0, 0)).toBeCloseTo(0, 6)
    })

    it('500_000 in tokens at $3/M = $1.50', () => {
      expect(estimateCost('anthropic', 'sonnet', 500_000, 0)).toBeCloseTo(
        1.5,
        6
      )
    })
  })
})
