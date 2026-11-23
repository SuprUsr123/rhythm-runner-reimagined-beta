# Asset strip (build: Rhythm Runner Reimagined)

Removed, because nothing in index.html, assets/js or assets/css loads them:

- assets/js/data/frames.js: not loaded (the page loads frames-sd.js or frames-hd.js).
- assets/js/lib/pako.js: not loaded (the project decodes levels with fflate).
- assets/levels/dash.txt: not in the level list. Web Dashers' 22.txt is the source if Dash is added later.
- 720 SD sheets (assets/sprites/gd-sd) and 724 HD sheets (assets/sprites/gd-hd) that no frame in the tier tables uses.
- Root sprite sheets that no tier frame uses (CCControlColourPickerSpriteSheet-uhd, GJ_GameSheet04_UHD, GJ_WebSheet, player_robot_01_run, player_spider_01_run, and the rest of the root set except the sheets the tier tables and decor.js use).

Kept on purpose:

- assets/sprites/tex (4 MB): backgrounds and ground tiles are chosen by a level's header, and imported GMD levels can name any of them.
- SPRITE_SHEETS arrays keep their original length, so sheet indices do not shift. Entries for removed sheets are never requested.
- assets/js/data/player-frames.js: not loaded, and its sheet indices are stale. Robot and spider frames are missing from both tier tables. Fixing that is separate work.

Checks: the demo and every level run the same as before in both tiers, and no frame referenced by code or data points at a removed sheet.
