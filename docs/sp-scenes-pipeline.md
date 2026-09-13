# SP08 / SP15 native scene assets

The selected SP08 and SP15 artwork becomes a separate six-scene style for every
registered breed. The original generated atlas remains untouched. Production
PNGs and editable Aseprite files retain native RGBA pixels; this pipeline never
resizes, quantizes, recolors, or invents missing animation frames.

All local artwork lives under the Git-ignored `local-assets/` directory.
Sources and conversion reports use `local-assets/work/`; the local site inventory
uses `local-assets/site/images/` and `local-assets/site/downloads/`.
`-Publish` copies verified files into that local inventory. S3 upload and CDN
activation remain separate steps, after the release is verified. Compiled JSON
keeps its public `/images/` and `/downloads/` identifiers.

## Source contract

`local-assets/work/sp-scenes-v1/{sp08|sp15}/originals/{breed}.png` is a 4 by 4 atlas:

| Source row | Frames |
| --- | --- |
| 1 | Front sitting idle, left side, happy, sleeping |
| 2 | Walking frames 1–4 |
| 3 | Walking frames 5–8 |
| 4 | Tail wag frames 1–4, front or three-quarter body |

Keep complete dogs inside clear gutters. Use true transparency or an explicitly
requested solid magenta background. Never register a checkerboard as artwork.
Frame cells must be at least 192 pixels in each dimension. 1254-square sources
usually yield native canvases around 320–350 pixels.

## Import and review

```powershell
./scripts/import-sp-scenes.ps1 -Style sp08 -Breed pomeranian `
  -InputPng local-assets/work/sp-scenes-v1/sp08/originals/pomeranian.png `
  -Background border-magenta -Publish
node scripts/verify-sp-scene-assets.cjs --style=sp08 --breed=pomeranian
```

The paid Aseprite executable defaults to `C:\Program Files\Aseprite\Aseprite.exe`.
It removes only the explicit background key, discovers clear gutters, pads
unequal cells, and registers poses using integer translations. The walking
strip contains eight independently drawn frames at 125 ms. The tail strip
contains four independently drawn frames at 150 ms. Other poses have one frame.

When a reliable pair of dark bean eyes is detected in all four wag frames, their
common head center is registered within the intersection of available canvas
margins. This keeps the body from shifting as its tail changes width. Detection
diagnostics are stored for human review and do not replace source artwork.
Ambiguous dark fur falls back to source-grid registration. Inspect generated
motion visually; distinct image hashes alone cannot prove a convincing gait.

`conversion.json` contains every source rectangle, integer translation, exact
alpha bounds, optional eye detections, source and export hashes, and independent
RGBA verification results. The verifier separately decodes every compressed
Aseprite cel and compares it against the corresponding native PNG and source.

After registration, a four-connected flood removes saturated magenta fringes
only where they connect to the outside through transparent pixels. Its explicit
threshold is R/B at least 120, G at most 80, with both R-G and B-G at least 90.
Opaque non-key outlines block the flood, preserving internal pink and purple
details. Every removal run is recorded in native coordinates and independently
verified against the untouched source. Retained RGBA pixels never move or change.
Use `-PreserveRegistration` when reprocessing a reviewed cleanup to retain the
prior canvas and all 16 exact integer translations.

## Incremental processing and final package

```powershell
./scripts/import-sp-scenes-batch.ps1 -Publish
node scripts/verify-sp-scene-assets.cjs --partial
./scripts/prepare-sp-scenes-manifest.ps1 -Complete -Package
node scripts/verify-sp-scene-assets.cjs
```

Only completely verified and published records enter
`frontend/src/lib/generated/sp-scene-assets.json`. Partial manifests are allowed
while generation continues; the application must gate each style on all 30
registered breeds. Final packaging requires all 60 sets / 360 scenes / 960
native animation frames. Separate SP08 and SP15 archives each include 30 untouched
source atlases, 30 editable masters, 180 native scene PNGs, conversion reports,
and the style manifest (273 entries per archive). Downloads are
`puppyruby-sp08-breed-scenes.zip` and `puppyruby-sp15-breed-scenes.zip`.

Reviewed eye and front-paw positions live in
`local-assets/work/sp-scenes-v1/reaction-anchors.json`, keyed by `style/breed`; the manifest
merges only anchors whose width and height match the verified native canvas.
Accessory attachment metadata is reviewed separately by the renderer owner.

`site-assets-inventory.json` lists only verified scene images and SHA-256 hashes
for a later S3/CDN release. These scripts do not upload assets or change CDN
environment variables.

## Retrying a failed or reviewed conversion

`-RetryFailed` permits retrying an unchanged source only when no verified report
or editable master exists. A successful conversion is immutable by default.
For a reviewed pipeline registration change, use:

```powershell
./scripts/reprocess-sp-scenes.ps1 -Style sp08 -Breed pomeranian `
  -RevisionLabel reviewed-registration-update
```

The reprocessor validates all hashes, resolves every source and destination
inside the workspace, and moves the complete old output to a named backup before
running Aseprite again. It never deletes the original source or prior version.
