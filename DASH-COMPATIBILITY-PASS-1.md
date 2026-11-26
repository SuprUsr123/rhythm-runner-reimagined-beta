# Dash Compatibility Pass 1 — channel-trigger axis fix

This pass is a first compatibility correction, **not a completed or cleared Dash playthrough**.

## Confirmed baseline

- Dash imports 17,810 objects and initializes in the browser test harness.
- No page JavaScript exceptions during startup/import.
- Dash contains 20 Rotate Gameplay triggers, 20 zoom triggers, 20 camera-rotation triggers, 6 camera-offset triggers, and 4 camera-edge triggers.
- A noclip progression probe reached world X=2503 and the zoom tween was active (zoom 0.856), consistent with the zoom reset at X=2445 having just started; the test was not a full run.
- The original project was hosted through Python's HTTP server; browser access uses request interception to work around this session's loopback-navigation restriction.

## Fix

The trigger-channel cursor previously compared every channel trigger using world-X and trigger-left. Web Dashers' reference (`assets/scripts/core/level-channels.js`) switches the cursor axis during sideways gameplay: world-Y and trigger-Y are used instead. The reference also sorts each channel according to its Rotate Gameplay direction:

- move 1: Y ascending
- move 2: Y descending
- move 3: X descending
- move 4: X ascending

Rhythm Runner now uses the corresponding axis and order for channel-trigger sequencing. This affects channels that drive camera zoom, camera rotation, camera offsets, camera edges, and gameplay rotation—especially during Dash's sideways sections.

## Validation

- Browser initialization / level import: passed.
- Browser smoke test: no JS page errors.
- Noclip probe to X≈2503: reached; zoom reset tween active.
- Channel direction/axis regression tests: run with `node tests/dash-channel-axes.test.js`.
- All source JavaScript files syntax-checked.

## Not yet verified

- End-to-end keyboard completion of Dash.
- Pixel/temporal camera parity with Web Dashers through all sections.
- Remaining unsupported objects/triggers and their effect on gameplay.
- Full physics parity for spider, dash, swing, and 2.2-specific mechanics.
