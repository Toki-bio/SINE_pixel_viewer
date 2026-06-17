import { parseFasta, readSingleConsensus, validateDnaRecord } from './fasta'
import {
  defaultCalculatorOptions,
  type AlignmentData,
  type AlignmentMode,
  type FastaRecord,
  type PixelCell,
  type SequenceAlignment,
  type SineCalculatorOptions,
} from './model'

interface AlignedPair {
  consensus: string[]
  query: string[]
}

type Direction = 'diag' | 'up' | 'left' | ''

const gap = '-'

export class SINECalculator {
  private consensus: FastaRecord
  private sequences: FastaRecord[]
  private options: Required<SineCalculatorOptions>

  constructor(consensusFasta: string, sequenceFasta: string, options: SineCalculatorOptions = {}) {
    this.consensus = readSingleConsensus(consensusFasta)
    this.sequences = parseFasta(sequenceFasta, 'copy')
    this.options = { ...defaultCalculatorOptions, ...options }
    this.validateInputs()
  }

  run(): AlignmentData {
    const minLength = Math.ceil(this.consensus.sequence.length * this.options.minSequenceLengthRatio)
    const lengths = this.sequences.map((record) => record.sequence.length)
    const retained = this.sequences
      .filter((record) => record.sequence.length >= minLength)
      .map((record) => this.alignRecord(record))

    return {
      consensusId: this.consensus.id,
      consensus: this.consensus.sequence,
      consensusLength: this.consensus.sequence.length,
      numSequences: retained.length,
      mode: this.options.mode,
      sequences: retained,
      stats: {
        sequenceCount: this.sequences.length,
        retainedCount: retained.length,
        skippedCount: this.sequences.length - retained.length,
        minLength: lengths.length ? Math.min(...lengths) : 0,
        maxLength: lengths.length ? Math.max(...lengths) : 0,
        meanLength: lengths.length ? lengths.reduce((sum, length) => sum + length, 0) / lengths.length : 0,
      },
      generatedAt: new Date().toISOString(),
      parameters: this.options,
    }
  }

  private validateInputs() {
    const errors = this.sequences.flatMap(validateDnaRecord)
    if (errors.length > 0) {
      throw new Error(errors.join('; '))
    }
  }

  private alignRecord(record: FastaRecord): SequenceAlignment {
    const aligned = this.options.mode === 'sub_only'
      ? directComparison(this.consensus.sequence, record.sequence)
      : alignNeedlemanWunsch(this.consensus.sequence, record.sequence, this.options.mode)

    return projectAlignment(record, this.consensus.sequence, aligned, this.options)
  }
}

export function alignNeedlemanWunsch(consensus: string, query: string, mode: AlignmentMode): AlignedPair {
  const rows = consensus.length + 1
  const columns = query.length + 1
  const scores = Array.from({ length: rows }, () => Array<number>(columns).fill(Number.NEGATIVE_INFINITY))
  const directions = Array.from({ length: rows }, () => Array<Direction>(columns).fill(''))
  const insertionPenalty = mode === 'sub_del' ? -10 : -2
  const deletionPenalty = -2

  scores[0][0] = 0
  for (let row = 1; row < rows; row += 1) {
    scores[row][0] = scores[row - 1][0] + deletionPenalty
    directions[row][0] = 'up'
  }
  for (let column = 1; column < columns; column += 1) {
    scores[0][column] = scores[0][column - 1] + insertionPenalty
    directions[0][column] = 'left'
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const matchScore = consensus[row - 1] === query[column - 1] ? 1 : -1
      const diag = scores[row - 1][column - 1] + matchScore
      const up = scores[row - 1][column] + deletionPenalty
      const left = scores[row][column - 1] + insertionPenalty
      const best = Math.max(diag, up, left)

      scores[row][column] = best
      directions[row][column] = best === diag ? 'diag' : best === up ? 'up' : 'left'
    }
  }

  const alignedConsensus: string[] = []
  const alignedQuery: string[] = []
  let row = consensus.length
  let column = query.length

  while (row > 0 || column > 0) {
    const direction = directions[row][column]
    if (direction === 'diag') {
      alignedConsensus.unshift(consensus[row - 1])
      alignedQuery.unshift(query[column - 1])
      row -= 1
      column -= 1
    } else if (direction === 'up') {
      alignedConsensus.unshift(consensus[row - 1])
      alignedQuery.unshift(gap)
      row -= 1
    } else {
      alignedConsensus.unshift(gap)
      alignedQuery.unshift(query[column - 1])
      column -= 1
    }
  }

  return { consensus: alignedConsensus, query: alignedQuery }
}

export function directComparison(consensus: string, query: string): AlignedPair {
  const alignedConsensus: string[] = []
  const alignedQuery: string[] = []
  const length = Math.max(consensus.length, query.length)

  for (let index = 0; index < length; index += 1) {
    alignedConsensus.push(consensus[index] ?? gap)
    alignedQuery.push(query[index] ?? gap)
  }

  return { consensus: alignedConsensus, query: alignedQuery }
}

function projectAlignment(
  record: FastaRecord,
  consensus: string,
  aligned: AlignedPair,
  options: Required<SineCalculatorOptions>,
): SequenceAlignment {
  const pixels: PixelCell[] = []
  let consensusPos = 0
  let currentInsertionAnchor = 1  // anchor leading insertions to position 1
  let currentInsertionOffset = 0
  let mismatches = 0
  let deletions = 0
  let deletionRunLength = 0
  let insertions = 0
  let observedConsensusColumns = 0

  for (let index = 0; index < aligned.consensus.length; index += 1) {
    const consensusBase = aligned.consensus[index]
    const queryBase = aligned.query[index]

    if (consensusBase === gap) {
      insertions += 1
      currentInsertionOffset += 1
      deletionRunLength = 0
      if (options.mode === 'full' && currentInsertionOffset <= options.maxInsLength) {
        pixels.push({
          consensusPos: currentInsertionAnchor,
          insertOffset: currentInsertionOffset,
          state: 'ins',
          base: queryBase,
          consensusBase: gap,
        })
      }
      continue
    }

    consensusPos += 1
    currentInsertionAnchor = consensusPos
    currentInsertionOffset = 0

    if (queryBase === gap) {
      deletions += 1
      deletionRunLength += 1
      if (deletionRunLength <= options.maxDelLength) {
        pixels.push({
          consensusPos,
          insertOffset: 0,
          state: 'del',
          base: gap,
          consensusBase,
        })
      }
      continue
    }

    deletionRunLength = 0
    observedConsensusColumns += 1
    const state = queryBase === consensusBase ? 'match' : 'mismatch'
    if (state === 'mismatch') {
      mismatches += 1
    }
    pixels.push({
      consensusPos,
      insertOffset: 0,
      state,
      base: queryBase,
      consensusBase,
    })
  }

  const denominator = consensus.length || 1
  const indels = insertions + deletions
  return {
    id: record.id,
    pixels,
    divergence: ((mismatches + indels) / denominator) * 100,
    divergenceSubstitution: (mismatches / denominator) * 100,
    divergenceIndel: (indels / denominator) * 100,
    alignedCoverage: (observedConsensusColumns / denominator) * 100,
    numIndels: indels,
    length: record.sequence.length,
  }
}

export function calculateAlignmentData(consensusFasta: string, sequenceFasta: string, options: SineCalculatorOptions = {}) {
  return new SINECalculator(consensusFasta, sequenceFasta, options).run()
}