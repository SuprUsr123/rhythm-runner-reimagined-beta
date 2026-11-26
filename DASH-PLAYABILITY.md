# Dash playability pass

Date: 2026-11-25

This pass uses the newly supplied `crash_fix.zip` as its starting point. The work is focused on making Dash's core route render and respond correctly; it does not attempt the deferred Geometrical Dominator repair or full Geometry Dash 2.2 parity.

## Changes

### Positional triggers follow actual movement

The positional-trigger sweep now derives its direction from the player's actual world-X displacement between frames instead of `dirSign`. The latter describes intended horizontal travel and can disagree with the coordinate change during rotate-gameplay transitions. The old direction check could therefore skip positional camera exits, zoom resets, and colour triggers in Dash's rotated section.

### Rotated camera follows the rotated travel axis

When gameplay is sideways, the camera now follows the player's world-Y coordinate through the camera's Y offset. Without this, the game kept following world X even though world Y had become the screen's horizontal travel axis, allowing the player to drift out of view.

### Unsupported 2.2 shader triggers are safely inert

Shader/post-FX trigger IDs are left inert in this Canvas 2D build. The existing partial post-processing path clears the composed frame before it has a complete redraw path for all effects, which can leave a blank/white viewport. This avoids presenting a broken effect. No WebGL shader or particle-trigger implementation was added.

### 2.0 composite object audit

Dash contains 150 distinct object IDs with composite child-sprite definitions. All child frame references used by those definitions resolve in the bundled SD frame atlas. Two child-only objects (IDs 50 and 918) have no usable parent frame and rely on the renderer's existing child-only fallback; ID 914 is text and uses its separate text renderer. No missing composite child frames were found in Dash.

The existing renderer retains layered child drawing, z-order sorting, parent/child transforms, tinting, and back/front child passes. This audit establishes that Dash's object references are present; it is not a pixel-perfect comparison against the original game.

## Validation performed

- Loaded official Dash (level index 22): 17,810 objects, end X 23,820.
- Imported simulation data: 1,159 solids, 1,289 spikes, 35 portals, 28 orbs, 14 Force Blocks, and 977 trigger records.
- Noclip progression through the first rotate-gameplay transition: reached the sideways cube section around X=2,501 without runtime errors.
- Camera progression after that transition: zoom returned to 1.0; the static-camera segment engaged and its exit later released the camera lock.
- Canvas capture of the sideways section: no white post-FX panel; the layered decoration and player sprite were visible.
- Real keyboard path: Space starts an attempt; a subsequent Space press produces a jump; Space release stops holding. No JavaScript page errors were reported.
- JavaScript syntax checks and ZIP integrity check are run again during packaging.

## Known limits

- This is a targeted playability pass, not a verified full-level completion. I did not manually beat Dash end-to-end; the automated noclip probe is only used to inspect triggers, camera transitions, rendering, and crashes. A no-input attempt dies at the first obstacle, as expected for a platform game.
- Shader/post-FX trigger effects remain unsupported by design. They are inert rather than partially implemented and visually destructive.
- Geometrical Dominator is unchanged, as requested.
- The local test harness used an isolated Chromium page because the test environment blocks loopback navigation. The project's expected local hosting workflow is still the standard Python server below.

## Local testing

From the extracted project root:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080` in a browser.
