# Ruby Round native dog animation assets

This selectable style follows the supplied September 14 PuppyRuby reference.
It keeps the existing thirty breed IDs and adds five independently drawn animated
scenes per breed: front sitting idle, side/tail movement, walking, happy paw
movement, and sleeping. Each scene has four native source frames (600 total).

The source artwork is generated at its original resolution and imported by the
paid Aseprite executable. No body is resized, palette-quantized, recolored, or
assembled into artificial gait frames. Source atlases, editable masters, PNGs,
backups and audit reports stay inside the Git-ignored `local-assets/` folder.

## Source and Aseprite contract

Sources live at `local-assets/work/ruby-round-v1/originals/{breed}.png`. The atlas
has four columns and five rows in the scene order above. Clear gutters must
separate complete dogs. Native cells must be at least 160 pixels wide and tall.
Use explicit magenta `#ff00ff` background and cyan `#00ffff` center markers where
the interchangeable eyes belong. Side poses usually have one marker; front poses
have two. Sleeping poses may have zero, one, or two according to head direction.

The importer detects clear gutters near the source grid, adds transparent
padding, and registers the body by integer translation only. It removes the
explicit magenta matte and connected edge contamination, including transparent
holes inside tails and between legs. Strictly detected cyan center bounds are
expanded four native pixels to include pale and dark teal fringes. Only cyan-hued
pixels inside those bounds are repaired. The replacement is an existing clean
fur color nearest the median of a three-pixel exterior ring. Cyan at any
brightness is excluded from the ring. Old and new RGBA values are recorded per
pixel; all other retained pixels stay unchanged. A manual `-Anchors` JSON with `frames` (20 arrays
of source-cell `{x,y,width,height}` eye rectangles) can override marker-derived
anchors. Eye sizes must be integer multiples of their 16-pixel logical canvas.

`ruby-round-eyes.aseprite` contains thirty hand-authored pixel eye designs inspired
by the supplied eye reference. Each exported `eye-01.png` through `eye-30.png`
contains left/right eyes in two 16-by-16 columns. Their persisted IDs are
`ruby-eye-01` through `ruby-eye-30`. Each breed master embeds the unchanged body
and all thirty interchangeable eye layers. The default layer is visible; others
remain editable and hidden. Sleeping poses use closed eyes independently of the
chosen eye color. Five named animation tags cover all twenty frames.

## Import and verify

```powershell
./scripts/import-ruby-round-scenes.ps1 -Breed pomeranian -Publish
node scripts/verify-ruby-round-scene-assets.cjs --breed=pomeranian
./scripts/import-ruby-round-scenes-batch.ps1 -Publish
node scripts/verify-ruby-round-scene-assets.cjs --partial
```

The executable defaults to `C:\Program Files\Aseprite\Aseprite.exe`; pass
`-Aseprite` for a different installation. `-Reprocess` preserves the previous
complete output in a timestamped workspace backup before making a new version.
It never deletes source artwork or replaces a verified master silently.

`conversion.json` records source rectangles, translations, cleanup masks, eye
anchors, timings and SHA-256 values. The independent verifier decodes PNGs and
compressed Aseprite body cels, compares them with the original source and audited
edits, confirms distinct frames in each animation, and checks all thirty eye
designs. Distinct image hashes are necessary but do not replace visual animation
review.

Revision-five residual checks independently reject cyan inside repaired eye
regions, any opaque strong magenta key, and dark magenta fringe touching any
transparent area, including enclosed holes. Regression fixtures include the
actual dark cyan `[15,136,145]` and `[52,120,131]` colors that earlier cleanup
incorrectly accepted. Run `node scripts/ruby-round-cleanup-quality.cjs` for these
checks. The full verifier also runs them before decoding assets.

Exact cleanup predicates: strong key uses `R,B >= 160`, `G <= 120`, with both
differences from G at least 90. Connected matte uses `R,B >= 30`, `G <= 100`, both
differences at least 12, and an eight-neighbor flood seeded by every transparent
pixel. Cyan centers require `G,B >= 150`, `R <= 110`, and `min(G,B)-R >= 90`.
Within the bounded repair area, cyan contamination uses `min(G,B)-R >= 12`
without a brightness floor. Neutral black, warm fur and disconnected purple
tongues remain outside the background rules.

Rare reviewed cyan artifacts separated from a marker use an exact source hash
and native atlas rectangles in `scripts/ruby-round-cleanup-overrides.json`.
The importer rejects a different source hash; only cyan pixels inside the listed
rectangles can change. The independent verifier checks these bounds and hashes.

```powershell
./scripts/prepare-ruby-round-scenes-manifest.ps1 -Complete
node scripts/verify-ruby-round-scene-assets.cjs
```

The final manifest is `frontend/src/lib/generated/ruby-round-scene-assets.json`.
Its records contain native `width`, `height`, the editable download, and five
scene definitions with `png`, `frames`, `frameMs`, and per-frame `eyes` rectangles.
The frontend draws selected eyes over the eyeless PNG strip. A separate
`desktopPng` and `desktopFrames` preserve compatibility with existing desktop
clients: default eyes are composited, non-walking poses use one frame, and walking
uses four. Web animations always retain all four frames. Desktop image hashes and
dimensions are merged into `desktop-appearance-assets.json` without replacing
older style records.

Publication copies verified files into `local-assets/site/images/ruby-round-v1/`
and `local-assets/site/downloads/ruby-round-v1/`. This is the local site inventory;
S3 upload/CDN activation is a separate release operation. The final manifest must
have all thirty breeds before enabling full application to every breed.

## S3 and CDN release

```powershell
./scripts/publish-ruby-round-assets.ps1 -Action Plan
./scripts/publish-ruby-round-assets.ps1 -Action Publish
```

The strict publisher requires exactly thirty verified breeds and 511 files:
450 scene variants, thirty shared eye PNGs, thirty breed masters and one shared
eye master. It verifies the full objects through S3 and CDN GET requests before
activating the independent `ruby-round-media-release.json`. Existing media
releases remain unchanged. `-TestOnly` runs the offline publication integrity
checks without uploading files or changing release configuration.

The older general image/download publishers skip only the new
`images/ruby-round-v1` and `downloads/ruby-round-v1` subtrees. They retain existing
catalog and hash rules; this pack uses its dedicated publisher exclusively so
that mixed releases cannot silently change its CDN paths.

## Greeting anatomy and shared eye motion (revision 6)

The original greeting cells 2–4 duplicated raised forepaws while leaving the
same front feet on the ground. Reviewed image edits remove those duplicate
limbs for all thirty breeds. The built-in image generator edits are saved with
their exact prompts in `local-assets/work/ruby-round-v1/paw-fix/generated/`.
They must not replace complete source atlases: Aseprite merges only greeting
cells 2–4, preserving every unrelated source pixel and keeping the original
front-down greeting cell. Backups and SHA-256 provenance are retained.

```powershell
./scripts/repair-ruby-round-happy.ps1 -Breed pomeranian
./scripts/import-ruby-round-scenes.ps1 -Breed pomeranian -Reprocess -Publish
node scripts/verify-ruby-round-happy-repairs.cjs
```

The repair script refuses an already merged breed and requires manual review
before another revision. Only use it after visual approval of the edited
atlas. The pixel verifier proves the bounds of the edit; it cannot judge
whether the legs look anatomically correct.

Both Aseprite exports and the web renderer keep the frontal eye pair's original
spacing across idle and greeting frames. Only the center follows the head.
The web uses a single bounded mouse-gaze translation and a single blink group
for both eyes, so the eyes cannot drift or blink independently. Side views
retain one eye, and sleeping poses retain their closed-eye expression.
