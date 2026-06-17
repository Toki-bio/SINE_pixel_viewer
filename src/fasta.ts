import type { FastaRecord } from './model'

const dnaPattern = /^[ACGTN]+$/i

export function parseFasta(input: string, fallbackPrefix = 'sequence'): FastaRecord[] {
  const records: FastaRecord[] = []
  let currentId = ''
  let chunks: string[] = []

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    if (line.startsWith('>')) {
      if (currentId || chunks.length > 0) {
        records.push({ id: currentId || `${fallbackPrefix}_${records.length + 1}`, sequence: chunks.join('').toUpperCase() })
      }
      currentId = line.slice(1).trim().split(/\s+/)[0] || `${fallbackPrefix}_${records.length + 1}`
      chunks = []
    } else {
      chunks.push(line.replace(/\s+/g, ''))
    }
  }

  if (currentId || chunks.length > 0) {
    records.push({ id: currentId || `${fallbackPrefix}_${records.length + 1}`, sequence: chunks.join('').toUpperCase() })
  }

  if (records.length === 0 && input.trim()) {
    records.push({ id: `${fallbackPrefix}_1`, sequence: input.replace(/\s+/g, '').toUpperCase() })
  }

  return records
}

export function validateDnaRecord(record: FastaRecord): string[] {
  const errors: string[] = []
  if (!record.id.trim()) {
    errors.push('Missing FASTA id')
  }
  if (!record.sequence) {
    errors.push(`Sequence ${record.id || '<unknown>'} is empty`)
  }
  if (record.sequence && !dnaPattern.test(record.sequence)) {
    errors.push(`Sequence ${record.id || '<unknown>'} contains non-DNA characters`)
  }
  return errors
}

export function readSingleConsensus(input: string): FastaRecord {
  const records = parseFasta(input, 'consensus')
  if (records.length !== 1) {
    throw new Error(`Expected exactly one consensus sequence, found ${records.length}`)
  }

  const errors = validateDnaRecord(records[0])
  if (errors.length > 0) {
    throw new Error(errors.join('; '))
  }

  return records[0]
}