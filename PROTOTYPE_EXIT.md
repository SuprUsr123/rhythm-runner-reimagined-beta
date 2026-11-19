# Rhythm Runner Reimagined: prototype exit checklist

Reference for "out of prototype": the Web Dashers fork's shipped feature set, plus the
accuracy items raised during prototyping. Status is what the build does today.

## Done in this build
- Renamed to Rhythm Runner Reimagined (title, header, export names, level names, debug hook RRDebug).
- Stereo Madness imports and plays; object colors, background and ground channels, sprite art, rotation, half-block collision.
- Level string import/export round trip is exact (positions, flips, rotation, colors).
- Camera follows the player, and fly modes lock on their fly-bound center (Web Dashers' flyCameraTarget).
- Child parts of multi-part objects drawn in the object's flipped and rotated space (children.js, 8 unresolved child frames in shipped atlases).
- Sim physics checks: solid blocks kill from the side, landing on full and half blocks is correct, breakable blocks break once. Decorative wedge objects follow the supplied Web Dashers definitions and do not create collision surfaces.
- Gamemode sprites fit their hitboxes: ship and UFO scaled to 0.83 with the cube inside at 0.55 and centred, ball and swing trimmed slightly. The hitbox overlay draws each mode's real collision box.
- Settings in the play view: Noclip (uses the sim's existing debug flag), Show Hitboxes (player outer and inner boxes, solids, hazards), Show Percentage. Toggles are not saved between sessions.

## Gaps against the Web Dashers fork
| Area | Fork | Rhythm Runner today | Work |
|---|---|---|---|
| Main menu | Working menu with all 2.1 levels | Level list and builder tabs only | Menu screen, level cards, progress |
| Custom levels | Several shipped in the menu | Official and built-in levels only | Bundle custom level data |
| Icon kit | Colors and icons | None | Icon sprites, selector UI |
| Gamemodes | Ball, wave, cube, UFO, mini, speed portals | Cube, ship, UFO, wave, speed portals | Ball, mini portal, swing, spider |
| Settings | Noclip, hitboxes, level percentage in pause menu | Noclip, hitboxes, percentage toggles in play view (no pause menu, no saved settings, no decimals option) | Pause menu, saved settings, percentage decimals |
| Accounts | Save/load, cloud sync | None (no localStorage in this environment) | Account design and storage choice |
| Practice mode | Early version | None | Checkpoints, practice state |
| Level editor | Planned, fuller than ours | Working basic editor | Object palette, grid and coordinate placement |
| Slopes | Object-table wedges are visual decorations | Decorative wedges render; no collider is created for the supplied `deco` IDs | Recheck any custom non-reference slope IDs separately |
| Objects | Most objects work | Solids, hazards, decor, passable, breakables, glow and child parts work; detail colors and animation do not | Detail colors, animation |
| Ground | Tiled ground sprites | Solid color fill | Tiled ground from the 1001 channel |
| Wave sprite | Wave hitbox is small (9 units) | Sprite is about 52px wide against an 18px collision box | Decide: shrink sprite or keep the size |
| Rotated collision | n/a in fork detail | Rotated objects draw rotated but collide axis-aligned | Rotated hitboxes |

## Before release (not gameplay)
- Remove the RRDebug trace hooks in game.js or gate them off for release builds.
- Keep the no-transition, no-optional-chaining, no-native-dialog and touch-target rules from the rekindle-dev constraints.
- Check memory on the lowest-memory target device with all atlas sheets loaded.


## Consolidated renderer update
The current archive is cumulative: it retains the earlier Web Dashers functionality and includes the trim-aware sprite-origin correction for rotated atlas frames. Browser-level visual verification remains outstanding.


## 18 November 2026 accuracy update
- Corrected false hazard classifications (including object 135) and the non-collectible object 1614.
- All 180 slope-table IDs are classified as decorative according to the supplied Web Dashers object definitions.
- The mobile renderer now uses separate static/grouped visibility indexes, cached render-depth keys, and a reusable visible-object buffer. See `PATCH_NOTES.md` for test totals and candidate counts.
