# Rhythm Runner Reimagined — Web Dashers fidelity pass

Reference implementation: `web-dashers/web-dashers.github.io` (the supplied source archive).

## Changes in this pass

### Ship and UFO
- Reworked ship/UFO composite rendering to follow Web Dashers' player-layer order: secondary overlays first, then the cube and vehicle base layers, then extra layers.
- The cube nested inside a vehicle now uses the selected cube icon at 0.55 scale; mini scaling is applied once, not twice.
- UFO tilt is calculated from the full simulation-frame displacement and affects the bird layers only. The cube layer stays upright.
- Ship rotation uses the reference horizontal velocity basis and the simulation's 1x-to-reference 2x coordinate conversion.
- Mini cube mode uses the selected cube icon at mini scale instead of substituting the default icon.

### Level visuals
- Merged additional frame records from the supplied Web Dashers atlas JSON files into `assets/js/data/frames.js`.
- Restored object-definition z-layer/z-order defaults when level objects omit those values or store zero.
- Rendered child sprites according to their own tint, additive blend flag, z offset, portal/orb guide flags, and audio-scale flag. Negative-z children render behind the parent; zero/positive-z children render above it.
- Added the separate `_2_001.png` detail overlay pass for solid and hazard sprites, using the object's detail colour channel.
- Added the reference 0.75 scale for ring objects, preserved sawblade twin-layer drawing, and restored the bundled coin animation and randomized pit-frame selection.
- Added visual handling for pulse and rotate triggers, including group/channel targeting, easing, and center-group rotation pivots. Move and alpha tweens now use the trigger easing parameters.

### Level data
- Rotated slope footprints are now used when converting GD object centers to model coordinates. This fixes half-cell position drift on rotated slopes.
- Pulse, rotate, and colour-trigger parameters are preserved by level export/re-import.

## Verification
- `node --check` passes for every JavaScript file in `assets/js/`.
- All 21 bundled official levels import: 156,809 objects total, with zero unknown object IDs skipped.
- Import → export → import preserves object counts and structural properties across all 21 levels. Maximum measured coordinate drift is approximately 0.000017 world units (GD's 3-decimal coordinate serialization).
- Trigger parameter round-trip test: zero mismatches.
- Ship and UFO simulation smoke test: finite positions, velocities, and rotations.

## Known limitations
- Browser rendering was not verified in this environment: Chromium 144 also timed out on a trivial headless `data:` page, before loading this project. The runtime result is therefore unknown; the static and simulation checks above are not a substitute for visual playtesting.
- A small set of frame names referenced by the supplied object/child definitions are absent from the supplied atlas data (`d_smallBall_01`–`04`, portal 05/06 extra layers, and `smallCoin_02_highlight`). They are left unresolved rather than replaced with invented artwork.
- Group rotation is currently a visual transform; dynamic collision geometry is not rotated with it yet.


## Consolidated Web Dashers merge — object rotation anchor pass

This build keeps the earlier feature-rich Web Dashers fixes and adds the trim-aware atlas placement correction from `rhythm-runner-object-rotation-fix.zip`.

- Preserved the earlier ship/UFO rendering, grouped-object rotation/pivots, pulse and rotate triggers, trigger easing, child tint/blend/z-order behavior, detail overlays, portal/orb guide filtering, and level-data import/export behavior.
- Added trim-aware placement for primary atlas sprites, portal back frames, glow frames, solid/hazard detail overlays, child sprites, and legacy tint-0 child frames. Trim offsets are applied in the object's local space so authored rotations and flips pivot around the original sprite origin.
- Kept pulse/group transforms and the earlier richer child-sprite rendering rather than replacing the renderer with the reduced accuracy-pass implementation.
- Merged accuracy-pass data corrections: object 135 is classified as a pit hazard with a matching hitbox; object 1755 is hidden in play mode; solid-deco sprites render at full opacity while their fallback outline remains faint; and z defaults for objects 675–677 are present.

Validation performed for this merge: JavaScript syntax checks, atlas trim-offset formula comparison against the Web Dashers reference data, and ZIP integrity checks. Browser visual/runtime verification was not completed in this environment.

## Level parsing and rendering audit (official levels 1-21)

Method: every object ID in the bundled levels was checked against the Web Dashers object table (`allObjects.js`) for kind, and against the black flag (`black: true` or `tint: 0`). Frame names were checked against the atlas and the reference sheet JSON.

### Fixed
- Object 135 (`fakeSpike_01_001.png`) is a decoration, not a hazard. Web Dashers and the fork both type it `deco` with no collider. It was a lethal pit with its own hitbox, which affected 130 instances (Theory Of Everything 2: 121, Geometrical Dominator: 9). Its frame name is corrected; its black default is unchanged.

### Verified, no change needed
- Kind classification matches the reference for every object instance except the intended cases: decorative slopes (no collider, per `_isDecorationSlopeId`), convert-on-import decorations, and text objects.
- Black-default flags match the reference exactly for all object IDs.
- Frame coverage: 628 of 632 frame names used by the levels resolve. The four `d_smallBall_*` frames are absent from every reference sheet, so they stay unresolved.
- Rotated hazards are tested with their rotation (`rotOverlap`). Rotated solids have no non-right-angle cases in the bundled levels.
- The built-in demo still clears in 705 frames and every level loads with the same results.

### Gap table corrections
- Ground tiling is implemented (it is listed as a gap in the table above, which is stale).
- Rotated collision is implemented for hazards, portals and slopes. The table entry above is stale for those.

## Level accuracy and mobile rendering pass — 18 November 2026

Compared the supplied build against the bundled Web Dashers reference object table and `assets/scripts/core/level.js`.

### Parsing / object classification corrections
- Corrected object 135 to a visual decoration, not a lethal pit. This affects 130 instances across Theory Of Everything (121) and Geometrical Dominator (9).
- Corrected objects 918, 1327, 1328, 1584, and 2012 to visual decorations. Their reference object definitions have type `deco`; their optional `hitbox_radius` metadata does not create a collider because the reference only registers colliders for type `hazard`.
- Corrected editor-only damage markers 3610 and 3611 to inert trigger visuals, not gameplay hazards.
- Corrected object 1614 to a coin-shaped decoration, not a collectible coin.
- Corrected the full slope-object set: all 180 IDs in the supplied slope table are type `deco` in the Web Dashers object table. They now render as decorative wedges and do not create collision surfaces. The previous hand-maintained decoration-slope ranges were incomplete.

### Mobile rendering optimization
- Split the play renderer's x index into static and grouped objects. Static objects now use a viewport-sized query plus 180 world units of overscan; grouped objects retain the previous 1200-unit query window to preserve trigger movement/rotation coverage.
- Cached each object's z-depth and source-order key when the level render index is rebuilt, rather than recomputing object type/default z metadata inside every sort comparison.
- Reused a single visible-object buffer instead of allocating a fresh `.slice()` every frame.
- Cached child-sprite z-order and legacy-child filtering per object ID. Previously, every child-bearing instance sorted a fresh child array twice per frame (front and back passes); Fingerdash contains 10,247 such instances, so this removed up to 20,494 repeated array-copy/sort operations per frame.
- Kept the same stable depth/source-order draw semantics.

### Validation
- All 21 bundled official levels import: 156,809 objects total, with zero unknown IDs skipped.
- Import → compressed export → re-import preserves object counts, IDs, positions, and rotations for all 21 levels.
- All 820 distinct object IDs used by those levels match the reference object type after accounting for the engine's equivalent aliases (hazard/spike, inert trigger visuals, and text objects).
- Object z-layer, z-order, and detail-channel defaults match the reference for all used IDs that have a reference definition.
- Static render-window candidates at representative mid-level positions: Electrodynamix 756 → 213; Hexagon Force 1,621 → 521; Fingerdash 2,996 → 1,277. These are candidate-object counts, not measured FPS; grouped objects retain the old broad safety window.
- JavaScript syntax and ZIP integrity checks pass.

### Still requires device verification
- No real Firefox-on-Redmi frame-time measurement or browser visual comparison was available here. The candidate-count reductions are structural evidence, not a promise of a specific FPS improvement.
- The reference source archive does not expose an authoritative collider for decorative slopes; they are intentionally non-colliding because their object definitions are `deco` and the reference level loader only creates colliders for `solid` / `hazard` types.

## Follow-up visual animation fixes
- Group rotation tweens now mark the dynamic scene dirty every frame, so objects are repositioned/redrawn throughout rotate-trigger animations instead of remaining at their starting pose.
- Child sprites using `sawblade`, `dropRing`, or `gravJumpRing` frames now receive the same continuous spin as top-level sprites. Sawblade child sprites also use the black tint and mirrored half-turn layer used by Web Dashers.
- Updated the `game.js` cache version to v18.


## Web Dashers parity pass — slopes, breakables, wave-solid (this branch)

Reference: `web-dashers/web-dashers.github.io` @ 7d7ce7d (upstream "fix spider slopes / dual / rotated collisions").

### Slopes: full port of the reference system (replaces the previous independent slope model)
- `sim.js` now ports `player.js _handleSlopeCollision` + `_gdCubeSlopeCollision` verbatim (halved to
  1x units): the gd slope path runs for every mode (the reference always has gdCubeSlopes enabled) —
  back-wall kill (`_slopeBackWallHit`), flat-cap landing (`_slopeFlatCapLand`), the ride target with
  perpendicular offset (`size / cos(angle)`) clamped to the slope box, the on-slope state machine
  (`_gdWasOnSlope` / `_gdLastSlope*`), crest/trough intersection tolerance (20), sliding-down stick
  (4/1), the crash window (2) with the 24-tick mode/flip grace, ball push handling, flyer head-stick
  and fall push, and the keepYVelocity fast-rise passthrough.
- Slope exit velocity system: `_slopeExitVel` armed by every snapped substep, launch impulse
  `_slopeLaunchMultiplier` (0.8/acute, cap 1.1, gain 1.4) with the 0.1 s contact ramp (floor 0.4) and
  the fly-mode 0.75 scale, swing cap 6.5, plus the jump boost (`_applySlopeJumpBoost`, +25% of the
  scaled exit velocity, cap base*1.4) on cube and robot jumps.
- Wave slopes: die on solid-side penetration of the small hitbox (4.5, mini 3) or the back wall —
  the reference wave branch (the slide branch is dead code with gdCubeSlopes on).
- Slope records carry the reference slope-type flags: `gdSlopeType` / `gdSlopeSolidAbove` /
  `gdSlopeWallOnLeft` ported into `level-model.js` (bitmask table incl. flipX/flipY/rot).
- Candidate selection follows the reference: best candidate across all nearby slopes by gravity-side
  height, applied after the solid pass; a slope kill only fires when nothing landed that step; orbs
  and pads skip the slope snap on their boost step (`slopeBoostSkipSnap`).

### Breakable blocks (obj 143, Electroman Adventures)
- The break trigger now uses the inner hitbox (4.5) like the reference solid branch — previously the
  full outer box broke blocks on grazes, so blocks broke as/after the player left them instead of on
  real contact. Landing on the support face is still solid; any other inner-box contact breaks.
- Wave vs solids: the death and breakable contact now use the reference wave inner (waveHitSize/3 =
  1.5, mini 1) instead of the full wave hitbox.

### Verification
- `node --check` on every changed file; the 14 Force Block tests still pass; the 22-level load/step
  smoke passes.
- Same-input A/B against the reference (recorded Web Dashers macro frames replayed on this engine
  through the real game.js): 201 frames of Clutterfunk and 144 frames of Hexagon Force match
  frame-perfect (x, y, vy, mode, ground) until the reference bot's own death — including orbs, pads,
  rotated-spike grazes and gravity portals.
- Synthetic slope probes: 45-degree ride + crest launch (exit velocity = tangent x multiplier x ramp,
  matches the reference formula), falling-slope ride from the extrapolated lead-in, back-wall kill
  ordering (the ride lift outruns the wall exactly like the reference).
- Breakable semantics probe: support-face stand = solid, side/underside inner contact = break on the
  contact frame, outer-box grazes and neighbouring hover = nothing.
