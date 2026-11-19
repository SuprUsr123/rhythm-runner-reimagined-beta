# Accuracy and mobile performance review

**Build date:** 18 November 2026  
**Reference:** supplied `web-dashers.github.io-main` source archive  
**Target:** Firefox on Redmi Note 13 4G; device-side profiling remains pending.

## Confirmed corrections

1. Object 135 is a decoration (`fakeSpike_01_001.png`), not a pit hazard. There are 130 occurrences in the 21 bundled official levels.
2. Objects 918, 1327, 1328, 1584 and 2012 are type `deco` in the reference object table. Their `hitbox_radius` metadata does not register a collider in the reference loader because it only creates hazard colliders for type `hazard`.
3. Objects 3610 and 3611 are editor trigger markers, not gameplay hazards.
4. Object 1614 is a coin-shaped decoration, not a collectible.
5. Every ID in the project's slope table is type `deco` in the reference object table. The earlier partial decoration-slope ranges incorrectly made many of these objects collidable. All 180 slope-table IDs are now visual-only decorations.

## Rendering changes

- Static objects are queried using the actual viewport half-width plus 180 world units of overscan.
- Grouped objects retain the previous 1200-unit visibility query, preserving the existing safety margin for move/rotate triggers.
- Render depth is cached per object when the spatial index is rebuilt.
- A reusable visible-object array replaces a new `.slice()` allocation on each frame.
- Child-sprite z-order and legacy-child filtering are cached per object ID. Fingerdash has 10,247 child-bearing instances; the old front/back passes could copy and sort 20,494 child arrays per frame.
- Stable depth ordering and source-order tie-breaking are retained.

The 180-unit static overscan exceeds the widest object-definition footprint found in the shipped definitions (130 world units). A sampled visibility test across all 21 levels found no static object that could pass the renderer's screen-space cull but was excluded by the narrower query.

## Validation results

- 21/21 official levels imported.
- 156,809 total objects; 0 unknown object IDs skipped.
- 21/21 compressed export/re-import round trips preserved object counts, IDs, positions and rotations.
- 820 distinct IDs used by official levels: 0 object-kind mismatches against the reference after equivalent internal aliases are accounted for.
- Z-layer, z-order and detail-channel defaults: 0 mismatches for used IDs present in the reference table.
- Hazard table: 0 entries whose reference type is not `hazard` (three custom IDs 675–677 are not present in the supplied reference table and remain custom definitions).
- Static visibility query: 0 false negatives in sampled player positions across all official levels.
- Simulation smoke test: 240 substeps per official level, 0 non-finite state failures.
- All JavaScript syntax checks and ZIP integrity checks pass.

## Candidate-count comparison

Counts below are the objects collected for rendering at representative mid-level positions, before the final screen-space cull. They are not FPS measurements.

| Level | Previous broad window | New split index |
|---|---:|---:|
| Electrodynamix | 756 | 213 |
| Hexagon Force | 1,621 | 521 |
| Fingerdash | 2,996 | 1,277 |

Grouped objects retain the broad query window, so the reduction varies by level and trigger usage.

## Not yet verified

No browser-level visual comparison or real Redmi Note 13 4G / Firefox frame-time measurement was possible in this environment. The optimization is validated structurally and with parser/simulation tests, but actual smoothness, GPU fill-rate, and memory pressure still need device playtesting. In particular, the later levels should be tested with hitboxes off and then with hitboxes on to distinguish renderer cost from diagnostic overlay cost.
