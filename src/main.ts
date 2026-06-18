import './style.css'
import { calculateAlignmentData } from './calculator'
import { defaultViewerSettings, expandCompactAlignment, isCompactSequence, reconstructRawFromPixels, type AlignmentData, type AlignmentMode, type AnySequenceOnDisk, type ColorSchemeName, type SortMode, type ViewerSettings } from './model'
import { sampleConsensus, sampleCopies } from './sampleData'
import { SINEViewer, colorSchemes } from './viewer'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header class="app-header">
    <div>
      <p class="eyebrow">Consensus coordinate microscope</p>
      <h1>SINE Pixel Viewer</h1>
    </div>
    <div class="header-actions">
      <button id="toggle-panel" class="toggle-panel-btn" type="button" title="Toggle control panel">☰</button>
      <button id="reset-button" type="button">Reset</button>
      <button id="load-calculation" type="button">Load JSON</button>
      <input id="calculation-input" type="file" accept="application/json,.json" hidden>
      <button id="run-alignment" type="button">Run</button>
      <button id="export-png" type="button">Export PNG</button>
      <button id="full-image-btn" type="button" title="Show all sequences as full-resolution images (non-interactive)">📷 Full</button>
    </div>
  </header>

  <main class="workspace">
    <aside class="control-panel" aria-label="Alignment controls">
      <label>Consensus FASTA
        <textarea id="consensus-input" spellcheck="false" rows="3"></textarea>
      </label>
      <label>SINE Copy FASTA
        <textarea id="copy-input" spellcheck="false" rows="3"></textarea>
      </label>

      <div class="control-grid">
        <label>Mode
          <select id="mode-input" class="render-control">
            <option value="full">full</option>
            <option value="sub_del" selected>sub_del</option>
            <option value="sub_only">sub_only</option>
          </select>
        </label>
        <label>Px H <span class="range-value" id="pixel-size-val">4</span>
          <input class="render-control" id="pixel-size" type="range" min="1" max="20" value="4">
        </label>
        <label>Px W <span class="range-value" id="pixel-width-val">4</span>
          <input class="render-control" id="pixel-width" type="range" min="1" max="20" value="4">
        </label>
        <label>Label <span class="range-value" id="label-width-val">168</span>
          <input class="render-control" id="label-width" type="range" min="60" max="400" value="168">
        </label>
        <label>Color
          <select class="render-control" id="color-scheme">
            <option value="accessible" selected>accessible</option>
            <option value="classic">classic</option>
            <option value="grayscale">grayscale</option>
          </select>
        </label>
        <label>Window start <span class="range-value" id="window-start-val">1</span>
          <input class="render-control" id="window-start" type="number" min="1" value="1" style="width:100%">
        </label>
        <label>Window end <span class="range-value" id="window-end-val">64</span>
          <input class="render-control" id="window-end" type="number" min="1" value="64" style="width:100%">
        </label>
        <label>Sort
          <select class="render-control" id="sort-mode">
            <option value="divergence-asc" selected>div asc</option>
            <option value="divergence-desc">div desc</option>
            <option value="divsub-asc">div sub asc</option>
            <option value="divsub-desc">div sub desc</option>
            <option value="divindel-asc">div indel asc</option>
            <option value="divindel-desc">div indel desc</option>
            <option value="id">id</option>
            <option value="input">input</option>
          </select>
        </label>
        <label>Div min%
          <input class="render-control" id="div-min" type="number" min="0" max="100" value="0" style="width:100%">
        </label>
        <label>Div max%
          <input class="render-control" id="div-max" type="number" min="0" max="100" value="100" style="width:100%">
        </label>
        <label>Max seq <span class="range-value" id="max-sequences-val">500</span>
          <input class="render-control" id="max-sequences" type="range" min="10" max="5000" value="500">
        </label>
        <label class="show-all-row"><input class="render-control" id="show-all" type="checkbox"> Show all</label>
        <label>Row offset <span class="range-value" id="row-offset-val">0</span>
          <input class="render-control" id="row-offset" type="range" min="0" max="50000" value="0">
        </label>
        <label>Top N <span class="range-value" id="top-n-val">0</span>
          <input class="render-control" id="top-n" type="range" min="0" max="500" value="0">
        </label>
        <label>Bottom N <span class="range-value" id="bottom-n-val">0</span>
          <input class="render-control" id="bottom-n" type="range" min="0" max="500" value="0">
        </label>
        <label>Random N <span class="range-value" id="random-n-val">0</span>
          <input class="render-control" id="random-n" type="range" min="0" max="500" value="0">
        </label>
      </div>

      <label>Search IDs
        <input class="render-control" id="search-text" type="search" placeholder="filter by id...">
      </label>
      <label>Selected IDs
        <input class="render-control" id="selected-ids" type="text" placeholder="id1, id2, ...">
      </label>

      <div class="toggle-row">
        <label><input class="render-control" id="show-consensus" type="checkbox" checked> consensus</label>
        <label><input class="render-control" id="show-divergence" type="checkbox" checked> divergence</label>
      </div>
    </aside>

    <section class="viewer-shell">
      <div class="summary-strip" id="summary-strip"></div>
      <div class="legend" aria-label="Color legend">
        <span><i class="match"></i>match</span>
        <span><i class="mismatch"></i>mismatch</span>
        <span><i class="ins"></i>insertion</span>
        <span><i class="del"></i>deletion</span>
        <span><i class="missing"></i>missing</span>
      </div>
      <div class="canvas-wrap" id="canvas-wrap">
        <div class="scale-header" id="scale-header"></div>
        <canvas id="alignment-canvas"></canvas>
      </div>
      <div class="image-display" id="image-display" hidden></div>
      <output id="hover-output" class="hover-output">Hover over the matrix</output>
    </section>
  </main>
  <div class="canvas-tooltip" id="canvas-tooltip"></div>
  <div class="fasta-modal" id="fasta-modal" hidden>
    <div class="fasta-modal-overlay"></div>
    <div class="fasta-modal-body">
      <div class="fasta-modal-header">
        <span class="fasta-modal-title" id="fasta-modal-title"></span>
        <button class="fasta-modal-close" id="fasta-modal-close">&times;</button>
      </div>
      <pre class="fasta-modal-content" id="fasta-modal-content"></pre>
      <div class="fasta-modal-actions">
        <button id="fasta-copy-btn">Copy to clipboard</button>
      </div>
    </div>
  </div>
`

const consensusInput = document.querySelector<HTMLTextAreaElement>('#consensus-input')!
const copyInput = document.querySelector<HTMLTextAreaElement>('#copy-input')!
const modeInput = document.querySelector<HTMLSelectElement>('#mode-input')!
const calculationInput = document.querySelector<HTMLInputElement>('#calculation-input')!
const canvas = document.querySelector<HTMLCanvasElement>('#alignment-canvas')!
const hoverOutput = document.querySelector<HTMLOutputElement>('#hover-output')!
const summaryStrip = document.querySelector<HTMLDivElement>('#summary-strip')!
const scaleHeader = document.querySelector<HTMLDivElement>('#scale-header')!
const tooltip = document.querySelector<HTMLDivElement>('#canvas-tooltip')!

let alignmentData: AlignmentData | null = null
let viewer: SINEViewer | null = null
let settings = defaultViewerSettings(64)
let originalConsensus = sampleConsensus
let originalCopies = sampleCopies
let dataFromJson = false
let originalRawSequences: string[] = []  // preserved across mode switches

consensusInput.value = sampleConsensus
copyInput.value = sampleCopies

// ── Range slider value sync ──
function syncRangeDisplay(id: string) {
  const input = document.querySelector<HTMLInputElement>(`#${id}`)!
  const disp = document.querySelector<HTMLSpanElement>(`#${id}-val`)
  if (disp) disp.textContent = input.value
}
document.querySelectorAll<HTMLInputElement>('input[type="range"].render-control').forEach((r) => {
  r.addEventListener('input', () => syncRangeDisplay(r.id))
})

function calculate() {
  try {
    alignmentData = calculateAlignmentData(consensusInput.value, copyInput.value, {
      mode: modeInput.value as AlignmentMode,
      maxInsLength: 50,
      maxDelLength: 100,
      minSequenceLengthRatio: 0.5,
    })
    viewer = new SINEViewer(alignmentData, canvas)
    originalConsensus = consensusInput.value
    originalCopies = copyInput.value
    dataFromJson = false
    // Update window-end to match consensus length
    const we = document.querySelector<HTMLInputElement>('#window-end')!
    we.max = String(alignmentData.consensusLength)
    if (Number(we.value) > alignmentData.consensusLength) we.value = String(alignmentData.consensusLength)
    const wev = document.querySelector<HTMLSpanElement>('#window-end-val')
    if (wev) wev.textContent = we.value
    renderCurrent()
  } catch (error) {
    alignmentData = null
    viewer = null
    summaryStrip.textContent = error instanceof Error ? error.message : String(error)
  }
}

async function loadCalculationFile(file: File) {
  try {
    const raw = JSON.parse(await file.text()) as Record<string, unknown>
    if (!isAlignmentData(raw)) {
      throw new Error('Calculation JSON does not match the SINE Pixel Viewer alignment schema')
    }
    const seqs = raw.sequences as AnySequenceOnDisk[] | undefined
    if (raw.format === 'compact' || seqs?.some((s) => isCompactSequence(s))) {
      const consensus = raw.consensus as string
      raw.sequences = seqs!.map((seq) =>
        isCompactSequence(seq) ? expandCompactAlignment(seq, consensus) : seq,
      )
    }
    alignmentData = raw as unknown as AlignmentData
    dataFromJson = true
    // Store original raw sequences — never overwritten by mode switches
    originalRawSequences = alignmentData.sequences.map((seq) => {
      if (seq.rawSequence && seq.rawSequence.length > 0) return seq.rawSequence
      return reconstructRawFromPixels(seq.pixels)
    })
    viewer = new SINEViewer(alignmentData, canvas)
    modeInput.value = alignmentData.mode
    document.querySelector<HTMLInputElement>('#window-start')!.value = '1'
    document.querySelector<HTMLInputElement>('#window-end')!.value = String(alignmentData.consensusLength)
    renderCurrent()
  } catch (error) {
    alignmentData = null
    viewer = null
    summaryStrip.textContent = error instanceof Error ? error.message : String(error)
  }
}

function renderCurrent() {
  if (!alignmentData || !viewer) return
  settings = readSettings(alignmentData.consensusLength)
  const result = viewer.render(settings)
  const offset = settings.rowOffset
  const visibleCount = result.visibleSequences.length
  const totalFiltered = Math.min(settings.maxSequences, alignmentData.numSequences)
  summaryStrip.innerHTML = `
    ${offset > 0 || visibleCount < totalFiltered
      ? `<strong>${offset + 1}-${offset + visibleCount}</strong> of `
      : ''}<strong>${visibleCount}</strong> shown
    <strong>${alignmentData.numSequences}</strong> retained
    <strong>${alignmentData.consensusLength}</strong> bp
    <strong>${alignmentData.mode}</strong>
    <strong>${result.columns.length}</strong> cols
    <strong>${alignmentData.stats.skippedCount}</strong> skipped
  `
  renderScaleHeader(settings, result)
  syncLegendColors()
}

function syncLegendColors() {
  const scheme = colorSchemes[settings.colorScheme] ?? colorSchemes.accessible
  for (const state of ['match', 'mismatch', 'ins', 'del', 'missing'] as const) {
    const el = document.querySelector<HTMLElement>(`.legend .${state}`)
    if (el) el.style.background = scheme[state]
  }
}

function renderScaleHeader(s: ViewerSettings, result: { columns: { consensusPos: number; insertOffset: number }[] }) {
  const columnWidth = Math.max(1, s.pixelWidth)
  const minGap = 50
  const interval = Math.max(10, Math.ceil(minGap / columnWidth / 10) * 10)
  const leftPad = s.labelWidth
  let html = ''
  for (let i = 0; i < result.columns.length; i++) {
    const col = result.columns[i]
    if (col.insertOffset !== 0) continue
    const pos = col.consensusPos
    if (pos === 1 || pos % interval === 0) {
      const x = leftPad + i * columnWidth
      html += `<span class="tick" style="left:${x}px;height:6px"></span>`
      html += `<span class="tick-label" style="left:${x}px">${pos}</span>`
    }
  }
  scaleHeader.innerHTML = html
  scaleHeader.style.paddingLeft = `${leftPad}px`
  scaleHeader.style.minWidth = `${leftPad + result.columns.length * columnWidth + 96}px`
}

function readSettings(consensusLength: number): ViewerSettings {
  const next = defaultViewerSettings(consensusLength)
  next.pixelSize = numericValue('#pixel-size', 4)
  next.pixelWidth = numericValue('#pixel-width', 4)
  next.labelWidth = numericValue('#label-width', 168)
  next.consensusWindow = [
    clamp(numericValue('#window-start', 1), 1, consensusLength),
    clamp(numericValue('#window-end', consensusLength), 1, consensusLength),
  ]
  if (next.consensusWindow[0] > next.consensusWindow[1]) {
    next.consensusWindow = [next.consensusWindow[1], next.consensusWindow[0]]
  }
  next.divergenceRange = [numericValue('#div-min', 0), numericValue('#div-max', 100)]
  if (next.divergenceRange[0] > next.divergenceRange[1]) {
    next.divergenceRange = [next.divergenceRange[1], next.divergenceRange[0]]
  }
  next.maxSequences = document.querySelector<HTMLInputElement>('#show-all')!.checked
    ? Number.MAX_SAFE_INTEGER
    : numericValue('#max-sequences', 500)
  next.rowOffset = numericValue('#row-offset', 0)
  next.topN = numericValue('#top-n', 0)
  next.bottomN = numericValue('#bottom-n', 0)
  next.randomN = numericValue('#random-n', 0)
  next.colorScheme = document.querySelector<HTMLSelectElement>('#color-scheme')!.value as ColorSchemeName
  next.sortMode = document.querySelector<HTMLSelectElement>('#sort-mode')!.value as SortMode
  next.searchText = document.querySelector<HTMLInputElement>('#search-text')!.value.trim()
  next.selectedIds = new Set(
    document.querySelector<HTMLInputElement>('#selected-ids')!.value.split(',').map((id) => id.trim()).filter(Boolean),
  )
  next.showConsensus = document.querySelector<HTMLInputElement>('#show-consensus')!.checked
  next.showDivergence = document.querySelector<HTMLInputElement>('#show-divergence')!.checked
  return next
}

function numericValue(selector: string, fallback: number) {
  const value = Number(document.querySelector<HTMLInputElement>(selector)!.value)
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isAlignmentData(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return typeof c.consensus === 'string'
    && typeof c.consensusLength === 'number'
    && typeof c.numSequences === 'number'
    && (c.mode === 'full' || c.mode === 'sub_del' || c.mode === 'sub_only')
    && Array.isArray(c.sequences)
}

function resetAllControls() {
  document.querySelector<HTMLInputElement>('#pixel-size')!.value = '4'; syncRangeDisplay('pixel-size')
  document.querySelector<HTMLInputElement>('#pixel-width')!.value = '4'; syncRangeDisplay('pixel-width')
  document.querySelector<HTMLInputElement>('#label-width')!.value = '168'; syncRangeDisplay('label-width')
  document.querySelector<HTMLInputElement>('#window-start')!.value = '1'
  document.querySelector<HTMLInputElement>('#div-min')!.value = '0'
  document.querySelector<HTMLInputElement>('#div-max')!.value = '100'
  document.querySelector<HTMLInputElement>('#max-sequences')!.value = '500'; syncRangeDisplay('max-sequences')
  document.querySelector<HTMLInputElement>('#show-all')!.checked = false
  document.querySelector<HTMLInputElement>('#row-offset')!.value = '0'; syncRangeDisplay('row-offset')
  document.querySelector<HTMLInputElement>('#top-n')!.value = '0'; syncRangeDisplay('top-n')
  document.querySelector<HTMLInputElement>('#bottom-n')!.value = '0'; syncRangeDisplay('bottom-n')
  document.querySelector<HTMLInputElement>('#random-n')!.value = '0'; syncRangeDisplay('random-n')
  document.querySelector<HTMLSelectElement>('#color-scheme')!.value = 'accessible'
  document.querySelector<HTMLSelectElement>('#sort-mode')!.value = 'divergence-asc'
  document.querySelector<HTMLInputElement>('#search-text')!.value = ''
  document.querySelector<HTMLInputElement>('#selected-ids')!.value = ''
  document.querySelector<HTMLInputElement>('#show-consensus')!.checked = true
  document.querySelector<HTMLInputElement>('#show-divergence')!.checked = true
}

// ── Event listeners ──
document.querySelector<HTMLButtonElement>('#toggle-panel')!.addEventListener('click', () => {
  document.querySelector<HTMLDivElement>('.workspace')!.classList.toggle('panel-collapsed')
})
document.querySelector<HTMLButtonElement>('#reset-button')!.addEventListener('click', () => {
  consensusInput.value = originalConsensus
  copyInput.value = originalCopies
  modeInput.value = 'sub_del'
  resetAllControls()
  calculate()
})
document.querySelector<HTMLButtonElement>('#load-calculation')!.addEventListener('click', () => calculationInput.click())
calculationInput.addEventListener('change', () => {
  const file = calculationInput.files?.[0]
  if (file) { void loadCalculationFile(file) }
  calculationInput.value = ''
})
document.querySelector<HTMLButtonElement>('#run-alignment')!.addEventListener('click', calculate)
document.querySelector<HTMLButtonElement>('#export-png')!.addEventListener('click', () => viewer?.exportPng())

// ── Full image toggle ──
let isFullImageMode = false
const fullImageBtn = document.querySelector<HTMLButtonElement>('#full-image-btn')!
const imageDisplay = document.querySelector<HTMLDivElement>('#image-display')!
const canvasWrap = document.querySelector<HTMLDivElement>('#canvas-wrap')!

fullImageBtn.addEventListener('click', () => {
  if (!viewer || !alignmentData) return
  isFullImageMode = !isFullImageMode

  if (isFullImageMode) {
    // Switch to full image mode
    const currentSort = document.querySelector<HTMLSelectElement>('#sort-mode')!.value as SortMode
    const divMin = numericValue('#div-min', 0)
    const divMax = numericValue('#div-max', 100)
    summaryStrip.textContent = 'Rendering full image...'
    
    setTimeout(() => {
      try {
        const { urls, totalRows, cols } = viewer!.getFullImageDataUrls(currentSort, [divMin, divMax])
        imageDisplay.innerHTML = urls.map((url) => `<img src="${url}" alt="alignment tile">`).join('')
        canvasWrap.hidden = true
        imageDisplay.hidden = false
        fullImageBtn.textContent = '🖱️ Interactive'
        fullImageBtn.title = 'Switch back to interactive canvas'
        hoverOutput.textContent = `Full image: ${totalRows} rows, ${cols} cols (non-interactive)`
        summaryStrip.innerHTML = `<strong>${totalRows}</strong> rows <strong>${cols}</strong> cols (image mode)`
      } catch (e) {
        summaryStrip.textContent = e instanceof Error ? e.message : String(e)
        isFullImageMode = false
        fullImageBtn.textContent = '📷 Full'
      }
    }, 10)
  } else {
    // Switch back to interactive canvas mode
    imageDisplay.hidden = true
    imageDisplay.innerHTML = ''
    canvasWrap.hidden = false
    fullImageBtn.textContent = '📷 Full'
    fullImageBtn.title = 'Show all sequences as full-resolution images'
    renderCurrent()
  }
})

// ── Event listeners ──
// (moved below for clarity — rest of listeners follow)
modeInput.addEventListener('change', () => {
  if (dataFromJson && alignmentData) {
    // Re-derive alignment from stored raw sequences with new mode
    const newMode = modeInput.value as AlignmentMode
    summaryStrip.textContent = `Recalculating with ${newMode} mode...`
    // Use setTimeout so the UI updates before heavy work
    setTimeout(() => {
      try {
        const consensusFasta = `>${alignmentData!.consensusId}\n${alignmentData!.consensus}`
        const copiesFasta = originalRawSequences
          .map((raw, i) => `>${alignmentData!.sequences[i]?.id ?? `copy_${i + 1}`}\n${raw}`)
          .join('\n')
        alignmentData = calculateAlignmentData(consensusFasta, copiesFasta, {
          mode: newMode,
          maxInsLength: 50,
          maxDelLength: 100,
          minSequenceLengthRatio: 0.5,
        })
        viewer = new SINEViewer(alignmentData!, canvas)
        renderCurrent()
      } catch (error) {
        summaryStrip.textContent = error instanceof Error ? error.message : String(error)
      }
    }, 10)
    return
  }
  if (!dataFromJson) calculate()
})
document.querySelectorAll<HTMLElement>('.render-control').forEach((control) => {
  control.addEventListener('input', renderCurrent)
  control.addEventListener('change', renderCurrent)
})

// ── Canvas mouse: hover tooltip + double-click FASTA popup ──
let lastClickTime = 0
let lastClickRow = -1
const fastaModal = document.querySelector<HTMLDivElement>('#fasta-modal')!
const fastaModalTitle = document.querySelector<HTMLSpanElement>('#fasta-modal-title')!
const fastaModalContent = document.querySelector<HTMLPreElement>('#fasta-modal-content')!
document.querySelector<HTMLButtonElement>('#fasta-modal-close')!.addEventListener('click', () => {
  fastaModal.hidden = true
})
fastaModal.querySelector<HTMLDivElement>('.fasta-modal-overlay')!.addEventListener('click', () => {
  fastaModal.hidden = true
})
document.querySelector<HTMLButtonElement>('#fasta-copy-btn')!.addEventListener('click', async () => {
  await navigator.clipboard.writeText(fastaModalContent.textContent ?? '')
  const btn = document.querySelector<HTMLButtonElement>('#fasta-copy-btn')!
  btn.textContent = 'Copied!'
  setTimeout(() => { btn.textContent = 'Copy to clipboard' }, 2000)
})

function showFastaPopup(sequenceId: string, rawSequence: string) {
  fastaModalTitle.textContent = sequenceId
  // Format as FASTA with 60 chars per line
  const lines: string[] = []
  for (let i = 0; i < rawSequence.length; i += 60) {
    lines.push(rawSequence.slice(i, i + 60))
  }
  fastaModalContent.textContent = `>${sequenceId}\n${lines.join('\n')}`
  fastaModal.hidden = false
}

canvas.addEventListener('click', (event) => {
  if (!viewer || !alignmentData) return
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const topPad = settings.showConsensus ? 26 : 8
  const rowHeight = Math.max(1, settings.pixelSize)

  // Click on divergence bar area → toggle sort direction
  const rightPad = settings.showDivergence ? 96 : 24
  const canvasWidth = canvas.width
  if (x > canvasWidth - rightPad && y > topPad) {
    const sortMode = document.querySelector<HTMLSelectElement>('#sort-mode')!
    const current = sortMode.value as SortMode
    const pairs: Array<[SortMode, SortMode]> = [
      ['divergence-asc', 'divergence-desc'], ['divergence-desc', 'divergence-asc'],
      ['divsub-asc', 'divsub-desc'], ['divsub-desc', 'divsub-asc'],
      ['divindel-asc', 'divindel-desc'], ['divindel-desc', 'divindel-asc'],
    ]
    for (const [a, b] of pairs) {
      if (current === a) { sortMode.value = b; sortMode.dispatchEvent(new Event('change')); break }
    }
    lastClickRow = -1
    return
  }

  // Only respond to clicks in the label area
  if (x >= settings.labelWidth || y < topPad) {
    lastClickRow = -1
    return
  }

  const lastResult = viewer.getLastResult()
  if (!lastResult) { lastClickRow = -1; return }

  const row = Math.floor((y - topPad) / rowHeight)
  if (row < 0 || row >= lastResult.visibleSequences.length) {
    lastClickRow = -1
    return
  }

  const now = Date.now()
  if (row === lastClickRow && now - lastClickTime < 400) {
    // Double-click detected — show FASTA popup
    const seq = lastResult.visibleSequences[row]
    const raw = seq.rawSequence ?? viewer.reconstructRaw(seq)
    if (raw) {
      showFastaPopup(seq.id, raw)
    }
    lastClickRow = -1
  } else {
    lastClickRow = row
    lastClickTime = now
  }
})
canvas.addEventListener('mousemove', (event) => {
  if (!viewer || !alignmentData) return
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const topPad = settings.showConsensus ? 26 : 8
  const rowHeight = Math.max(1, settings.pixelSize)

  // Hover over label area — show full sequence name
  if (x < settings.labelWidth && y >= topPad) {
    const row = Math.floor((y - topPad) / rowHeight)
    if (row >= 0 && row < alignmentData.sequences.length) {
      const name = alignmentData.sequences[row].id
      tooltip.textContent = name
      tooltip.style.display = 'block'
      tooltip.style.left = `${event.clientX + 14}px`
      tooltip.style.top = `${event.clientY - 10}px`
      hoverOutput.textContent = name
      return
    }
  }

  const text = viewer.setHoverFromPoint(x, y, settings)
  if (text) {
    tooltip.textContent = text
    tooltip.style.display = 'block'
    tooltip.style.left = `${event.clientX + 14}px`
    tooltip.style.top = `${event.clientY - 10}px`
  } else {
    tooltip.style.display = 'none'
  }
  viewer.render(settings)
  hoverOutput.textContent = text || 'Hover over the matrix'
})
canvas.addEventListener('mouseleave', () => {
  tooltip.style.display = 'none'
})

calculate()
