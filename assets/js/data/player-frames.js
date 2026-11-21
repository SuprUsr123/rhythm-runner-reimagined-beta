// Player icon frames cut from the Web Dashers atlases (default GD icons: player_01, ship_01, player_ball_01, bird_01, dart_01, swing_01; robot/spider are
// the Robot_run_001 / Spider_run_001 skeletal poses baked from *_AnimDesc.json,
// parts placed with the same per-tag offsets Web Dashers applies in player.js).
// Format matches FRAMES: [sheet, x, y, w, h, trimX, trimY, srcW, srcH, rotated]
var PLAYER_FRAMES = {"player_01_001.png":[8,1490,0,60,60,0,0,60,60,0],"player_01_2_001.png":[8,171,217,14,14,0,0,14,14,0],"ship_01_001.png":[8,776,777,74,45,0,0,74,46,0],"ship_01_2_001.png":[8,1488,671,47,21,5,0,52,42,0],"player_ball_01_001.png":[8,71,998,70,70,0,0,70,70,0],"player_ball_01_2_001.png":[8,1951,677,36,36,0,0,36,36,0],"bird_01_001.png":[8,308,792,74,31,0,0,74,32,0],"bird_01_2_001.png":[8,948,191,70,28,0,0,70,28,0],"dart_01_001.png":[8,1844,1190,52,41,0,1,52,42,0],"dart_01_2_001.png":[8,1315,1818,10,20,0,0,42,20,0],"swing_01_001.png":[8,1231,745,66,60,0,0,72,60,0],"swing_01_2_001.png":[8,1312,2001,19,19,23,0,42,32,0],"robot_01_001.png":[17,0,0,120,120,0,0,120,120,0],"spider_01_001.png":[18,0,0,120,120,0,0,120,120,0]};
// register the baked robot / spider poses (sheets 17 and 18 in SPRITE_SHEETS)
if (typeof FRAMES !== 'undefined') {
  FRAMES['robot_01_001.png'] = PLAYER_FRAMES['robot_01_001.png'];
  FRAMES['spider_01_001.png'] = PLAYER_FRAMES['spider_01_001.png'];
}
