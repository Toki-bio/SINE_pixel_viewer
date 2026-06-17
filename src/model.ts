export type AlignmentMode = 'full' | 'sub_del' | 'sub_only'

export type PixelState = 'match' | 'mismatch' | 'ins' | 'del' | 'missing'

export type SortMode = 'input' | 'id' | 'divergence-asc' | 'divergence-desc'

export type ColorSchemeName = 'classic' | 'accessible' | 'grayscale'

export interface FastaRecord {
  id: string
  sequence: string
}

export interface SineCalculatorOptions {
  mode?: AlignmentMode
  maxInsLength?: number
  maxDelLength?: number
  minSequenceLengthRatio?: number
}

export interface PixelCell {
  consensusPos: number
  insertOffset: number
  state: PixelState
  base: string
  consensusBase: string
}

export interface SequenceAlignment {
  id: string
  pixels: PixelCell[]
  divergence: number
  divergenceSubstitution: number
  divergenceIndel: number
  alignedCoverage: number
  numIndels: number
  length: number
}

export interface BasicStats {
  sequenceCount: number
  retainedCount: number
  skippedCount: number
  minLength: number
  maxLength: number
  meanLength: number
}

export interface AlignmentData {
  consensusId: string
  consensus: string
  consensusLength: number
  numSequences: number
  mode: AlignmentMode
  sequences: SequenceAlignment[]
  stats: BasicStats
  generatedAt: string
  parameters: Required<SineCalculatorOptions>
}

export interface ViewerSettings {
  selectedIds: Set<string>
  divergenceRange: [number, number]
  topN: number
  bottomN: number
  randomN: number
  maxSequences: number
  consensusWindow: [number, number]
  pixelSize: number
  colorScheme: ColorSchemeName
  showConsensus: boolean
  showDivergence: boolean
  sortMode: SortMode
  searchText: string
  maxInsertionDisplayLength: number
  collapseDeletionLength: number
  gapThreshold: number
}

export interface RenderResult {
  visibleSequences: SequenceAlignment[]
  columns: PixelColumn[]
  matrix: PixelState[][]
}

export interface PixelColumn {
  consensusPos: number
  insertOffset: number
  label: string
}

export const defaultCalculatorOptions: Required<SineCalculatorOptions> = {
  mode: 'sub_del',
  maxInsLength: 50,
  maxDelLength: 100,
  minSequenceLengthRatio: 0.5,
}

export const defaultViewerSettings = (consensusLength: number): ViewerSettings => ({
  selectedIds: new Set(),
  divergenceRange: [0, 100],
  topN: 0,
  bottomN: 0,
  randomN: 0,
  maxSequences: 500,
  consensusWindow: [1, consensusLength],
  pixelSize: 4,
  colorScheme: 'accessible',
  showConsensus: true,
  showDivergence: true,
  sortMode: 'divergence-asc',
  searchText: '',
  maxInsertionDisplayLength: 20,
  collapseDeletionLength: 20,
  gapThreshold: 1,
})