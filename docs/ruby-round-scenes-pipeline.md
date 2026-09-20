# Ruby Round native dog animation assets

## Version three: independently redrawn sixteen-action atlases

The current redraw workflow replaces all sixteen actions from new reference-led
artwork. Each breed has an 8-by-8 source atlas: read left to right, top to bottom,
and group each four consecutive cells into one action. The order remains
`idle`, `side`, `walk`, `happy`, `sleep`, `typing`, `petting`, `eat`, `belly`,
`stretch`, `wag`, `scratch`, `walk-left`, `walk-right`, `walk-up`, `walk-down`.
The thirty breeds contain 480 strips and 1,920 source frames.

The belly frames must already show a dog on its back with anatomically distinct
raised paws and visible pads. A sleeping pose rotated upside down is not an
acceptable source. Rear walking, stretching, scratching, props and limbs must
also exist in the source drawing. The old v2 pose-extension script is archived
below and is not part of this redraw workflow.

```powershell
./scripts/import-ruby-round-redrawn.ps1 -Breed pomeranian -InputPng local-assets/work/ruby-round-v3/originals/pomeranian.png -Background transparent-artifacts -FringeAlphaMax 8
node scripts/verify-ruby-round-action-assets.cjs --source-version=v3 --breed=pomeranian
```

The importer uses the installed Aseprite executable. It copies the original to
`local-assets/work/ruby-round-v3/processed/{breed}/source-input.png`, separates
the 64 cells using clear gutters, and pads/registers each with integer translation.
It does not resize, mirror, rotate, recolor, or synthesize body poses. The source
atlas is preserved at `local-assets/work/ruby-round-v3/originals/{breed}.png` for
release verification. Importing an alternate input path is allowed, but release
registration still requires that canonical source copy and its matching hash.
If a source places the two four-frame action groups at different vertical
positions, a source-hash-bound manual specification may supply all 64 native
`cells` rectangles. The proof then uses `gridMode: reviewed-source-rectangles`
and does not claim a uniform detected gutter grid. Both importer and independent
verifier require every visible source pixel above the reviewed background key
to belong to exactly one cell. The verifier also checks the copied manual file's
hash and every rectangle; these bounds cannot resize or fabricate a frame.

`transparent` preserves alpha; `border-magenta` removes an explicit key and
connected magenta fringe. `transparent-artifacts` removes only pixels whose
alpha is between 1 and the explicitly selected `FringeAlphaMax` (1–48), connected
to alpha-zero pixels through that same low-alpha region by eight-neighbor
connectivity. The selected threshold and every removed RGBA value are recorded.
The default remains 8. A larger threshold requires a source-specific inspection
reason, source hash and matching threshold in `reviewedFringeCleanup`; no batch
silently raises the global default. The publisher rejects missing or mismatched
reviews and thresholds above 48 before release activation.
The threshold does not authorize removing opaque artwork. Cyan eye sentinels are
repaired only inside bounded marker regions using an existing clean surrounding
fur color with alpha at least 240. Their tight core rectangles also remove
enclosed dark pupil fragments; the expanded fringe changes only cyan pixels.
Source-hash-bound manual `cyanNeutralizeRegions` can remove cyan hue from a closed
eye in a rectangle no larger than 33 by 33 pixels while preserving its rounded
Rec. 709 luminance and alpha. The copied manual specification is hashed, and the
verifier checks its exact source and bounds. Every old/new pixel is recorded.

Each action records four `eyeModeByFrame` values: `shared` has one or two
interchangeable eye anchors, `baked-closed` keeps a naturally drawn closed
expression and has no shared anchors, and `hidden` has no visible eyes. Rear
walking uses `hidden`. Sleeping and belly poses can contain natural closed
expressions or open shared eyes according to their actual source frame. Shared
eyes retain all thirty existing style IDs. Source-specific anchors must follow
the new heads; coordinates and accessory overrides from the previous drawing
cannot be assumed to fit.

Every breed exports a 64-frame/16-tag editable master and a 20-frame/5-tag
compatibility master, each with one body layer and thirty eye layers. The latter
contains fresh source frames 1–20. It also exports all sixteen body strips plus
default-eye and desktop variants of the first five. Desktop variants contain
four walk frames and one frame for each other scene. The unchanged public path
prefix `ruby-round-v1` is a compatibility namespace; the immutable release base
identifies the actual version. These outputs preserve the exact 871-file base
allowlist, including the common eyes and both master types.

`motion-conversion.json` (64 frames) and `conversion.json` (20 frames) both use
`version: 3` and `sourceKind: independently-redrawn-64-frame-atlas`. They record
the same original hash, all 64 source rectangles and cleanup edits, native
dimensions, per-frame anchors, all output hashes, and explicit false values for
resizing, quantization, fabrication, old-pose derivation, mirroring and rotation.
Action records use `kind: redrawn` and `source: independently-redrawn-atlas`.
This provenance is separate from the shared catalog's descriptive schema.

A targeted correction may replace one independently drawn source cell using
Aseprite before import. Preserve an assembly sidecar with the original atlas,
correction image and final atlas hashes, the replacement rectangle, and proof
that all pixels outside it are unchanged. Copy source pixels without rotation,
mirroring or resampling. This is how an anatomical correction can replace a
five-pad Dachshund frame while retaining the other 63 drawings. The resulting
atlas hash is the importer and release verifier's primary source identity; the
assembly sidecar preserves the additional source history. A native frame
assembly can also repack 64 unscaled source crops into transparent padding:
`method: Native RGBA frame assembly only` records relative source paths and
hashes, ordered frame mappings, equal-sized source/destination rectangles, and
the exact corrected frame IDs. The verifier reconstructs the entire atlas,
rejecting duplicate source poses, overlapping destinations, changed pixels and
nonzero padding. This preserves complete poses when adjacent source drawings
need different crop boundaries.
The independent verifier reopens the archived original and correction images
and checks every final pixel against the recorded copy rectangle. Fresh imports
also preserve `importer-source.lua` with its exact historical hash. Rechecking an
older output never rewrites its importer hash to claim use of a newer script.

The independent verifier reconstructs permitted cleanup directly from the atlas,
compares every retained source pixel to exported strips, decodes Aseprite body
and eye cels, checks all 16 tag ranges and timings, and verifies compatibility
composites. Visual animation review must still check anatomy, visible pads,
head direction, eye placement, readable motion and breed consistency. Pixel
equality and different frame hashes alone cannot establish those qualities.

Release registration and publication require
`local-assets/work/ruby-round-v3/review/visual-review.json` with one completed
manual inspection for each of the thirty breeds. Each record contains
`reviewMethod: manual-visual-inspection`, a reviewer and UTC inspection time,
the actual source and 64-frame master SHA-256 values, and the exact hashes of
all four native panels (`actions1-4`, `actions5-8`, `actions9-12`, `actions13-16`).
Its belly observation must pass frames 35 and 36 with four visible paw pads in
each, accompanied by an anatomical note and a face/closed-eye cleanup observation.
The gate only consumes these observations; it never generates visual approval.

The reviewed panels must match `review-inventory.json` and the final master.
The verifier reconstructs every panel frame independently from the source body
and default eyes, so matching file hashes cannot approve an unrelated preview.
QA may inspect immutable working snapshots while imports continue, but only
the exact inspected final panels and matching master/source identities can
pass release verification. Any reimport that changes them requires review again.

After all thirty sources pass, stage every breed locally with the importer's
`-Publish` option, then register the complete release:

```powershell
node scripts/verify-ruby-round-action-assets.cjs --source-version=v3 --staged --require-visual-review
./scripts/prepare-ruby-round-action-manifest.ps1 -SourceVersion v3 -Complete
```

The manifest command defaults to v3 and fails before any writes when one breed
is missing. It invokes the independent verifier before registering any records;
it never merges partial redraws with old artwork. It updates the web catalog,
desktop image hashes, both local manifests and the v3 asset inventory together
after validation. Generated records carry `assetVersion: 3`. The publisher rejects
mixed generations and requires new-atlas provenance, exact scene/action hashes,
and the fixed path allowlist. The publisher also reruns independent source pixel
verification before planning or uploading a v3 release. Staging and registration do not upload or activate
a CDN release. The current Windows app plays all sixteen native actions.
Its descriptor retains exactly five required `scenes` for earlier clients and
adds an optional complete `nativeActions` dictionary with the eleven other IDs.
Each additional entry carries its four-frame body hash, selected shared eyes,
native per-frame anchors and eye modes. Extra accessory placements use a separate
`accessoryLayer.nativeActions` map. These fields participate in `renderKey` while
the original five-scene `key` stays compatible with earlier clients.
The current client sends `X-PuppyRuby-Appearance-Version: 3` on pair, state and
action requests. Without that capability the route returns only the five
precomposed compatibility PNG descriptors and the legacy key. Body/eye metadata,
empty closed-eye anchors, native actions and `renderKey` are omitted so previous
layered clients cannot reject the new closed-eye contract. Version3 clients
receive the full native descriptor.

`desktop/export-ruby-default.cjs` embeds all 1,920 native frames for offline use:
150 compatibility PNG resources, 480 native body strips and one default shared
eye pair. Its 631 PNG resources plus the manifest, breed catalog and icon form
the finite 634-file desktop resource inventory. Every PNG is checked against the
registered fingerprint before it enters the executable. Core scenes retain their
legacy fallback resources and also carry all four layered frames for the new app.
Every verification input is hash-pinned for the full run, and registration
rechecks that snapshot immediately before writing any manifest. Concurrent
imports or review changes therefore fail closed instead of mixing generations.
The publisher also repeats complete local validation after remote byte checks
and before activating a release. Run the offline verifier regression fixtures
with `node scripts/verify-ruby-round-action-assets.cjs --self-test`.
After final registration and accessory slot generation, run
`node scripts/verify-ruby-round-redrawn-runtime.cjs --registered` to check all
thirty actual native descriptors, selectable eyes, extra accessory placements and
cache identities. `node scripts/verify-desktop-appearance.cjs` also exercises the
actual pair/state/action route with absent, older, invalid and version3 capability
headers.

## Archived version-one and version-two workflow

The following sections describe the previous assets for reproduction and audit.
Do not run the older preparation or extension commands over a v3 registration.
For an intentional historical v2 registration, the action manifest script now
requires `-SourceVersion v2`; historical action verification likewise requires
`--source-version=v2`.

This selectable style follows the supplied September 14 PuppyRuby reference.
It keeps the existing thirty breed IDs and adds five independently drawn animated
scenes per breed: front sitting idle, side/tail movement, walking, happy paw
movement, and sleeping. Each scene has four native source frames (600 total).

The source artwork is generated at its original resolution and imported by the
paid Aseprite executable. No body is resized, palette-quantized, recolored, or
assembled into artificial gait frames. Source atlases, editable masters, PNGs,
backups and audit reports stay inside the Git-ignored `local-assets/` folder.

## Sixteen-action Aseprite extension

The version-two motion pack keeps every pixel and URL in the original five-scene
contract, then adds eleven editable actions. The fixed action order is:

1. `idle`
2. `side`
3. `walk`
4. `happy`
5. `sleep`
6. `typing`
7. `petting`
8. `eat`
9. `belly`
10. `stretch`
11. `wag`
12. `scratch`
13. `walk-left`
14. `walk-right`
15. `walk-up`
16. `walk-down`

Every action has four native-resolution frames. Thirty breeds therefore produce
480 action strips and 1,920 frames. The eleven new body/action strips are built
in Aseprite from the reviewed five-scene artwork with integer pixel movement,
nearest-neighbor transforms and separate prop/motion layers. They are editable
action assets rather than replacements for the reviewed source drawings.

`shared/ruby-round-actions.json` is the action contract. A generated breed master
contains 64 frames, sixteen named tags, one body layer, one action-prop layer and
thirty interchangeable eye layers. Shared eyes follow their recorded anchor as a
pair. `sleep` uses its reviewed closed expression, `belly` contains a rotated
closed expression, and `walk-up` hides front-facing eyes.

```powershell
./scripts/generate-ruby-round-actions.ps1 -Breed pomeranian -Publish
./scripts/generate-ruby-round-actions-batch.ps1 -Publish
./scripts/prepare-ruby-round-action-manifest.ps1 -Complete
node scripts/verify-ruby-round-action-assets.cjs
```

Use `-Reprocess` to move the previous complete breed output into a timestamped
backup before regeneration. The editable masters are written to
`local-assets/work/ruby-round-v2/processed/{breed}/{breed}-16-actions.aseprite`.
Local publication stages eleven new PNG strips per breed below
`local-assets/site/images/ruby-round-v1/{breed}/actions/` and one 64-frame master
per breed below `local-assets/site/downloads/ruby-round-v1/`.

The generated frontend record adds `actions` and `motionAseprite`, while its
original `scenes` and `aseprite` fields remain unchanged. Existing Windows builds
strictly require those five legacy scenes, so adding new actions to `scenes`
would break installed clients. Web/admin code uses `actions` only when all
sixteen entries validate; otherwise it falls back to the five-scene contract.
Copying files into `local-assets/site` is local staging. It does not upload to S3
or activate a CDN release.

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

The strict publisher requires exactly thirty verified breeds and the fixed 871-file base:
450 compatibility scene variants, 330 add-on action sheets, thirty shared eye PNGs,
thirty 20-frame compatibility masters, thirty 64-frame action masters and one shared
eye master. It checks the fixed sixteen-action contract, native dimensions, source and
output hashes, per-frame eye anchors and the generated frontend registration before any
upload. Optional accessory PNGs are added only from validated entries in
`shared/accessories.json`; the publisher never discovers them by walking a directory.
It verifies the full objects through S3 and CDN GET requests before
activating the independent `ruby-round-media-release.json`. Existing media
releases remain unchanged. `-TestOnly` runs the offline publication integrity
checks without uploading files or changing release configuration. The script first
uses Gradle's offline runtime classpath. If that metadata is unavailable, it extracts
the exact libraries from the newest existing `backend/build/libs/puppyruby-api-*.jar`
without making a network request. The resolved value and its source are recorded in
`backend/build/ruby-round-publisher/runtime-classpath.txt` and `runtime-source.txt`.

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
