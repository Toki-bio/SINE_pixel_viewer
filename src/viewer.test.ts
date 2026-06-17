import { describe, expect, it } from 'vitest'
import { calculateAlignmentData } from './calculator'
import { defaultViewerSettings } from './model'
import { sampleConsensus, sampleCopies } from './sampleData'
import { buildRenderResult, filterSequences } from './viewer'

describe('SINE viewer data preparation', () => {
  const data = calculateAlignmentData(sampleConsensus, sampleCopies, { mode: 'full' })

  it('filters sequences by divergence range and id search', () => {
    const settings = defaultViewerSettings(data.consensusLength)
    settings.divergenceRange = [0, 2]
    settings.searchText = 'perfect'
    const filtered = filterSequences(data, settings)
    expect(filtered.map((sequence) => sequence.id)).toEqual(['SINE_001_perfect'])
  })

  it('builds an insertion-aware matrix for full mode', () => {
    const settings = defaultViewerSettings(data.consensusLength)
    settings.consensusWindow = [16, 32]
    const result = buildRenderResult(data, settings)
    expect(result.visibleSequences.length).toBeGreaterThan(0)
    expect(result.matrix).toHaveLength(result.visibleSequences.length)
    expect(result.columns.some((column) => column.insertOffset > 0)).toBe(true)
  })
})