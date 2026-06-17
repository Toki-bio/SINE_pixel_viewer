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

## GitHub Pages

This repository includes `.github/workflows/pages.yml`. After pushing to GitHub, enable Pages with source `GitHub Actions` in the repository settings.

The app uses relative asset paths through `base: './'` in `vite.config.ts`, so it works from a project Pages subpath.