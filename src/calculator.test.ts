import { describe, expect, it } from 'vitest'
import { alignNeedlemanWunsch, calculateAlignmentData } from './calculator'
import { parseFasta } from './fasta'
import { sampleConsensus, sampleCopies } from './sampleData'

describe('FASTA parsing', () => {
  it('parses multiple records and normalizes sequence case', () => {
    const records = parseFasta('>a\nacgt\n>b note\nNNaa')
    expect(records).toEqual([
      { id: 'a', sequence: 'ACGT' },
      { id: 'b', sequence: 'NNAA' },
    ])
  })
})

describe('SINE calculator', () => {
  it('projects substitution/deletion mode into consensus coordinates', () => {
    const data = calculateAlignmentData(sampleConsensus, sampleCopies, { mode: 'sub_del' })
    expect(data.consensusLength).toBe(64)
    expect(data.numSequences).toBe(8)
    expect(data.sequences[0].divergence).toBe(0)
    expect(data.sequences.some((sequence) => sequence.pixels.some((pixel) => pixel.state === 'del'))).toBe(true)
    expect(data.sequences.every((sequence) => sequence.pixels.every((pixel) => pixel.insertOffset === 0))).toBe(true)
  })

  it('keeps virtual insertion slots in full mode', () => {
    const data = calculateAlignmentData(sampleConsensus, sampleCopies, { mode: 'full', maxInsLength: 8 })
    const inserted = data.sequences.find((sequence) => sequence.id === 'SINE_004_insertion')
    expect(inserted?.pixels.some((pixel) => pixel.state === 'ins' && pixel.insertOffset > 0)).toBe(true)
  })

  it('rejects invalid DNA characters', () => {
    expect(() => calculateAlignmentData(sampleConsensus, '>bad\nACGTX')).toThrow(/non-DNA/)
  })

  it('uses insertion-heavy scoring for sub_del mode', () => {
    const aligned = alignNeedlemanWunsch('AAAA', 'AATA', 'sub_del')
    expect(aligned.consensus).toHaveLength(aligned.query.length)
    expect(aligned.consensus.join('')).not.toContain('-')
  })
})