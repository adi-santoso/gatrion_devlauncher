import { describe, expect, it } from 'vitest'
import { estimateCost, formatCost } from '../costEstimate'

describe('estimateCost', () => {
  it('computes itemized cost from prompt/completion tokens', () => {
    // anthropic/claude-sonnet: $3 / 1M input, $15 / 1M output
    const cost = estimateCost('anthropic/claude-sonnet-4-20250514', { prompt: 1000000, completion: 1000000 })
    expect(cost.input).toBeCloseTo(3)
    expect(cost.output).toBeCloseTo(15)
    expect(cost.total).toBeCloseTo(18)
  })

  it('matches the most specific known tier', () => {
    expect(estimateCost('openai/gpt-4o-mini', { prompt: 1e6, completion: 1e6 }).total).toBeCloseTo(12.5)
    expect(estimateCost('openai/gpt-4.1-mini', { prompt: 1e6, completion: 1e6 }).total).toBeCloseTo(10)
  })

  it('uses the blended fallback for unknown models', () => {
    const cost = estimateCost('some-provider/custom-model', { total: 1000000 })
    // fallback $1/$3 blended = $2 per 1M
    expect(cost.total).toBeCloseTo(2)
  })

  it('falls back to blended pricing when only a total is given', () => {
    const cost = estimateCost('anthropic/claude-haiku-4', { total: 1000000 })
    // haiku $0.8/$4 blended = $2.4 per 1M
    expect(cost.total).toBeCloseTo(2.4)
  })

  it('is zero for no tokens and handles a missing model ref', () => {
    expect(estimateCost(null, {}).total).toBe(0)
    expect(estimateCost(undefined, { prompt: 0, completion: 0 }).total).toBe(0)
  })
})

describe('formatCost', () => {
  it('renders tiny amounts as <$0.01 and rounds the rest', () => {
    expect(formatCost(0)).toBe('$0.00')
    expect(formatCost(0.001)).toBe('<$0.01')
    expect(formatCost(0.123)).toBe('$0.12')
    expect(formatCost(1.5)).toBe('$1.50')
  })
})
