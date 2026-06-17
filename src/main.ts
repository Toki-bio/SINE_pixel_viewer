import './style.css'
import { calculateAlignmentData } from './calculator'
import { defaultViewerSettings, type AlignmentData, type AlignmentMode, type ColorSchemeName, type SortMode, type ViewerSettings } from './model'
import { sampleConsensus, sampleCopies } from './sampleData'
import { SINEViewer } from './viewer'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header class="app-header">
    <div>
      <p class="eyebrow">Consensus coordinate microscope</p>
      <h1>SINE Pixel Viewer</h1>
    </div>
    <div class="header-actions">
      <button id="reset-button" type="button">Reset</button>
      <button id="load-calculation" type="button">Load Calculation JSON</button>
      <input id="calculation-input" type="file" accept="application/json,.json" hidden>
      <button id="run-alignment" type="button">Run Alignment</button>
      <button id="export-png" type="button">Export PNG</button>
    </div>
  </header>

  <main class="workspace">
    <aside class="control-panel" aria-label="Alignment controls">
      <label>
        Consensus FASTA
        <textarea id="consensus-input" spellcheck="false"></textarea>
      </label>
      <label>
        SINE Copy FASTA
        <textarea id="copy-input" spellcheck="false"></textarea>
      </label>

      <div class="control-grid">
        <label>
          Mode
          <select id="mode-input">
            <option value="full">full</option>
            <option value="sub_del" selected>sub_del</option>
            <option value="sub_only">sub_only</option>
          </select>
        </label>
        <label>
          Pixel Size
          <input class="render-control" id="pixel-size" type="number" min="1" max="10" value="4">
        </label>
        <label>
          Window Start
          <input class="render-control" id="window-start" type="number" min="1" value="1">
        </label>
        <label>
          Window End
          <input class="render-control" id="window-end" type="number" min="1" value="64">
        </label>
        <label>
          Min Divergence
          <input class="render-control" id="div-min" type="number" min="0" max="100" value="0">
        </label>
        <label>
          Max Divergence
          <input class="render-control" id="div-max" type="number" min="0" max="100" value="100">
        </label>
        <label>
          Max Sequences
          <input class="render-control" id="max-sequences" type="number" min="1" max="5000" value="500">
        </label>
        <label>
          Top N
          <input class="render-control" id="top-n" type="number" min="0" max="5000" value="0">
        </label>
        <label>
          Bottom N
          <input class="render-control" id="bottom-n" type="number" min="0" max="5000" value="0">
        </label>
        <label>
          Random N
          <input class="render-control" id="random-n" type="number" min="0" max="5000" value="0">
        </label>
        <label>
          Color Scheme
          <select class="render-control" id="color-scheme">
            <option value="accessible" selected>accessible</option>
            <option value="classic">classic</option>
            <option value="grayscale">grayscale</option>
          </select>
        </label>
        <label>
          Sort
          <select class="render-control" id="sort-mode">
            <option value="divergence-asc" selected>divergence asc</option>
            <option value="divergence-desc">divergence desc</option>
            <option value="id">id</option>
            <option value="input">input</option>
          </select>
        </label>
      </div>

      <label>
        Search IDs
        <input class="render-control" id="search-text" type="search" placeholder="SINE_004">
      </label>
      <label>
        Selected IDs, Comma Separated
        <input class="render-control" id="selected-ids" type="text" placeholder="SINE_001_perfect, SINE_004_insertion">
      </label>

      <div class="toggle-row">
        <label><input class="render-control" id="show-consensus" type="checkbox" checked> consensus track</label>
        <label><input class="render-control" id="show-divergence" type="checkbox" checked> divergence bars</label>
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
      <div class="canvas-wrap">
        <canvas id="alignment-canvas"></canvas>
      </div>
      <output id="hover-output" class="hover-output">Pixel inspector</output>
    </section>
  </main>
`

const consensusInput = document.querySelector<HTMLTextAreaElement>('#consensus-input')!
const copyInput = document.querySelector<HTMLTextAreaElement>('#copy-input')!
const modeInput = document.querySelector<HTMLSelectElement>('#mode-input')!
const calculationInput = document.querySelector<HTMLInputElement>('#calculation-input')!
const canvas = document.querySelector<HTMLCanvasElement>('#alignment-canvas')!
const hoverOutput = document.querySelector<HTMLOutputElement>('#hover-output')!
const summaryStrip = document.querySelector<HTMLDivElement>('#summary-strip')!

let alignmentData: AlignmentData | null = null
let viewer: SINEViewer | null = null
let settings = defaultViewerSettings(64)
// Track the last committed data so Reset can revert to it
let originalConsensus = sampleConsensus
let originalCopies = sampleCopies

consensusInput.value = sampleConsensus
copyInput.value = sampleCopies

function calculate() {
  try {
    alignmentData = calculateAlignmentData(consensusInput.value, copyInput.value, {
      mode: modeInput.value as AlignmentMode,
      maxInsLength: 50,
      maxDelLength: 100,
      minSequenceLengthRatio: 0.5,
    })
    viewer = new SINEViewer(alignmentData, canvas)
    // Remember this data so Reset can restore it later
    originalConsensus = consensusInput.value
    originalCopies = copyInput.value
    renderCurrent()
  } catch (error) {
    alignmentData = null
    viewer = null
    summaryStrip.textContent = error instanceof Error ? error.message : String(error)
  }
}

async function loadCalculationFile(file: File) {
  try {
    const parsed = JSON.parse(await file.text()) as unknown
    if (!isAlignmentData(parsed)) {
      throw new Error('Calculation JSON does not match the SINE Pixel Viewer alignment schema')
    }
    alignmentData = parsed
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
  if (!alignmentData || !viewer) {
    return
  }
  settings = readSettings(alignmentData.consensusLength)
  const result = viewer.render(settings)
  summaryStrip.innerHTML = `
    <strong>${result.visibleSequences.length}</strong> shown
    <strong>${alignmentData.numSequences}</strong> retained
    <strong>${alignmentData.consensusLength}</strong> consensus bp
    <strong>${alignmentData.mode}</strong> mode
    <strong>${result.columns.length}</strong> columns
    <strong>${alignmentData.stats.skippedCount}</strong> length-filtered
  `
}

function readSettings(consensusLength: number): ViewerSettings {
  const next = defaultViewerSettings(consensusLength)
  next.pixelSize = numericValue('#pixel-size', 4)
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
  next.maxSequences = numericValue('#max-sequences', 500)
  next.topN = numericValue('#top-n', 0)
  next.bottomN = numericValue('#bottom-n', 0)
  next.randomN = numericValue('#random-n', 0)
  next.colorScheme = document.querySelector<HTMLSelectElement>('#color-scheme')!.value as ColorSchemeName
  next.sortMode = document.querySelector<HTMLSelectElement>('#sort-mode')!.value as SortMode
  next.searchText = document.querySelector<HTMLInputElement>('#search-text')!.value.trim()
  next.selectedIds = new Set(
    document.querySelector<HTMLInputElement>('#selected-ids')!.value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
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

function isAlignmentData(value: unknown): value is AlignmentData {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<AlignmentData>
  return typeof candidate.consensus === 'string'
    && typeof candidate.consensusLength === 'number'
    && typeof candidate.numSequences === 'number'
    && (candidate.mode === 'full' || candidate.mode === 'sub_del' || candidate.mode === 'sub_only')
    && Array.isArray(candidate.sequences)
}

function resetAllControls() {
  document.querySelector<HTMLInputElement>('#pixel-size')!.value = '4'
  document.querySelector<HTMLInputElement>('#window-start')!.value = '1'
  // window-end will be set by calculate() → renderCurrent() based on consensus length
  document.querySelector<HTMLInputElement>('#div-min')!.value = '0'
  document.querySelector<HTMLInputElement>('#div-max')!.value = '100'
  document.querySelector<HTMLInputElement>('#max-sequences')!.value = '500'
  document.querySelector<HTMLInputElement>('#top-n')!.value = '0'
  document.querySelector<HTMLInputElement>('#bottom-n')!.value = '0'
  document.querySelector<HTMLInputElement>('#random-n')!.value = '0'
  document.querySelector<HTMLSelectElement>('#color-scheme')!.value = 'accessible'
  document.querySelector<HTMLSelectElement>('#sort-mode')!.value = 'divergence-asc'
  document.querySelector<HTMLInputElement>('#search-text')!.value = ''
  document.querySelector<HTMLInputElement>('#selected-ids')!.value = ''
  document.querySelector<HTMLInputElement>('#show-consensus')!.checked = true
  document.querySelector<HTMLInputElement>('#show-divergence')!.checked = true
}

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
  if (file) {
    void loadCalculationFile(file)
  }
  calculationInput.value = ''
})
document.querySelector<HTMLButtonElement>('#run-alignment')!.addEventListener('click', calculate)
document.querySelector<HTMLButtonElement>('#export-png')!.addEventListener('click', () => viewer?.exportPng())
modeInput.addEventListener('change', calculate)
document.querySelectorAll<HTMLElement>('.render-control').forEach((control) => {
  control.addEventListener('input', renderCurrent)
  control.addEventListener('change', renderCurrent)
})
canvas.addEventListener('mousemove', (event) => {
  if (!viewer) {
    return
  }
  const rect = canvas.getBoundingClientRect()
  hoverOutput.textContent = viewer.setHoverFromPoint(event.clientX - rect.left, event.clientY - rect.top, settings)
  viewer.render(settings)
})

calculate()