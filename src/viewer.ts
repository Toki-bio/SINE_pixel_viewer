import type {
  AlignmentData,
  PixelColumn,
  PixelState,
  RenderResult,
  SequenceAlignment,
  SortMode,
  ViewerSettings,
} from './model'

export const colorSchemes: Record<string, Record<PixelState, string>> = {
  accessible: {
    match: '#3f6b54',
    mismatch: '#d55e00',
    ins: '#0072b2',
    del: '#e6b800',
    missing: '#ece8dd',
  },
  classic: {
    match: '#35a853',
    mismatch: '#e53935',
    ins: '#1e88e5',
    del: '#fdd835',
    missing: '#f2f2f2',
  },
  grayscale: {
    match: '#1f1f1f',
    mismatch: '#686868',
    ins: '#a0a0a0',
    del: '#d8d8d8',
    missing: '#f4f4f4',
  },
}

export function filterSequences(data: AlignmentData, settings: ViewerSettings): SequenceAlignment[] {
  let sequences = data.sequences.filter((sequence) => {
    const selectedMatch = settings.selectedIds.size === 0 || settings.selectedIds.has(sequence.id)
    const divergenceMatch = sequence.divergence >= settings.divergenceRange[0]
      && sequence.divergence <= settings.divergenceRange[1]
    const searchMatch = !settings.searchText || sequence.id.toLowerCase().includes(settings.searchText.toLowerCase())
    return selectedMatch && divergenceMatch && searchMatch
  })

  sequences = sortSequences(sequences, settings.sortMode)

  if (settings.topN > 0) {
    sequences = [...sequences].sort((a, b) => a.divergence - b.divergence).slice(0, settings.topN)
  }
  if (settings.bottomN > 0) {
    sequences = [...sequences].sort((a, b) => b.divergence - a.divergence).slice(0, settings.bottomN)
  }
  if (settings.randomN > 0) {
    sequences = deterministicSample(sequences, settings.randomN)
  }

  return sequences.slice(0, settings.maxSequences)
}

export function buildRenderResult(data: AlignmentData, settings: ViewerSettings): RenderResult {
  const visibleSequences = filterSequences(data, settings)
  const [windowStart, windowEnd] = settings.consensusWindow
  const columns: PixelColumn[] = []

  for (let consensusPos = windowStart; consensusPos <= windowEnd; consensusPos += 1) {
    columns.push({ consensusPos, insertOffset: 0, label: String(consensusPos) })
    if (data.mode === 'full') {
      const maxOffset = Math.min(settings.maxInsertionDisplayLength, maxInsertionOffset(visibleSequences, consensusPos))
      for (let insertOffset = 1; insertOffset <= maxOffset; insertOffset += 1) {
        columns.push({ consensusPos, insertOffset, label: `${consensusPos}+${insertOffset}` })
      }
    }
  }

  const matrix = visibleSequences.map((sequence) => {
    const lookup = new Map(sequence.pixels.map((pixel) => [`${pixel.consensusPos}:${pixel.insertOffset}`, pixel.state]))
    return columns.map((column) => lookup.get(`${column.consensusPos}:${column.insertOffset}`) ?? 'missing')
  })

  return { visibleSequences, columns, matrix }
}

export class SINEViewer {
  private data: AlignmentData
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private lastResult: RenderResult | null = null
  private hoveredCell: { row: number, column: number } | null = null

  constructor(data: AlignmentData, canvas: HTMLCanvasElement) {
    this.data = data
    this.canvas = canvas
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D context is unavailable')
    }
    this.context = context
  }

  render(settings: ViewerSettings): RenderResult {
    const result = buildRenderResult(this.data, settings)
    this.lastResult = result
    const palette = colorSchemes[settings.colorScheme] ?? colorSchemes.accessible
    const leftPad = 168
    const topPad = settings.showConsensus ? 42 : 24
    const rightPad = settings.showDivergence ? 96 : 24
    const bottomPad = 44
    const rowHeight = Math.max(3, settings.pixelSize)
    const columnWidth = Math.max(1, settings.pixelSize)
    const width = Math.max(640, leftPad + result.columns.length * columnWidth + rightPad)
    const height = Math.max(280, topPad + result.visibleSequences.length * rowHeight + bottomPad)

    this.canvas.width = width
    this.canvas.height = height
    this.context.clearRect(0, 0, width, height)
    this.context.fillStyle = '#fbfaf4'
    this.context.fillRect(0, 0, width, height)

    this.drawConsensus(settings, result, leftPad, columnWidth)
    this.drawLabels(result, leftPad, topPad, rowHeight)
    this.drawMatrix(result, palette, leftPad, topPad, rowHeight, columnWidth)
    if (settings.showDivergence) {
      this.drawDivergenceBars(result, leftPad + result.columns.length * columnWidth + 16, topPad, rowHeight)
    }
    this.drawAxes(result, leftPad, topPad, rowHeight, columnWidth)
    this.drawHover(leftPad, topPad, rowHeight, columnWidth)

    return result
  }

  setHoverFromPoint(x: number, y: number, settings: ViewerSettings): string {
    if (!this.lastResult) {
      return ''
    }
    const topPad = settings.showConsensus ? 42 : 24
    const leftPad = 168
    const rowHeight = Math.max(3, settings.pixelSize)
    const columnWidth = Math.max(1, settings.pixelSize)
    const row = Math.floor((y - topPad) / rowHeight)
    const column = Math.floor((x - leftPad) / columnWidth)

    if (row < 0 || column < 0 || row >= this.lastResult.visibleSequences.length || column >= this.lastResult.columns.length) {
      this.hoveredCell = null
      return ''
    }

    this.hoveredCell = { row, column }
    const sequence = this.lastResult.visibleSequences[row]
    const renderColumn = this.lastResult.columns[column]
    const pixel = sequence.pixels.find((cell) => cell.consensusPos === renderColumn.consensusPos && cell.insertOffset === renderColumn.insertOffset)
    const state = pixel?.state ?? 'missing'
    const base = pixel?.base ?? '-'
    return `${sequence.id} | ${renderColumn.label} | ${state} | base ${base} | div ${sequence.divergence.toFixed(1)}%`
  }

  exportPng(filename = 'sine-pixel-alignment.png') {
    const link = document.createElement('a')
    link.download = filename
    link.href = this.canvas.toDataURL('image/png')
    link.click()
  }

  private drawConsensus(settings: ViewerSettings, result: RenderResult, leftPad: number, columnWidth: number) {
    if (!settings.showConsensus) return
    // At small pixel sizes show tick marks with position numbers instead of individual bases
    this.context.fillStyle = '#24231f'
    this.context.font = '11px "IBM Plex Mono", Consolas, monospace'
    this.context.textBaseline = 'top'
    const minGapPx = 32
    const interval = Math.max(10, Math.ceil(minGapPx / columnWidth / 10) * 10)
    result.columns.forEach((column, index) => {
      if (column.insertOffset !== 0) return
      const pos = column.consensusPos
      if (columnWidth >= 8) {
        const base = this.data.consensus[pos - 1] ?? ''
        this.context.fillText(base, leftPad + index * columnWidth, 12)
      } else if (pos === 1 || pos % interval === 0) {
        const x = leftPad + index * columnWidth
        this.context.fillStyle = '#5d574c'
        this.context.fillRect(x, 6, Math.max(1, columnWidth), 10)
        this.context.fillStyle = '#24231f'
        this.context.fillText(String(pos), x + 2, 18)
      }
    })
  }

  private drawLabels(result: RenderResult, leftPad: number, topPad: number, rowHeight: number) {
    this.context.fillStyle = '#3d3a34'
    this.context.font = '11px "IBM Plex Mono", Consolas, monospace'
    this.context.textBaseline = 'middle'
    const maxLabelWidth = leftPad - 24
    result.visibleSequences.forEach((sequence, row) => {
      if (rowHeight >= 7 || row % Math.ceil(9 / rowHeight) === 0) {
        let label = sequence.id
        if (this.context.measureText(label).width > maxLabelWidth) {
          while (label.length > 3 && this.context.measureText(label + '\u2026').width > maxLabelWidth) {
            label = label.slice(0, -1)
          }
          label += '\u2026'
        }
        this.context.fillText(label, 14, topPad + row * rowHeight + rowHeight / 2)
      }
    })
    this.context.strokeStyle = '#d6d0c2'
    this.context.beginPath()
    this.context.moveTo(leftPad - 6, topPad)
    this.context.lineTo(leftPad - 6, topPad + result.visibleSequences.length * rowHeight)
    this.context.stroke()
  }

  private drawMatrix(
    result: RenderResult,
    palette: Record<PixelState, string>,
    leftPad: number,
    topPad: number,
    rowHeight: number,
    columnWidth: number,
  ) {
    result.matrix.forEach((row, rowIndex) => {
      row.forEach((state, columnIndex) => {
        this.context.fillStyle = palette[state]
        this.context.fillRect(leftPad + columnIndex * columnWidth, topPad + rowIndex * rowHeight, columnWidth, rowHeight)
      })
    })
  }

  private drawDivergenceBars(result: RenderResult, x: number, topPad: number, rowHeight: number) {
    this.context.fillStyle = '#d8d1c1'
    const barHeight = Math.max(2, rowHeight - 1)
    const barYOffset = (rowHeight - barHeight) / 2
    result.visibleSequences.forEach((sequence, row) => {
      const width = Math.min(72, sequence.divergence * 2)
      this.context.fillRect(x, topPad + row * rowHeight + barYOffset, width, barHeight)
    })
    this.context.fillStyle = '#3d3a34'
    this.context.font = '10px "IBM Plex Mono", Consolas, monospace'
    this.context.textBaseline = 'bottom'
    this.context.fillText('%div', x, Math.max(14, topPad - 4))
  }

  private drawAxes(result: RenderResult, leftPad: number, topPad: number, rowHeight: number, columnWidth: number) {
    const y = topPad + result.visibleSequences.length * rowHeight + 8
    this.context.fillStyle = '#5d574c'
    this.context.font = '10px "IBM Plex Mono", Consolas, monospace'
    this.context.textBaseline = 'top'
    // Adaptive spacing: show label at least every ~50px
    const minGapPx = 50
    const interval = Math.max(10, Math.ceil(minGapPx / columnWidth / 10) * 10)
    result.columns.forEach((column, index) => {
      if (column.insertOffset === 0 && (column.consensusPos === 1 || column.consensusPos % interval === 0)) {
        this.context.fillText(String(column.consensusPos), leftPad + index * columnWidth, y)
      }
    })
  }

  private drawHover(leftPad: number, topPad: number, rowHeight: number, columnWidth: number) {
    if (!this.hoveredCell) {
      return
    }
    this.context.strokeStyle = '#111'
    this.context.lineWidth = 1
    this.context.strokeRect(
      leftPad + this.hoveredCell.column * columnWidth,
      topPad + this.hoveredCell.row * rowHeight,
      columnWidth,
      rowHeight,
    )
  }
}

function sortSequences(sequences: SequenceAlignment[], sortMode: SortMode) {
  const copy = [...sequences]
  if (sortMode === 'id') {
    return copy.sort((a, b) => a.id.localeCompare(b.id))
  }
  if (sortMode === 'divergence-asc') {
    return copy.sort((a, b) => a.divergence - b.divergence)
  }
  if (sortMode === 'divergence-desc') {
    return copy.sort((a, b) => b.divergence - a.divergence)
  }
  return copy
}

function maxInsertionOffset(sequences: SequenceAlignment[], consensusPos: number) {
  return sequences.reduce((maxOffset, sequence) => {
    const sequenceMax = sequence.pixels.reduce((max, pixel) => {
      if (pixel.consensusPos !== consensusPos) {
        return max
      }
      return Math.max(max, pixel.insertOffset)
    }, 0)
    return Math.max(maxOffset, sequenceMax)
  }, 0)
}

function deterministicSample(sequences: SequenceAlignment[], count: number) {
  return [...sequences]
    .map((sequence) => ({ sequence, key: hashString(sequence.id) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map((entry) => entry.sequence)
}

function hashString(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}