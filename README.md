# SINE Pixel Viewer

SINE Pixel Viewer is a static TypeScript app for projecting SINE copies onto consensus coordinates and rendering the result as a dense pixel alignment image.

## What It Includes

- `src/calculator.ts` parses FASTA, validates DNA input, runs `full`, `sub_del`, or `sub_only` alignment modes, and emits consensus-coordinate alignment data.
- `src/viewer.ts` filters, sorts, windows, and renders alignment data to a canvas heatmap.
- `src/sampleData.ts` contains a small bundled SINE-like dataset used by the app and tests.
- `src/*.test.ts` covers FASTA parsing, alignment projection, insertion slots, filtering, and matrix generation.

## Local Development

```powershell
npm install
npm run test
npm run build
npm run dev
```

## Prepare Calculation JSON On Linux

Use the dependency-free Python script to align SINE copies pairwise against a consensus/reference sequence and save viewer-ready JSON.

Single multiFASTA form, where the first record is the consensus/reference and the remaining records are SINE copies:

```bash
python3 scripts/prepare-calculation-file.py \
	sine_copies_with_consensus.fa \
	alignment.full.json \
	--mode full
```

If the consensus/reference is not the first record, name it explicitly:

```bash
python3 scripts/prepare-calculation-file.py \
	sine_copies_with_consensus.fa \
	alignment.sub_del.json \
	--consensus-id SINE_CONSENSUS \
	--mode sub_del
```

Separate consensus and SINE copy multiFASTA form:

```bash
python3 scripts/prepare-calculation-file.py \
	consensus.fa \
	sine_copies.fa \
	alignment.full.json \
	--mode full
```

Useful thresholds:

```bash
--max-ins-length 50 --max-del-length 100 --min-sequence-length-ratio 0.5
```

Modes match the browser calculator:

- `full` keeps insertion pixels as virtual columns between consensus sites.
- `sub_del` suppresses insertions with a heavy insertion penalty and projects substitutions/deletions to consensus coordinates.
- `sub_only` compares sequence and consensus positions directly without dynamic programming.

Open the hosted app and use `Load Calculation JSON` to render the generated file.

## GitHub Pages

This repository includes `.github/workflows/pages.yml`. After pushing to GitHub, enable Pages with source `GitHub Actions` in the repository settings.

The app uses relative asset paths through `base: './'` in `vite.config.ts`, so it works from a project Pages subpath.