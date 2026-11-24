# Force Block compatibility

This patch adds support for the hidden Geometry Dash Force Block objects used by the bundled `Dash` level.

## Recognized object IDs

- `2069` — standard Force Block.
- `3645` — alternate Force Block variant.

The objects remain invisible during gameplay. Their collision volumes are simulated independently of sprite rendering, so they do not require WebGL, shaders, or particle effects.

## Imported settings

| GD property | Meaning | Implementation |
|---|---|---|
| `k149` | Base force | Applied as a vector impulse over the reference force ticks |
| `k526` | Minimum force | Used when Force Range is enabled |
| `k527` | Maximum force | Used when Force Range is enabled |
| `k528` | Radial force | Directs the force relative to the block centre |
| `k529` | Force Range | Interpolates force by the player's position |
| `k530` | Force ID | Prevents same-ID blocks from stacking in one collision pass |
| `k5` | Flip Y | Reverses the force direction |
| `k6` | Rotation | Rotates the fixed force direction and collider |
| `k128`, `k129` | X/Y scale | Scales the collider dimensions |
| `k121` | No Touch | Disables the collider |
| `k135` | Hide object | Hides the visual; does not disable the force collider |

Force response follows the reference mode multipliers for Ship, UFO, Swing, Ball, Spider, Robot, and the default modes. Grouped Force Blocks follow group translation/rotation. Sideways gameplay now transposes the force vector as well as the collider geometry.

## Dash transition block

The bundled level contains an alternate Force Block (`3645`) at approximately `(2587, 145)` with:

- Rotation: `180°`
- Scale: `1.78 × 1.78`
- Base force: `4`
- Force Range: enabled
- Maximum force: `2`

This points downward in world coordinates. In the level's inverted-gravity Ball section, it pushes the player away from the ceiling and back toward the playable corridor. The block was previously discarded by the importer, which removed that part of the intended trajectory.

The level also contains thirteen standard Force Blocks (`2069`), including a seven-block hidden run between x=4665 and x=4845. Those are now imported as colliders too.

## Verification

Run from the project root:

```bash
node tests/force-block-compat.test.js
```

The test suite covers:

1. Import of both object IDs from the bundled level.
2. Hidden 2069 collider retention.
3. The exact 3645 transition-block properties.
4. Fixed, radial, rotated, flipped, and force-range vectors.
5. Force-ID de-duplication.
6. Group translation and sideways vector transposition.
7. GMD export/import preservation.
8. No-Touch behavior.
9. A focused Ball/inverted-gravity trajectory probe using the imported Dash level, comparing the same state with and without the 3645 block.

The focused probe confirms that the imported block changes the simulated vertical velocity from rising to descending. This is a physics-level integration test, not a full interactive browser playthrough. Manual playtesting of the complete section is still recommended.
