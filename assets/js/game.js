(function () {
  var GS = GameSim, C = GS.C;
  var CW = 1138, CH = 640, CELL = 30;
  var CENTER_X = CW / 2 - 150;      // reference centerX: fixed screen x of the player (play tab)
  var GROUND_SY = 460;              // reference b(0)
  var REF_O = 180;                  // reference camera anchor offset
  var FRAME_MS = 1000 / 60;
  var LEVELS = [];
  // decorations: frame atlas and the two game sprite sheets (embedded data URIs)
  var DECOR_ATLAS = DECOR_DATA.atlas;
  var SHEET_IMG = [], SHEET_OK = [];
  if (typeof Image !== 'undefined') {
    DECOR_DATA.sheets.forEach(function (src, si) {
      var im = new Image();
      im.onload = function () { SHEET_OK[si] = true; dirty = true; };
      im.src = src;
      SHEET_IMG[si] = im;
    });
  }
  BUILTIN.forEach(function (b) { LEVELS.push({ group: 'BUILT-IN', name: b.name, builtin: true, template: b.template, rle: b.rle }); });
  OFFICIAL.forEach(function (o) { LEVELS.push({ group: 'OFFICIAL', name: o.name, builtin: false, data: o.data, creator: o.creator, stars: o.stars, coins: o.coins }); });
  var levelIdx = 0;
  var LEVEL = LevelModel.fromTemplate(LEVELS[0].template);
  var LEVEL_NAME = LEVELS[0].name;
  var levelIsDefault = true;
  var DEMO_RLE = LEVELS[0].rle;
  var toolBtns = [];

  // the finish line is computed once per level by the sim (no scan of the object list per frame)
  function endX() { return LEVEL.sim().endX; }

  var demoHolds = [];
  function decodeDemo() {
    demoHolds = [];
    DEMO_RLE.split(' ').forEach(function (tok) {
      var parts = tok.split(':'), v = parseInt(parts[0], 10), c = parseInt(parts[1], 10);
      for (var i = 0; i < c; i++) demoHolds.push(v);
    });
  }
  decodeDemo();

  // ================= state =================
  var activeTab = 'play';
  var status = 'ready';           // 'ready' | 'play' | 'dead' | 'won'
  var frozen = false;             // test hook: pause the simulation, move the camera freely
  var attempts = 1;
  var p = null, p2 = null;        // p2 = dual-mode partner
  var holding = false, pressQueued = false;
  var acc = 0, lastNow = 0;
  var playCamY = 0;
  var flyLockY = null;            // camera Y held while in a locked fly mode
  var demoActive = false, demoIdx = 0, prevDemoHold = 0;
  var coinsGot = {}, coinCount = 0;
  var DEFAULT_INF = { dx: 0, dy: 0, hidden: false, alpha: 1 };
  var dirty = true;

  function flash(msg) { var el = document.getElementById('msg'); if (el) el.textContent = msg; }

  var brokenList = [];
  function spawn() {
    p = GS.newPlayer(0, 15, 'cube');
    p.onGround = true; p.canJump = true;
    p2 = null;
    coinsGot = {}; coinCount = 0;
    flyLockY = null;
    // only the blocks broken during the last run need restoring; the sim is rebuilt only if there were any
    if (brokenList.length) {
      for (var bi = 0; bi < brokenList.length; bi++) brokenList[bi].broken = false;
      brokenList.length = 0;
      if (LEVEL) LEVEL.dirty = true;
    }
  }
  // a restart resets the palette to the header colours (colour triggers fire again on the new run)
  var basePalette = null;
  function snapshotPalette() {
    basePalette = {};
    Object.keys(LEVEL.palette || {}).forEach(function (k) { basePalette[k] = LEVEL.palette[k]; });
  }
  function restorePalette() {
    if (!basePalette) return;
    LEVEL.palette = {};
    Object.keys(basePalette).forEach(function (k) { LEVEL.palette[k] = basePalette[k]; });
  }
  function resetRun() {
    restorePalette();
    spawn(); updatePlayCamera(true); startTriggers();
  }

  function loadLevel(i) {
    levelIdx = i;
    var L = LEVELS[i];
    if (L.builtin) {
      LEVEL = LevelModel.fromTemplate(L.template);
      DEMO_RLE = L.rle;
      levelIsDefault = true;
      flash('Loaded ' + L.name + '.');
    } else {
      try {
        var res = LevelModel.importText(L.data, { convertDeco: false });
        LEVEL = res.level;
        var skipped = 0;
        Object.keys(res.skipped).forEach(function (k) { skipped += res.skipped[k]; });
        flash('Loaded ' + L.name + ' by ' + L.creator + ': ' + LEVEL.objs.length + ' objects, ' + skipped + ' unsupported skipped.');
      } catch (e) {
        LEVEL = LevelModel.fromTemplate([]);
        flash('Could not load ' + L.name + ': ' + e.message);
      }
      DEMO_RLE = '';
      levelIsDefault = false;
    }
    LEVEL_NAME = L.name;
    snapshotPalette();
    decodeDemo();
    markLevel();
    demoActive = false;
    attempts = 1;
    resetRun();
    status = 'ready';
    clearSelection(); undoStack = []; redoStack = [];
    dirty = true;
  }
  function renderLevelList() {
    var box = document.getElementById('level-list');
    if (!box || !box.appendChild || (box.childNodes && box.childNodes.length)) { markLevel(); return; }
    var group = '';
    LEVELS.forEach(function (L, i) {
      if (L.group !== group) {
        group = L.group;
        var h = document.createElement('p'); h.className = 'group'; h.textContent = group;
        box.appendChild(h);
      }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'level-btn';
      b.setAttribute('data-idx', i);
      b.textContent = (i + 1) + '. ' + L.name + (L.builtin ? '' : '  (' + L.creator + ', ' + L.stars + (L.stars === 1 ? ' star' : ' stars') + ')');
      b.onclick = function () { loadLevel(i); setTab('play'); };
      box.appendChild(b);
    });
    markLevel();
  }
  function markLevel() {
    if (!document.querySelectorAll) return;
    var btns = document.querySelectorAll('#level-list button.level-btn');
    for (var k = 0; k < btns.length; k++) {
      var on = +btns[k].getAttribute('data-idx') === levelIdx;
      btns[k].className = 'level-btn' + (on ? ' selected' : '');
    }
  }
  function markTool() {
    for (var k = 0; k < toolBtns.length; k++) toolBtns[k].className = 'tool' + (k === toolIndex ? ' selected' : '');
  }

  function startDemo() {
    if (!levelIsDefault) { flash('The demo only matches the unedited level. Press RESTORE, then try again.'); return; }
    resetRun();
    status = 'play';
    demoActive = true; demoIdx = 0; prevDemoHold = 0;
    holding = false; pressQueued = false;
    dirty = true;
  }

  // A press while ready / dead / won starts or restarts WITHOUT jumping; only a press during a run jumps.
  function pressJump() {
    demoActive = false;
    if (status === 'ready') { resetRun(); status = 'play'; dirty = true; return; }
    if (status === 'dead' || status === 'won') { attempts++; resetRun(); status = 'play'; dirty = true; return; }
    if (!holding) pressQueued = true;
    holding = true;
    dirty = true;
  }
  function releaseJump() { holding = false; }

  // ---- portals ----
  function copyState(src, dst) {
    dst.x = src.x; dst.y = src.y; dst.lastY = src.lastY; dst.lastX = src.lastX; dst.vy = src.vy; dst.rot = src.rot;
    dst.mode = src.mode; dst.flip = src.flip; dst.mirrored = src.mirrored;
    dst.speed = src.speed; dst.grav = src.grav; dst.yStart = src.yStart;
    dst.onGround = src.onGround; dst.canJump = src.canJump; dst.isJumping = src.isJumping;
    dst.half = src.half; dst.inner = src.inner; dst.isMini = src.isMini;
    dst.robotAccel = src.robotAccel; dst.gdAccel = src.gdAccel;
    dst.portalIdx = src.portalIdx; dst.portalSet = src.portalSet;
    dst.portalFired = src.portalFired; dst.tpIgnore = src.tpIgnore;
    dst.speedIdx = src.speedIdx; dst.padIdx = src.padIdx;
    dst.dead = false;
  }
  function enableDual() {
    if (p2) return;
    p2 = GS.newPlayer(p.x, p.y, p.mode);
    copyState(p, p2);
    // a ball's partner plays with the opposite gravity
    if (p.mode === 'ball') GS.flipGravity(p2, !p.flip, 1.0);
  }
  function disableDual() { p2 = null; }

  function applyPortal(kind, r, pl) {
    pl = pl || p;
    if (kind === 'gravDown') { GS.gravityPortal(pl, false, 0.5); return; }
    if (kind === 'gravUp') { GS.gravityPortal(pl, true, 0.5); return; }
    if (kind === 'gravToggle') { GS.gravityPortal(pl, !pl.flip, 0.5); return; }
    if (kind === 'miniOn') { GS.setMini(pl, true); return; }
    if (kind === 'miniOff') { GS.setMini(pl, false); return; }
    if (kind === 'mirrorOn') { GS.setMirror(pl, true); return; }
    if (kind === 'mirrorOff') { GS.setMirror(pl, false); return; }
    if (kind === 'teleport') {
      // reference: y snaps to the exit, velocity carries over, the player leaves the ground
      // state behind, and the target is clamped to the fly ceiling of the current mode
      if (r && r.teleportY !== null && r.teleportY !== undefined) {
        var ty = r.teleportY;
        if (pl.flyCeil !== null && pl.flyCeil !== undefined && ty >= pl.flyCeil - pl.half - 0.5) ty = pl.flyCeil - pl.half - 0.5;
        if (Math.abs(ty - pl.y) > 0.001) { pl.onGround = false; pl.canJump = false; }
        pl.y = ty; pl.lastY = ty;
      }
      return;
    }
    if (kind === 'dualOn') { if (pl === p) enableDual(); return; }
    if (kind === 'dualOff') { if (pl === p) disableDual(); return; }
    GS.setMode(pl, kind);
  }

  // reference camera: _updateCameraY (2x units, px)
  var CAM_LOCK_MODES = { ship: true, ufo: true, wave: true, ball: true, spider: true };
  function updatePlayCamera(snap) {
    // fly modes lock the camera on the centre of their fly bounds (Web Dashers' flyCameraTarget), in the same 2x units
    // as the normal follow, and ease toward it
    if (CAM_LOCK_MODES[p.mode]) {
      if (flyLockY === null) {
        var fc = p.flyCeil !== undefined ? (p.flyFloor + p.flyCeil) / 2 : p.y;
        flyLockY = Math.max(0, 2 * fc - 320 + REF_O);
      }
      var lt = flyLockY, lc = playCamY;
      if (snap) playCamY = lt; else playCamY = lc + (lt - lc) * 0.1;
      return;
    }
    flyLockY = null;
    var yr = 2 * p.y;
    var cy = playCamY, T = cy;
    var A = cy - REF_O + 320;
    if (!p.flip) {
      if (yr > A + 140) T = yr - 320 - 140 + REF_O;
      else if (yr < A - 80) T = yr - 320 + 80 + REF_O;
    } else {
      if (yr > A + 80) T = yr - 320 - 80 + REF_O;
      else if (yr < A - 140) T = yr - 320 + 140 + REF_O;
    }
    if (T < 0) T = 0;
    if (snap) playCamY = T; else playCamY = cy + (T - cy) * 0.1;
  }

  function coinKey(c) { return c.cx + ',' + c.cy; }

  function stepOne(pl, i, lv, hold, pressed, end) {
    var r = GS.step(pl, 0.25, { pressed: pressed, hold: hold }, lv);
    if (r.portal) {
      // stacked portals arrive as an array (gamemode + gravity + size at the same spot)
      if (r.portal instanceof Array) {
        for (var pi = 0; pi < r.portal.length; pi++) applyPortal(r.portal[pi], r, pl);
      } else applyPortal(r.portal, r, pl);
    }
    if (r.speed !== null) GS.setSpeed(pl, r.speed);
    for (var k = 0; k < r.coins.length; k++) {
      var ck = coinKey(lv.coins[r.coins[k]]);
      if (!coinsGot[ck]) { coinsGot[ck] = true; coinCount++; }
    }
    if (r.breaks.length) {
      for (var bk = 0; bk < r.breaks.length; bk++) { r.breaks[bk].broken = true; brokenList.push(r.breaks[bk]); }
      LEVEL.dirty = true;                      // rebuild the sim without the broken blocks
    }
    return r;
  }

  // ---- groups and triggers (gameplay subset: toggle, alpha, move, stop; spawn or touch) ----
  var groupState = {}, trigFired = {}, groupQueue = [], frameNo = 0;
  var dynDirty = true, lastDynLevel = null;   // grouped objects are rebuilt only when the group state changes
  var currentGroup = 0, touchNext = false;
  function gstate(g) {
    if (!groupState[g]) groupState[g] = { bx: 0, by: 0, tweens: [], hidden: false, alpha: 1, atw: null };
    return groupState[g];
  }
  function frames(sec) { return Math.max(1, Math.round((sec || 0) * 60)); }
  function groupInfo(groups) {
    var dx = 0, dy = 0, hidden = false, alpha = 1, k, s, j, tw, f;
    for (k = 0; k < groups.length; k++) {
      s = groupState[groups[k]];
      if (!s) continue;
      dx += s.bx; dy += s.by;
      for (j = 0; j < s.tweens.length; j++) {
        tw = s.tweens[j]; f = Math.min(1, tw.t / tw.dur);
        dx += tw.dx * f; dy += tw.dy * f;
      }
      if (s.hidden) hidden = true;
      if (s.alpha < alpha) alpha = s.alpha;
    }
    return { dx: dx, dy: dy, hidden: hidden, alpha: alpha };
  }
  function tickTweens() {
    Object.keys(groupState).forEach(function (g) {
      var s = groupState[g], j, tw, f;
      if (s.tweens.length || s.atw) dynDirty = true;
      for (j = s.tweens.length - 1; j >= 0; j--) {
        tw = s.tweens[j]; tw.t++;
        if (tw.t >= tw.dur) { s.bx += tw.dx; s.by += tw.dy; s.tweens.splice(j, 1); }
      }
      if (s.atw) {
        s.atw.t++;
        f = Math.min(1, s.atw.t / s.atw.dur);
        s.alpha = s.atw.from + (s.atw.to - s.atw.from) * f;
        if (f >= 1) s.atw = null;
      }
    });
  }
  function stopGroup(g) {
    var s = groupState[g];
    if (!s) return;
    dynDirty = true;
    s.tweens.forEach(function (tw) { var f = Math.min(1, tw.t / tw.dur); s.bx += tw.dx * f; s.by += tw.dy * f; });
    s.tweens = [];
    s.atw = null;
  }
  function fireTrigger(t) {
    var p = t.p, g = p.target;
    if (!g) return;
    dynDirty = true;
    if (t.kind === 'stop') { stopGroup(g); return; }
    var s = gstate(g);
    if (t.kind === 'toggle') s.hidden = !p.activate;
    else if (t.kind === 'alpha') s.atw = { from: s.alpha, to: p.opacity === undefined ? 1 : p.opacity, dur: frames(p.dur), t: 0 };
    else if (t.kind === 'move') s.tweens.push({ dx: p.dx || 0, dy: p.dy || 0, dur: frames(p.dur), t: 0 });
  }
  // Reference rules: a non-touch trigger fires when the player passes it; a spawn trigger (touch or position)
  // queues its target group after its delay; the group's triggers then fire. Triggers in a spawn-targeted
  // group only fire through their group. Triggers never fire at level start by themselves.
  var targetsCache = {};
  function startTriggers() {
    groupState = {}; trigFired = {}; groupQueue = []; frameNo = 0; dynDirty = true;
    targetsCache = spawnTargets();
    startColourTriggers();
  }
  function spawnTargets() {
    var set = {};
    LEVEL.sim().triggers.forEach(function (t) { if (t.kind === 'spawn' && t.p.target) set[t.p.target] = true; });
    return set;
  }
  function spawnOnly(t, targets) {
    return t.groups.some(function (g) { return targets[g]; });
  }
  function fireTriggerAt(i) {
    var list = LEVEL.sim().triggers, t = list[i];
    trigFired[i] = true;
    if (t.kind === 'spawn') {
      if (t.p.target) groupQueue.push({ group: t.p.target, at: frameNo + Math.round((t.p.delay || 0) * 60) });
      return;
    }
    fireTrigger(t);
  }
  function processTriggers() {
    var list = LEVEL.sim().triggers, k, t, i, item;
    for (k = groupQueue.length - 1; k >= 0; k--) {
      item = groupQueue[k];
      if (frameNo < item.at) continue;
      groupQueue.splice(k, 1);
      for (i = 0; i < list.length; i++) {
        if (!trigFired[i] && !list[i].p.touch && list[i].groups.indexOf(item.group) >= 0) fireTriggerAt(i);
      }
    }
    if (!p) return;
    var targets = targetsCache;
    for (i = 0; i < list.length; i++) {
      t = list[i];
      if (trigFired[i]) continue;
      if (t.p.touch) {
        if (p.x >= t.x0 - C.HALF && p.x <= t.x1 + C.HALF && p.y >= t.y0 - C.HALF && p.y <= t.y1 + C.HALF) fireTriggerAt(i);
      } else if (!spawnOnly(t, targets) && p.x >= t.left) {
        fireTriggerAt(i);
      }
    }
  }

  // ---- colour triggers (29 BG / 30 ground / 105-915 channel): recolour the level palette ----
  var colTrigFired = [], colourTweens = [];
  function parseRGB(str) {
    var m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(str || '');
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : { r: 255, g: 255, b: 255 };
  }
  function rgbStr(c) { return 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')'; }
  function startColourTriggers() {
    colTrigFired = [];
    colourTweens = [];
    var list = LEVEL.sim().colourTriggers || [];
    for (var i = 0; i < list.length; i++) colTrigFired[i] = false;
  }
  function applyColourNow(t) {
    var op = t.p.op === undefined ? 1 : t.p.op;
    var c = { r: t.p.r * op, g: t.p.g * op, b: t.p.b * op };
    // a new trigger on a channel supersedes (and stops) any tween still running there
    for (var i = colourTweens.length - 1; i >= 0; i--) if (colourTweens[i].ch === t.p.channel) colourTweens.splice(i, 1);
    if (!t.p.dur || t.p.dur <= 1 / 60) {
      LEVEL.palette[t.p.channel] = rgbStr(c);
      return;
    }
    colourTweens.push({ ch: t.p.channel, from: parseRGB(LEVEL.palette[t.p.channel]), to: c, t: 0, dur: frames(t.p.dur) });
  }
  function tickColourTweens() {
    for (var i = colourTweens.length - 1; i >= 0; i--) {
      var tw = colourTweens[i];
      tw.t++;
      var f = Math.min(1, tw.t / tw.dur);
      LEVEL.palette[tw.ch] = rgbStr({ r: tw.from.r + (tw.to.r - tw.from.r) * f, g: tw.from.g + (tw.to.g - tw.from.g) * f, b: tw.from.b + (tw.to.b - tw.from.b) * f });
      if (f >= 1) colourTweens.splice(i, 1);
    }
  }
  function processColourTriggers() {
    var list = LEVEL.sim().colourTriggers || [];
    var targets = targetsCache;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (colTrigFired[i]) continue;
      // grouped colour triggers only fire through their spawn group, like the other triggers
      if (t.groups && t.groups.length && t.groups.some(function (g) { return targets[g]; })) continue;
      if (t.p.touch) {
        if (p.x >= t.x0 - C.HALF && p.x <= t.x1 + C.HALF && p.y >= t.y0 - C.HALF && p.y <= t.y1 + C.HALF) {
          colTrigFired[i] = true; applyColourNow(t);
        }
      } else if (p.x >= t.x) {
        colTrigFired[i] = true; applyColourNow(t);
      }
    }
    tickColourTweens();
  }

  function advanceFrame() {
    if (status !== 'play') return;
    frameNo++;
    processTriggers();
    processColourTriggers();
    tickTweens();
    var lvNow = LEVEL.sim();
    if (dynDirty || lvNow !== lastDynLevel) {
      GameSim.refreshDyn(lvNow, groupInfo);
      lastDynLevel = lvNow;
      dynDirty = false;
    }
    if (demoActive) {
      if (demoIdx >= demoHolds.length) demoActive = false;
      else {
        var dh = demoHolds[demoIdx++];
        if (dh && !prevDemoHold) pressQueued = true;
        holding = !!dh;
        prevDemoHold = dh;
      }
    }
    var lv = LEVEL.sim(), end = endX();
    for (var i = 0; i < 4; i++) {
      var pressed = pressQueued && i === 0;
      var hold = holding;
      var r1 = stepOne(p, i, lv, hold, pressed, end);
      var r2 = p2 ? stepOne(p2, i, lv, hold, pressed, end) : null;
      if (p.dead || (p2 && p2.dead)) { status = 'dead'; demoActive = false; break; }
      if (p.x >= end) { status = 'won'; demoActive = false; break; }
    }
    pressQueued = false;
    updatePlayCamera(false);
    dirty = true;
  }

  // ================= drawing =================
  var ctx = null, ectx = null;
  var PORTAL_LABEL = {
    gravUp: '^', gravDown: 'v', gravToggle: 'gt', cube: 'C', ship: 'S', ball: 'B', ufo: 'U', wave: 'W',
    robot: 'R', spider: 'Sp', miniOn: 'm+', miniOff: 'm-', mirrorOn: 'mr+', mirrorOff: 'mr-',
    dualOn: 'D+', dualOff: 'D-', teleport: 'TP', swing: 'Sw'
  };
  var SPEED_LABEL = { 200: 'x0.81', 201: 'x1.00', 202: 'x1.24', 203: 'x1.50', 1334: 'x1.85' };
  var PAD_LABEL = { 35: 'Y', 140: 'K', 1332: 'R', 67: 'G' };
  var ORB_LABEL = { 36: 'Y', 141: 'K', 1333: 'R', 84: 'G', 1022: 'g', 1330: 'D', 1704: 'd', 1751: 'b' };
  var LABEL_EXIT = 'TX';

  function speedLabel(v) {
    var names = [[GS.SPEED.HALF, 'x0.81'], [GS.SPEED.ONE, 'x1.00'], [GS.SPEED.TWO, 'x1.24'], [GS.SPEED.THREE, 'x1.50'], [GS.SPEED.FOUR, 'x1.85']];
    for (var i = 0; i < names.length; i++) if (Math.abs(names[i][0] - v) < 1e-6) return names[i][1];
    return 'x?';
  }

  function slopeCorners(o, x0, x1, y0, y1) {
    var sl = LevelModel.slopeOf(o);
    if (sl.flat) {
      // 45/135 wedge: the hypotenuse lands on the cell's centre line (horizontal or vertical)
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      var q = Math.round((((o.rot || 0) % 360) + 360) % 360 / 45) % 8;
      if (q === 1) return [[x0, cy], [x1, cy], [x1, y0]];        // solid below the centre line
      if (q === 3) return [[x0, y0], [x0, y1], [cx, cy]];        // solid left of the centre line
      if (q === 5) return [[x0, cy], [x1, cy], [x1, y1]];        // solid above
      return [[x1, y0], [x1, y1], [cx, cy]];                     // solid right (315)
    }
    if (sl.above) {
      // solid above the line: ceiling slope
      return sl.dir > 0 ? [[x0, y0], [x0, y1], [x1, y1]] : [[x0, y1], [x1, y1], [x1, y0]];
    }
    return sl.dir > 0 ? [[x0, y0], [x1, y1], [x1, y0]] : [[x0, y1], [x1, y0], [x0, y0]];
  }

  // colour of a block or decoration from its GD colour channel (null: keep the plain black and white look)
  var MONO = false;                 // true: plain black and white (e-ink friendly), ignores channel colours
  function chanColor(o) {
    var pal = LEVEL.palette;
    if (MONO || !pal) return null;
    var ch = o.col || defChannel(o.id);
    if (!ch || ch === 1000 || ch === 1001) return null;   // bg / ground come from their own header channels
    if (pal[ch]) return pal[ch];
    if (ch === 1) return '#00ffff';          // unset player-1 channel: GD default cyan
    return '#ffffff';                        // reference ColorManager.getColor: unset channels default white
  }
  // background and ground come from their own header channels (1000, 1001), never from object channels.
  // Unset channels use the reference ColorManager defaults: bg rgb(0,102,255), ground rgb(0,68,170)
  function bgColor() { return MONO || !LEVEL.palette ? '#fff' : (LEVEL.palette[1000] || 'rgb(0,102,255)'); }
  function groundColor() { return MONO || !LEVEL.palette ? '#000' : (LEVEL.palette[1001] || 'rgb(0,68,170)'); }

  // ---- background / ground textures (reference game-scene _bg tileSprite + _buildGround) ----
  // texture key kA6 -> file game_bg_<kA6 + 1>_001-hd.png ; kA7 -> groundSquare_0<kA7>_001.png
  var TEX_IMG = {}, TEX_OK = {};
  function texImage(file) {
    if (TEX_IMG[file] !== undefined) return TEX_IMG[file];
    var im = new Image();
    if (typeof Image !== 'undefined') {
      im.onload = function () { TEX_OK[file] = true; dirty = true; };
      im.onerror = function () { TEX_OK[file] = false; };
      im.src = 'assets/sprites/tex/' + file;
    }
    TEX_IMG[file] = im;
    return im;
  }
  // reference _createMirroredBackgroundTexture: the image stacked on its own vertical flip
  var MIRROR_CANVAS = {};
  function bgMirrorCanvas(file) {
    if (MIRROR_CANVAS[file] !== undefined) return MIRROR_CANVAS[file];
    var im = texImage(file);
    if (!TEX_OK[file] || !im.width) return null;
    var c = document.createElement('canvas');
    c.width = im.width; c.height = im.height * 2;
    var t = c.getContext('2d');
    t.drawImage(im, 0, 0);
    t.save();
    t.translate(0, im.height * 2);
    t.scale(1, -1);
    t.drawImage(im, 0, 0);
    t.restore();
    MIRROR_CANVAS[file] = c;
    return c;
  }
  var TINTED_TEX = {};
  // vertically flipped copy of a texture (the reference ceiling tiles are the ground tiles setFlipY)
  var FLIP_TEX = {};
  function flippedCanvas(src) {
    var key = src.__tkey || (src.__tkey = Math.random());
    if (FLIP_TEX[key]) return FLIP_TEX[key];
    if (!src.width) return null;
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var t = c.getContext('2d');
    t.translate(0, src.height);
    t.scale(1, -1);
    t.drawImage(src, 0, 0);
    FLIP_TEX[key] = c;
    return c;
  }
  function tintedCanvas(src, col) {
    var key = (src.__tkey || (src.__tkey = Math.random())) + ':' + col;
    if (TINTED_TEX[key]) return TINTED_TEX[key];
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var t = c.getContext('2d');
    t.drawImage(src, 0, 0);
    t.globalCompositeOperation = 'multiply';
    t.fillStyle = col;
    t.fillRect(0, 0, c.width, c.height);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(src, 0, 0);
    TINTED_TEX[key] = c;
    return c;
  }
  function bgFileOf(level) {
    var id = level.bgId ? (level.bgId <= 1 ? 1 : level.bgId) : 1;
    return 'game_bg_' + ('0' + id).slice(-2) + '_001-hd.png';
  }
  // reference getGroundTextureId: kA7 -> "groundSquare_" + (kA7 - 1) texture key, whose file is
  // groundSquare_(kA7)_001.png (keys are 0-based, files 1-based). kA7 <= 1 -> file groundSquare_01.
  function groundFileOf(level) {
    var id = level.groundId ? (level.groundId <= 1 ? 1 : level.groundId) : 1;
    return 'groundSquare_' + ('0' + id).slice(-2) + '_001.png';
  }
  function ground2FileOf(level) {
    var id = level.groundId ? (level.groundId <= 1 ? 1 : level.groundId) : 1;
    return 'groundSquare_' + ('0' + id).slice(-2) + '_2_001.png';
  }
  // fills exactly the screen rect [x, x+w] x [y, y+h]; the pattern phase defaults to the rect
  // origin but can be pinned separately (phaseX/phaseY) so a clipped fill keeps the same
  // alignment as the reference tileSprite's tilePosition
  function drawTintedTiled(g, src, col, x, y, w, h, phaseX, phaseY) {
    if (!src || !col || w <= 0 || h <= 0) return false;
    var t = tintedCanvas(src, col);
    var pat = g.createPattern(t, 'repeat');
    if (!pat) return false;
    var a = (phaseX !== undefined ? phaseX : x) % t.width;
    var b = (phaseY !== undefined ? phaseY : y) % t.height;
    // the old code over-filled by a tile on every side, which painted the ground pattern over
    // the whole screen (hiding the background) and made every frame fill ~12x more pixels than
    // the viewport — the source of the mobile lag
    g.save();
    g.translate(a, b);
    g.fillStyle = pat;
    g.fillRect(x - a, y - b, w, h);
    g.restore();
    return true;
  }

  // grey decor sprites take their channel colour by multiplying; coloured sheets are drawn as they are
  var SPRITE_GREY = {}, TINTED = {};
  function spriteIsGrey(A) {
    var key = A[0] + ':' + A[1] + ':' + A[2] + ':' + A[3] + ':' + A[4];
    if (SPRITE_GREY[key] !== undefined) return SPRITE_GREY[key];
    var src = SHEET_IMG[A[0]], sw = A[3], sh = A[4], grey = false;
    if (src && sw > 0 && sh > 0) {
      try {
        var c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        var t = c.getContext('2d');
        t.drawImage(src, A[1], A[2], sw, sh, 0, 0, sw, sh);
        var d = t.getImageData(0, 0, sw, sh).data, sat = 0, cnt = 0;
        for (var q = 0; q < d.length; q += 4) {
          if (d[q + 3] < 128) continue;
          cnt++; sat += Math.max(d[q], d[q + 1], d[q + 2]) - Math.min(d[q], d[q + 1], d[q + 2]);
        }
        grey = cnt > 0 && sat / cnt < 14;
      } catch (e) {
        grey = false;                        // tainted canvas: draw the sprite as it is
      }
    }
    SPRITE_GREY[key] = grey;
    return grey;
  }
  function tintedSprite(A, col) {
    if (!col || !spriteIsGrey(A)) return null;
    var key = A[0] + ':' + A[1] + ':' + A[2] + ':' + A[3] + ':' + A[4] + ':' + col;
    if (TINTED[key]) return TINTED[key];
    var src = SHEET_IMG[A[0]], sw = A[3], sh = A[4];
    var c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    var t = c.getContext('2d');
    t.drawImage(src, A[1], A[2], sw, sh, 0, 0, sw, sh);
    t.globalCompositeOperation = 'multiply';
    t.fillStyle = col;
    t.fillRect(0, 0, sw, sh);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(src, A[1], A[2], sw, sh, 0, 0, sw, sh);
    TINTED[key] = c;
    return c;
  }

  // ---- sawblade spin (reference level.js: sawObjectIds spin continuously; frames containing
  // "sawblade" also get a black tint plus a mirrored black twin at rotation + PI) ----
  function newSet(list) { var s = {}, i; for (i = 0; i < list.length; i++) s[list[i]] = true; return s; }
  var SAW_IDS = newSet([183, 184, 185, 186, 187, 188, 397, 398, 399, 678, 679, 680, 740, 741, 742, 1619, 1620, 1708, 1709, 1710, 1734, 1735, 1736, 85, 86, 87, 97, 137, 138, 139, 154, 155, 156, 180, 181, 182, 1019, 1020, 1021, 1058, 1059, 1060, 1061, 1752, 396, 395, 222, 223, 224, 997, 998, 999, 1000, 1055, 1056, 1057, 394, 375, 376, 377, 378, 677, 676, 675]);
  var FAST_SAW_IDS = newSet([186, 187, 188, 89, 88, 98, 183, 185, 184, 397, 398, 399, 678, 679, 680, 740, 741, 742, 1619, 1620, 1705, 1706, 1707, 1708, 1709, 1710, 1734, 1735, 1736]);
  function sawPhase(o, kind, isFast, isDeco) {
    var seed = (o.gx * 73 + o.gy * 131 + (o.id || 0) * 7) | 0;
    var sign = (seed & 1) ? -1 : 1;
    var base = isDeco ? 0.0034 * 1.15 : (isFast ? 0.0063 : 0.0032);
    if (kind === 'ring') base = 0.0065;
    var r2 = (isDeco ? (isFast ? 0.75 : 0.45) : (isFast ? 0.65 : 0.4));
    var r1 = (Math.abs(seed) % 628) / 100;
    var tS = ANIM_MS / 1000;
    return sign * (base * ANIM_MS + r2 * (Math.cos(r1) - Math.cos(tS + r1)));
  }

  // ---- atlas sprites (ZainojdafMod / Web Dashers art). Sheets load once; frames are cut from them ----
  var SPRITE_UNIT = 0.5;                     // world units per atlas pixel (the hd atlases used here)
  var SHEET_IMGS = [];
  function sheetImage(si) {
    if (!SHEET_IMGS[si]) {
      var im = new Image();
      im.onload = function () { dirty = true; FRAME_TINTS = {}; FRAME_TINT_COUNT = 0; };  // drop tint canvases made before this atlas was ready
      // data URIs keep the canvas untainted on file:// (same-origin), which getImageData needs
      if (typeof SPRITE_SHEET_DATA !== 'undefined' && SPRITE_SHEET_DATA[si]) {
        im.src = SPRITE_SHEET_DATA[si];
        SPRITE_SHEET_DATA[si] = null;        // the Image owns its src copy now; free the string
      } else {
        im.src = SPRITE_SHEETS[si];
      }
      SHEET_IMGS[si] = im;
    }
    return SHEET_IMGS[si].complete && SHEET_IMGS[si].naturalWidth > 0 ? SHEET_IMGS[si] : null;
  }
  // channel tint, the same as Phaser's setTint used by Web Dashers: multiply, then keep the frame's alpha
  var FRAME_TINTS = {}, FRAME_TINT_COUNT = 0;
  function frameTint(name, f, col) {
    var key = name + '|' + col;
    if (FRAME_TINTS[key]) return FRAME_TINTS[key];
    if (FRAME_TINT_COUNT > 800) { FRAME_TINTS = {}; FRAME_TINT_COUNT = 0; }
    var img = SHEET_IMGS[f[0]];
    // the sheet may still be decoding: tinting an empty image would produce (and cache) a
    // fully transparent canvas (destination-in with an empty source clears everything), so
    // bail out until the atlas has loaded — the caller falls back to the untinted frame
    if (!img || !img.complete || !img.naturalWidth) return null;
    var c = document.createElement('canvas');
    c.width = f[3]; c.height = f[4];
    var t = c.getContext('2d');
    t.drawImage(img, f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
    t.globalCompositeOperation = 'multiply'; t.fillStyle = col; t.fillRect(0, 0, f[3], f[4]);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(img, f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
    FRAME_TINTS[key] = c; FRAME_TINT_COUNT++;
    return c;
  }
  // sprites that are pure white in the sheet (small spikes, ice spikes, clouds, decorative
  // spikes ...) would vanish on the white background: like the Web Dashers' black silhouettes
  // they are painted black here. Only near-white low-saturation ink counts.
  var WHITE_INK = {};
  function isWhiteInk(name, f) {
    if (WHITE_INK[name] !== undefined) return WHITE_INK[name];
    var v = false;
    var img = SHEET_IMGS[f[0]];
    if (img && img.complete && f[3] > 0 && f[4] > 0) {
      try {
        var c = document.createElement('canvas');
        c.width = f[3]; c.height = f[4];
        var t = c.getContext('2d');
        t.drawImage(img, f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
        var d = t.getImageData(0, 0, f[3], f[4]).data, sat = 0, bright = 0, cnt = 0;
        for (var q = 0; q < d.length; q += 4) {
          if (d[q + 3] < 128) continue;
          cnt++;
          var mx = Math.max(d[q], d[q + 1], d[q + 2]), mn = Math.min(d[q], d[q + 1], d[q + 2]);
          sat += mx - mn;
          bright += (d[q] + d[q + 1] + d[q + 2]) / 3;
        }
        v = cnt > 16 && sat / cnt < 22 && bright / cnt > 195;
      } catch (e) { v = false; }         // tainted canvas: leave the sprite as it is
    }
    WHITE_INK[name] = v;
    return v;
  }
  // draws an object from its atlas frame: centred on the object, rotated about that centre (clockwise, as GD),
  // flipped if the level says so, and added to the background for additive objects (Web Dashers' blend)
  function drawSpriteObj(g, toS, o, x0, y1, alpha) {
    if (MONO) return false;
    var kind = LevelModel.kindOf(o.id);
    var name = frameOf(o.id);
    if (!name || !FRAMES[name]) return false;
    var f = FRAMES[name];
    if (f[9] || !sheetImage(f[0])) return false;     // rotated atlas frames and unloaded sheets use the fallback
    var u = SPRITE_UNIT;
    var fp = LevelModel.footprint(o);
    var cx = x0 + fp.w * CELL / 2, cy = y1 - fp.h * CELL / 2;      // object centre, world units
    // reference _applyVisualProps: the sprite offset (realWidth/2 - sourceX - frameWidth/2, ...)
    // exactly cancels the atlas trim, so the trimmed CONTENT is centred on the object centre and
    // rotates about it. Draw every frame (and its back half / children / glow) centred on C.
    var C = toS(cx, cy), O = toS(cx + 1, cy + 1), Z = toS(cx, cy);
    var kx = Math.abs(O.x - Z.x), ky = Math.abs(O.y - Z.y);          // screen px per world unit
    var dw = f[3] * u * kx, dh = f[4] * u * ky;
    var col = chanColor(o);
    var kids = typeof blackChildren === 'function' ? blackChildren(o.id) : null;
    var black = typeof isBlackObj === 'function' && isBlackObj(o.id);
    // sawblade handling (reference level.js): frames containing "sawblade" tint black and
    // gain a mirrored twin at rotation + PI; saw ids and ring frames spin continuously
    var isSawFrame = name.indexOf('sawblade') >= 0;
    var isSawObj = SAW_IDS[o.id];
    var isFast = FAST_SAW_IDS[o.id];
    var isRing = name.indexOf('dropRing') >= 0 || name.indexOf('gravJumpRing') >= 0;
    var spin = (isSawFrame || isSawObj || isRing) ? sawPhase(o, isRing ? 'ring' : 'saw', isFast, isSawFrame && kind === 'deco') : 0;
    var src = null, tintCol = null, glowOff = false;
    if (isSawFrame) { src = frameTint(name, f, '#000'); glowOff = true; }
    else if (black) { src = frameTint(name, f, '#000'); glowOff = true; }
    else if (col && canColor(o.id) && !(col === '#ffffff' && kids)) { src = frameTint(name, f, col); tintCol = col; }
    else if (typeof defTint === 'function' && defTint(o.id) && canColor(o.id)) { src = frameTint(name, f, defTint(o.id)); tintCol = defTint(o.id); }
    // NOTE: white sheet sprites stay white — the real textured background shows them exactly
    // like the reference (the old "paint white ink black" hack made additive wheels/orbs vanish)
    if (window.CubeDashDebug && CubeDashDebug._traceIds && CubeDashDebug._traceIds.indexOf(o.id) >= 0) {
      (CubeDashDebug._trace = CubeDashDebug._trace || []).push({
        id: o.id, kind: kind, name: name, path: src === null ? 'raw' : (src === undefined ? '?' : 'tinted'),
        col: col, canColor: canColor(o.id), additive: isAdditive(o.id), alpha: alpha,
        whiteInk: (kind === 'spike' || kind === 'hazard' || kind === 'decor') ? isWhiteInk(name, f) : null,
        dw: Math.round(dw), dh: Math.round(dh), cx: Math.round(cx), cy: Math.round(cy)
      });
      if (CubeDashDebug._trace.length > 400) CubeDashDebug._trace.splice(0, 200);
    }
    var ga = g.globalAlpha, gco = g.globalCompositeOperation;
    g.save();
    g.globalAlpha = ga * (alpha || 1);
    if (isAdditive(o.id)) g.globalCompositeOperation = 'lighter';
    g.translate(C.x, C.y);
    if (o.rot || spin) g.rotate((o.rot || 0) * Math.PI / 180 + spin);
    if (o.flipX) g.scale(-1, 1);
    if (o.flipY) g.scale(1, -1);
    var dx = -dw / 2, dy = -dh / 2;
    // portals draw their back half first (Web Dashers: front frame + _back_ frame make the full oval)
    if (kind === 'portal' && name.indexOf('_front_') > 0) {
      var bname = name.replace('_front_', '_back_'), bf = FRAMES[bname];
      if (bf && !bf[9] && sheetImage(bf[0])) {
        var bdw = bf[3] * u * kx, bdh = bf[4] * u * ky;
        var bdx = -bdw / 2, bdy = -bdh / 2;
        var bsrc = col && canColor(o.id) ? frameTint(bname, bf, col) : null;
        if (bsrc) g.drawImage(bsrc, 0, 0, bf[3], bf[4], bdx, bdy, bdw, bdh);
        else g.drawImage(SHEET_IMGS[bf[0]], bf[1], bf[2], bf[3], bf[4], bdx, bdy, bdw, bdh);
      }
    }
    // sawblade mirror twin drawn behind, half a turn ahead of the blade (reference sawMirror)
    // reference _addGlowSprite: objects whose def carries glow get an additive glow sprite
    // behind them at alpha 0.425, tinted like the object (black-default objects skip it)
    if (!glowOff && typeof GLOW_OF === 'object' && GLOW_OF[o.id]) {
      var gname = GLOW_OF[o.id], gf = FRAMES[gname];
      if (gf && !gf[9] && sheetImage(gf[0])) {
        var gdw = gf[3] * u * kx, gdh = gf[4] * u * ky;
        var gdx = -gdw / 2, gdy = -gdh / 2;
        var gsrc = tintCol ? frameTint(gname, gf, tintCol) : null;
        var gga = g.globalAlpha, ggco = g.globalCompositeOperation;
        g.globalAlpha = gga * 0.425;
        g.globalCompositeOperation = 'lighter';
        if (gsrc) g.drawImage(gsrc, 0, 0, gf[3], gf[4], gdx, gdy, gdw, gdh);
        else g.drawImage(SHEET_IMGS[gf[0]], gf[1], gf[2], gf[3], gf[4], gdx, gdy, gdw, gdh);
        g.globalAlpha = gga;
        g.globalCompositeOperation = ggco;
      }
    }
    if (isSawFrame) {
      g.save();
      g.rotate(Math.PI);
      if (src) g.drawImage(src, 0, 0, f[3], f[4], dx, dy, dw, dh);
      else g.drawImage(SHEET_IMGS[f[0]], f[1], f[2], f[3], f[4], dx, dy, dw, dh);
      g.restore();
    }
    if (src) g.drawImage(src, 0, 0, f[3], f[4], dx, dy, dw, dh);
    else g.drawImage(SHEET_IMGS[f[0]], f[1], f[2], f[3], f[4], dx, dy, dw, dh);
    // tint-0 child frames (e.g. the plank's black interior) drawn on top
    if (kids) {
      var kidCol = o.col2 && LEVEL.palette && LEVEL.palette[o.col2] ? LEVEL.palette[o.col2] : '#000';   // detail channel (key 22); default black
      for (var kk = 0; kk < kids.length; kk++) {
        var kf = FRAMES[kids[kk]];
        if (!kf || kf[9] || !sheetImage(kf[0])) continue;
        var kdw = kf[3] * u * kx, kdh = kf[4] * u * ky;
        var kdx = -kdw / 2, kdy = -kdh / 2;
        g.drawImage(frameTint(kids[kk], kf, kidCol), 0, 0, kf[3], kf[4], kdx, kdy, kdw, kdh);
      }
    }
    g.restore();
    g.globalAlpha = ga; g.globalCompositeOperation = gco;
    return true;
  }

  // one decoration sprite: the sheet frame placed by its trimmed box (sheet px = 2x level units)
  function drawDecor(g, toS, o, x0, y0) {
    var A = DECOR_ATLAS[o.id];
    if (!A || !SHEET_OK[A[0]]) {
      var q1 = toS(x0, y0 + 30), q2 = toS(x0 + 30, y0);
      g.strokeStyle = '#000'; g.lineWidth = 1;
      g.strokeRect(q1.x + 4, q2.y + 4, q2.x - q1.x - 8, q1.y - q2.y - 8);
      return;
    }
    var boxH = A[9] / 2;
    var left = x0 + A[6] / 2, top = y0 + boxH - A[7] / 2;
    var p1 = toS(left, top), p2 = toS(left + A[3] / 2, top - A[4] / 2);
    var dx = p1.x, dy = p1.y, dw = p2.x - p1.x, dh = p2.y - p1.y;
    g.save();
    if (o.flipX) { g.translate(dx + dw, dy); g.scale(-1, 1); dx = 0; dy = 0; }
    var tint = canColor(o.id) ? tintedSprite(A, chanColor(o)) : null;
    if (tint) g.drawImage(tint, 0, 0, A[3], A[4], dx, dy, dw, dh);
    else g.drawImage(SHEET_IMG[A[0]], A[1], A[2], A[3], A[4], dx, dy, dw, dh);
    g.restore();
  }

  // GD 2.2 text object (914): the k31 string centred on the object, tinted via its colour channel
  function drawTextObj(g, toS, o) {
    var fp = LevelModel.footprint(o);
    var cx = o.gx * 30 + fp.w * 30 / 2, cy = o.gy * 30 + fp.h * 30 / 2;
    var size = Math.max(6, Math.round(18 * (o.scale || 1)));
    var C = toS(cx, cy);
    var O = toS(cx + 1, cy + 1), Z = toS(cx, cy);
    var k = Math.abs(O.x - Z.x);                    // screen px per world unit
    var col = chanColor(o) || '#ffffff';
    g.save();
    g.translate(C.x, C.y);
    if (o.rot) g.rotate(o.rot * Math.PI / 180);
    if (o.flipX || o.flipY) g.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
    g.font = 'bold ' + Math.max(6, Math.round(size * k)) + 'px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(1, Math.round(size * k) / 6);
    g.strokeStyle = '#000';
    g.strokeText(o.text || '', 0, 0);
    g.fillStyle = col;
    g.fillText(o.text || '', 0, 0);
    g.restore();
  }

  function drawWorld(g, toS, s, live) {
    var gz = toS(0, 0);
    var groundX = toS(0, 0).x;
    var drewGround = false;
    if (!MONO && LEVEL.groundId) {
      var gimg = texImage(groundFileOf(LEVEL));
      if (TEX_OK[groundFileOf(LEVEL)] && gimg.width) {
        // reference _buildGround: the tile's top edge sits on the ground line, world-locked (no parallax)
        drewGround = drawTintedTiled(g, gimg, groundColor(), 0, gz.y, CW, Math.max(0, CH - gz.y), groundX, gz.y);
        // reference setGround2Color: darker inner pattern, tinted by channel 1009 when the header carries it
        var g2 = texImage(ground2FileOf(LEVEL));
        if (LEVEL.palette && LEVEL.palette[1009] && TEX_OK[ground2FileOf(LEVEL)] && g2.width) {
          drawTintedTiled(g, g2, LEVEL.palette[1009], 0, gz.y, CW, Math.max(0, CH - gz.y), groundX, gz.y);
        }
      }
    }
    if (!drewGround) { g.fillStyle = groundColor(); g.fillRect(0, gz.y, CW, CH - gz.y); }
    // reference floorLine sprite: a white edge line on the ground top, additive, fixed to the line
    if (live && !MONO) {
      var prevGA = g.globalAlpha, prevGCO = g.globalCompositeOperation;
      g.globalAlpha = 0.9 * prevGA;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = '#bfbfbf';
      g.fillRect(0, gz.y - 1, CW, 2);
      g.globalAlpha = prevGA;
      g.globalCompositeOperation = prevGCO;
      // fly corridors show a flipped ground hanging from the top: bottom edge at
      // b(flyCeilingY) + cameraY (reference updateGroundTiles rightTileIndex)
      var ceilY = null;
      if (p && p.flyCeil !== null && p.flyCeil !== undefined && (p.mode === 'ship' || p.mode === 'ufo' || p.mode === 'wave' || p.mode === 'ball' || p.mode === 'spider')) {
        ceilY = gz.y - 2 * p.flyCeil;
      }
      if (ceilY !== null && ceilY > -gimg.height && ceilY < CH) {
        var fimg = flippedCanvas(gimg) || gimg;
        var bandY = Math.max(0, ceilY - gimg.height), bandH = Math.min(ceilY, CH) - bandY;
        var cg = drawTintedTiled(g, fimg, groundColor(), 0, bandY, CW, bandH, groundX, ceilY);
        if (cg && LEVEL.palette && LEVEL.palette[1009] && TEX_OK[ground2FileOf(LEVEL)] && g2 && g2.width) {
          var f2 = flippedCanvas(g2) || g2;
          drawTintedTiled(g, f2, LEVEL.palette[1009], 0, bandY, CW, bandH, groundX, ceilY);
        }
        g.globalAlpha = 0.9 * prevGA;
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = '#bfbfbf';
        g.fillRect(0, ceilY - 1, CW, 2);
        g.globalAlpha = prevGA;
        g.globalCompositeOperation = prevGCO;
      }
    }
    var objs = live ? visibleObjs(p.x) : LEVEL.objs;
    var oiStart = live ? VIS_START : 0, oiEnd = live ? VIS_END : objs.length;
    for (var oi = oiStart; oi < oiEnd; oi++) {
      var o = objs[oi];
      if (o.broken) continue;
      var kind = LevelModel.kindOf(o.id);
      if (kind === 'trigger' || kind === 'fx') continue;
      var inf = live ? (o.groups ? groupInfo(o.groups) : DEFAULT_INF) : null;
      if (inf && inf.hidden) continue;
      g.globalAlpha = inf ? inf.alpha : 1;
      var fp = LevelModel.footprint(o);
      var x0 = o.gx * CELL + (inf ? inf.dx : 0), y0 = o.gy * CELL + (inf ? inf.dy : 0), x1 = x0 + fp.w * CELL, y1 = y0 + fp.h * CELL;
      // cheap horizontal cull before any allocation (the play view maps x as CENTER_X + 2*(x - p.x))
      if (live) {
        var cx0 = CENTER_X + 2 * (x0 - p.x), cx1 = CENTER_X + 2 * (x1 - p.x);
        if (cx1 < -60 || cx0 > CW + 60) continue;
      }
      var a = toS(x0, y1), b = toS(x1, y0);
      if (b.x < -60 || a.x > CW + 60 || b.y < -60 || a.y > CH + 60) continue;
      var w = b.x - a.x, h = b.y - a.y;
      if (kind === 'text') { drawTextObj(g, toS, o); g.globalAlpha = 1; continue; }
      if (kind === 'decor') {
        if (!drawSpriteObj(g, toS, o, x0, y1, 1)) drawDecor(g, toS, o, x0, y0);
      } else if (kind === 'solid') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1)) continue;
        g.fillStyle = '#000'; g.fillRect(a.x, a.y, w, h);
        g.fillStyle = chanColor(o) || '#fff'; g.fillRect(a.x + 2.5 * s, a.y + 2.5 * s, w - 5 * s, h - 5 * s);
      } else if (kind === 'deco') {
        if (drawSpriteObj(g, toS, o, x0, y1, 0.45)) continue;     // passable: drawn faint
        // passable block: drawn faint with a dashed outline, no collision
        var ga = g.globalAlpha, pc = chanColor(o);
        g.globalAlpha = ga * 0.45; g.fillStyle = pc || '#999'; g.fillRect(a.x, a.y, w, h);
        g.globalAlpha = ga; g.strokeStyle = '#000'; g.lineWidth = 2; g.setLineDash([6, 4]);
        g.strokeRect(a.x + 1, a.y + 1, w - 2, h - 2); g.setLineDash([]);
      } else if (kind === 'hazard') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1)) continue;
        var hzd = LevelModel.HAZ ? LevelModel.HAZ[o.id] : null;
        g.fillStyle = '#000';
        if (hzd && hzd.pit) g.fillRect(a.x, toS(x0, y0 + 0.5 * fp.h * CELL).y, w, a.y - toS(x0, y0 + 0.5 * fp.h * CELL).y);
        else {
          var hc = toS(x0 + fp.w * CELL / 2, y0 + fp.h * CELL / 2), hr = 0.36 * Math.min(w, h);
          g.beginPath(); g.arc(hc.x, hc.y, hr, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(hc.x, hc.y, hr * 0.35, 0, Math.PI * 2); g.fill();
        }
      } else if (kind === 'spike') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1)) continue;
        var base = toS(x0, y0), apex = toS(x0 + CELL / 2, y0 + CELL), tip = toS(x1, y0);
        g.fillStyle = '#000';
        g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(apex.x, apex.y); g.lineTo(tip.x, tip.y);
        g.closePath(); g.fill();
      } else if (kind === 'slope') {
        if (LevelModel.DECO_SLOPE && LevelModel.DECO_SLOPE[o.id]) {
          // decoration slope: reference renders the sprite only (no collider)
          if (drawSpriteObj(g, toS, o, x0, y1, 1)) continue;
        }
        var cs = slopeCorners(o, x0, x1, y0, y1).map(function (c) { return toS(c[0], c[1]); });
        g.fillStyle = '#000';
        g.beginPath(); g.moveTo(cs[0].x, cs[0].y); g.lineTo(cs[1].x, cs[1].y); g.lineTo(cs[2].x, cs[2].y);
        g.closePath(); g.fill();
      } else if (kind === 'portal' || kind === 'speed' || kind === 'exit') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1)) continue;    // real GD portal / boost sprite
        var lbl = kind === 'exit' ? LABEL_EXIT : kind === 'speed' ? (SPEED_LABEL[o.id] || '') : (PORTAL_LABEL[LevelModel.PORTAL[o.id]] || '?');
        g.fillStyle = '#fff'; g.fillRect(a.x, a.y, w, h);
        g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeRect(a.x + 2, a.y + 2, w - 4, h - 4);
        g.fillStyle = '#000'; g.font = 'bold ' + Math.round(16 * s / 2) + 'px Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(lbl, a.x + w / 2, a.y + h / 2);
        // teleport entries draw their generated exit portal (reference _spawnTeleportExitPortalVisual:
        // a portal_16 frame at the entry's target height, mirrored)
        if (LevelModel.PORTAL[o.id] === 'teleport') {
          var off = o.tele !== undefined ? o.tele : 90;
          var ecx = o.gx * 30 + fp.w * 15, ecy = o.gy * 30 + fp.h * 15 + off;
          var ex = { id: 749, gx: (ecx - 1.2833 * 15) / 30, gy: (ecy - 45) / 30, flipX: true, flipY: o.flipY, rot: o.rot || 0, col: o.col };
          var efp = LevelModel.footprint(ex);
          var ex0 = ex.gx * CELL, ey0 = ex.gy * CELL;
          if (!drawSpriteObj(g, toS, ex, ex0, ey0 + efp.h * CELL, 1)) {
            var ea = toS(ex0, ey0 + efp.h * CELL), eb = toS(ex0 + efp.w * CELL, ey0);
            g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(eb.x + 2, ea.y + 2, eb.x - ea.x - 4, eb.y - ea.y - 4);
          }
        }
      } else if (kind === 'pad') {
        // the atlas pad frame is anchored to the pad's object centre (matches the physics band)
        if (drawSpriteObj(g, toS, o, x0, y0 + fp.h * CELL, 1)) continue;
        var pt = toS(x0, y0 + C.PAD_H);
        g.fillStyle = '#000'; g.fillRect(a.x, pt.y, w, a.y - pt.y);
        g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(10 * s / 2) + 'px Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(PAD_LABEL[o.id] || '', a.x + w / 2, pt.y + (a.y - pt.y) / 2);
      } else if (kind === 'orb') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1)) continue;    // real GD orb ring sprite
        var c = toS(x0 + CELL / 2, y0 + CELL / 2), r = 15 * s;
        g.fillStyle = '#fff'; g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#000'; g.font = 'bold ' + Math.round(13 * s / 2) + 'px Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(ORB_LABEL[o.id] || '', c.x, c.y);
      } else if (kind === 'coin') {
        var cc = toS(x0 + CELL / 2, y0 + CELL / 2), rr = 11 * s;
        var got = coinsGot[(x0 + CELL / 2) + ',' + (y0 + CELL / 2)];
        if (drawSpriteObj(g, toS, o, x0, y1, got ? 0.3 : 1)) continue;   // real GD coin sprite
        g.fillStyle = got ? '#888' : '#fff';
        g.beginPath(); g.arc(cc.x, cc.y, rr, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke();
        g.beginPath(); g.arc(cc.x, cc.y, rr * 0.5, 0, Math.PI * 2); g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  // x-sorted render window: official levels have >10k objects, and scanning all of them every
  // frame is what made the play tab laggy on mobile. The window covers the screen plus a wide
  // margin so group-move offsets still land inside it.
  var OBJ_SORTED = null, OBJ_SORTED_SRC = null, OBJ_SORTED_LEN = -1;
  var VIS_START = 0, VIS_END = 0;
  var VIS_MARGIN = 1200;         // world units of slack for moved groups
  function rebuildSortedObjs() {
    OBJ_SORTED = LEVEL.objs.slice().sort(function (a, b) { return a.gx - b.gx; });
    OBJ_SORTED_SRC = LEVEL.objs;
    OBJ_SORTED_LEN = LEVEL.objs.length;
  }
  function visibleObjs(playerX) {
    if (OBJ_SORTED_SRC !== LEVEL.objs || OBJ_SORTED_LEN !== LEVEL.objs.length) rebuildSortedObjs();
    var lo = playerX / CELL - VIS_MARGIN / CELL, hi = playerX / CELL + (CW / 2 + VIS_MARGIN) / CELL;
    // binary search the left edge
    var a = 0, b = OBJ_SORTED.length;
    while (a < b) { var m = (a + b) >> 1; if (OBJ_SORTED[m].gx < lo) a = m + 1; else b = m; }
    var start = a;
    var end = start;
    while (end < OBJ_SORTED.length && OBJ_SORTED[end].gx <= hi) end++;
    VIS_START = start; VIS_END = end;
    return OBJ_SORTED;
  }

  // ---- player icon sprites (reference player.js: base frame tinted mainColor, _2 overlay
  // tinted secondaryColor; defaults green #04FF00 / cyan #00FBFF; dual inverts the pair) ----
  var ICON_BASE = { cube: 'player_01_001.png', ship: 'ship_01_001.png', ball: 'player_ball_01_001.png',
    ufo: 'bird_01_001.png', wave: 'dart_01_001.png', robot: 'robot_01_01_001.png', spider: 'spider_01_01_001.png', swing: 'swing_01_001.png' };
  var ICON_OVER = { cube: 'player_01_2_001.png', ship: 'ship_01_2_001.png', ball: 'player_ball_01_2_001.png',
    ufo: 'bird_01_2_001.png', wave: 'dart_01_2_001.png', robot: 'robot_01_01_2_001.png', spider: 'spider_01_01_2_001.png', swing: 'swing_01_2_001.png' };
  var ICON_MAIN = '#04ff00', ICON_SEC = '#00fbff';
  function drawIconLayer(g, name, k, tint) {
    var f = FRAMES[name];
    if (!f || f[9] || !sheetImage(f[0])) return false;
    // the icons atlas is 1x: one atlas pixel = one world unit (the cube frame is 60px = the
    // 30-unit hitbox box drawn at the 2px/unit play scale) — unlike the hd level sheets (0.5)
    var dw = f[3] * k, dh = f[4] * k;
    var dx = (f[5] + f[3] / 2 - f[7] / 2) * k - dw / 2, dy = (f[8] / 2 - f[6] - f[4] / 2) * k - dh / 2;
    var tc = frameTint(name, f, tint);
    if (tc) g.drawImage(tc, 0, 0, f[3], f[4], dx, dy, dw, dh);
    else g.drawImage(sheetImage(f[0]), f[1], f[2], f[3], f[4], dx, dy, dw, dh);
    return true;
  }
  function drawPlayer(g, toS, s, pl, invert) {
    var c = toS(pl.x, pl.y);
    var h = pl.half * s;
    var main = invert ? ICON_SEC : ICON_MAIN, sec = invert ? ICON_MAIN : ICON_SEC;
    var base = ICON_BASE[pl.mode] || ICON_BASE.cube;
    var over = ICON_OVER[pl.mode];
    if (pl.mode === 'cube' && pl.isMini) { base = 'player_00_001.png'; over = 'player_00_2_001.png'; }
    if (base && FRAMES[base] && sheetImage(FRAMES[base][0])) {
      // sprite icon: cube rides inside the ship / ufo at 0.55 scale (reference enterShipMode / enterUfoMode)
      g.save();
      g.translate(c.x, c.y);
      // cube/ball spin, ship/ufo tilt and the wave's 45-degree glide are all tracked in sim
      g.rotate(pl.mode === 'cube' || pl.mode === 'ball' || pl.mode === 'ship' || pl.mode === 'ufo' || pl.mode === 'wave' || pl.mode === 'swing' ? pl.rot : 0);
      if (pl.flip) g.scale(1, -1);
      if (pl.mirrored) g.scale(-1, 1);
      var k = h / 30;                                  // 30 world units = 60 atlas px
      if (pl.mode === 'ship' || pl.mode === 'ufo') {
        // reference enterShipMode / enterUfoMode: every player layer scales 0.55, and the
        // cube icon stays visible riding inside the vehicle (setCubeVisible stays true)
        var fk = k * 0.55;
        var cb = pl.isMini ? 'player_00_001.png' : ICON_BASE.cube;
        var co = pl.isMini ? 'player_00_2_001.png' : ICON_OVER.cube;
        drawIconLayer(g, cb, fk, main);
        drawIconLayer(g, co, fk, sec);
        drawIconLayer(g, base, fk, main);
        if (over) drawIconLayer(g, over, fk, sec);
      } else {
        drawIconLayer(g, base, k, main);
        if (over) drawIconLayer(g, over, k, sec);
      }
      g.restore();
      return;
    }
    // vector fallback when the icon sheet has not loaded
    g.save();
    g.translate(c.x, c.y);
    g.rotate(pl.rot);
    if (pl.flip) g.scale(1, -1);
    if (pl.mirrored) g.scale(-1, 1);
    var fg = invert ? '#fff' : '#000', bg = invert ? '#000' : '#fff';
    g.fillStyle = fg;
    if (pl.mode === 'cube') {
      g.fillRect(-h, -h, h * 2, h * 2);
      g.fillStyle = bg; g.fillRect(-h + 5, -h + 5, h * 2 - 10, h * 2 - 10);
      g.fillStyle = fg; g.fillRect(-3, -3, 6, 6);
    } else if (pl.mode === 'ball') {
      g.beginPath(); g.arc(0, 0, h, 0, Math.PI * 2); g.fill();
      g.strokeStyle = bg; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-h * 0.6, 0); g.lineTo(h * 0.6, 0); g.stroke();
    } else if (pl.mode === 'ufo') {
      g.beginPath(); g.ellipse(0, 0, h, h * 0.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = bg;
      g.beginPath(); g.ellipse(0, -h * 0.1, h * 0.45, h * 0.25, 0, 0, Math.PI * 2); g.fill();
    } else if (pl.mode === 'ship') {
      g.beginPath();
      g.moveTo(h * 1.1, 0); g.lineTo(-h * 0.8, -h * 0.7); g.lineTo(-h * 0.5, 0); g.lineTo(-h * 0.8, h * 0.7);
      g.closePath(); g.fill();
    } else if (pl.mode === 'wave') {
      g.beginPath();
      g.moveTo(h * 0.8, 0); g.lineTo(-h * 0.6, -h * 0.5); g.lineTo(-h * 0.6, h * 0.5);
      g.closePath(); g.fill();
    } else if (pl.mode === 'robot') {
      g.fillRect(-h * 0.7, -h * 0.2, h * 1.4, h * 1.2);
      g.fillStyle = bg; g.fillRect(-h * 0.45, -h * 0.05, h * 0.9, h * 0.4);
      g.fillStyle = fg; g.fillRect(-h * 0.5, h * 0.4, h * 0.35, h * 0.6); g.fillRect(h * 0.15, h * 0.4, h * 0.35, h * 0.6);
    } else if (pl.mode === 'swing') {
      g.beginPath();
      g.moveTo(0, -h * 0.9); g.lineTo(h * 0.9, 0); g.lineTo(0, h * 0.9); g.lineTo(-h * 0.9, 0);
      g.closePath(); g.fill();
      g.fillStyle = bg; g.beginPath(); g.arc(0, 0, h * 0.25, 0, Math.PI * 2); g.fill();
    } else if (pl.mode === 'spider') {
      g.beginPath(); g.arc(0, 0, h * 0.7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = fg; g.lineWidth = 3;
      for (var k = -1; k <= 1; k += 2) {
        g.beginPath(); g.moveTo(k * h * 0.5, -h * 0.3); g.lineTo(k * h * 1.2, -h * 0.9); g.stroke();
        g.beginPath(); g.moveTo(k * h * 0.5, h * 0.3); g.lineTo(k * h * 1.2, h * 0.9); g.stroke();
      }
    }
    g.restore();
  }

  // ---- play rendering ----
  function playToS(x1, y1) {
    return { x: CENTER_X + 2 * (x1 - p.x), y: playCamY + GROUND_SY - 2 * y1 };
  }
  function renderPlay() {
    var drewTex = false;
    if (!MONO && LEVEL.bgId) {
      var m = bgMirrorCanvas(bgFileOf(LEVEL));
      if (m) {
        // reference _updateBackground: parallax 0.1x horizontally, 0.1x vertically, wrapped over the mirror pair.
        // Phaser tileSprite shows texture row (tilePosition + screenRow): the pattern anchor is the NEGATED tilePosition
        var tx = 0.1 * 2 * p.x, ty = (1024 - CH - REF_O) - 0.1 * playCamY;
        drewTex = drawTintedTiled(ctx, m, bgColor(), 0, 0, CW, CH, -tx, -ty);
      }
    }
    if (!drewTex) { ctx.fillStyle = bgColor(); ctx.fillRect(0, 0, CW, CH); }
    drawWorld(ctx, playToS, 2, true);
    drawPlayer(ctx, playToS, 2, p, false);
    if (p2) drawPlayer(ctx, playToS, 2, p2, true);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '15px Arial, sans-serif';
    var coinTotal = LEVEL.sim().coins.length, coinHave = 0;
    coinHave = coinCount;
    ctx.fillText('Mode: ' + p.mode + (p.flip ? ' (gravity up)' : '') + (p.isMini ? ' mini' : '') + (p2 ? '  DUAL' : '') +
      '   Speed: ' + speedLabel(p.speed) + '   Coins: ' + coinHave + '/' + coinTotal, 12, 22);
    var end = endX();
    var prog = Math.min(Math.max(p.x / end, 0), 1);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeRect(CW - 262, 10, 250, 12);
    ctx.fillRect(CW - 260, 12, 246 * prog, 8);
    ctx.textAlign = 'right';
    ctx.fillText('Attempt ' + attempts, CW - 12, 42);
    ctx.textAlign = 'center';
    if (demoActive) box(['Demo run', 'Press any key to take over']);
    else if (status === 'ready') box([LEVEL_NAME, 'Press to start. Then hold to jump or fly.']);
    else if (status === 'dead') box(['Crashed!', 'Tap to retry']);
    else if (status === 'won') box(['Level complete!', 'Tap to play again']);
  }

  function box(lines) {
    var bw = 600, bh = 40 + lines.length * 40;
    var bx = (CW - bw) / 2, by = (CH - bh) / 2 - 20;
    ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#000'; ctx.textBaseline = 'middle';
    for (var i = 0; i < lines.length; i++) {
      ctx.font = (i === 0 ? 'bold 26px' : '17px') + ' Arial, sans-serif';
      ctx.fillText(lines[i], CW / 2, by + 36 + i * 40);
    }
  }

  // ================= editor =================
  var TOOLS = [
    { label: 'Select', id: -1 }, { label: 'Erase', id: 0 },
    { label: 'Block', id: 1 }, { label: 'Spike', id: 8 },
    { label: 'Slope 45', id: 289 }, { label: 'Slope 22', id: 291 },
    { label: 'Cube', id: 12 }, { label: 'Ship', id: 13 }, { label: 'Ball', id: 47 }, { label: 'UFO', id: 111 },
    { label: 'Wave', id: 660 }, { label: 'Robot', id: 745 }, { label: 'Spider', id: 1331 }, { label: 'Swing', id: 1933 },
    { label: 'Grav down (blue)', id: 10 }, { label: 'Grav up (yellow)', id: 11 }, { label: 'Grav toggle', id: 2926 },
    { label: 'Mini on', id: 101 }, { label: 'Mini off', id: 99 },
    { label: 'Mirror on', id: 45 }, { label: 'Mirror off', id: 46 },
    { label: 'Dual on', id: 286 }, { label: 'Dual off', id: 287 },
    { label: 'Teleport in', id: 747 }, { label: 'Teleport out', id: 749 },
    { label: 'Speed x0.81', id: 200 }, { label: 'Speed x1', id: 201 }, { label: 'Speed x1.24', id: 202 },
    { label: 'Speed x1.5', id: 203 }, { label: 'Speed x1.85', id: 1334 },
    { label: 'Pad yellow', id: 35 }, { label: 'Pad pink', id: 140 }, { label: 'Pad red', id: 1332 }, { label: 'Pad grav', id: 67 },
    { label: 'Orb yellow', id: 36 }, { label: 'Orb pink', id: 141 }, { label: 'Orb red', id: 1333 },
    { label: 'Orb grav', id: 84 }, { label: 'Orb grav ring', id: 1022 }, { label: 'Orb drop', id: 1330 },
    { label: 'Orb dash', id: 1704 }, { label: 'Orb dash grav', id: 1751 },
    { label: 'Coin', id: 142 }, { label: 'Coin small', id: 1614 },
    { label: 'No group', id: -5, grp: 0 }, { label: 'Group 1', id: -5, grp: 1 }, { label: 'Group 2', id: -5, grp: 2 }, { label: 'Group 3', id: -5, grp: 3 },
    { label: 'Touch on/off', id: -6, touchToggle: true },
    { label: 'Hide', id: 1049, p: { activate: 0, dur: 1 } }, { label: 'Show', id: 1049, p: { activate: 1, dur: 1 } },
    { label: 'Fade 50', id: 1007, p: { opacity: 0.5, dur: 1 } },
    { label: 'Move up', id: 901, p: { dx: 0, dy: 60, dur: 1 } }, { label: 'Move down', id: 901, p: { dx: 0, dy: -60, dur: 1 } },
    { label: 'Move right', id: 901, p: { dx: 60, dy: 0, dur: 1 } }, { label: 'Stop', id: 1616, p: { dur: 1 } }, { label: 'Spawn', id: 1268, p: { delay: 0 } }
  ];
  var toolIndex = 2, flipNext = false, flipYNext = false;
  var editCam = { x: 150, y: 60 }, zoom = 1;
  var mouseMode = 0;               // 0 none, 1 place, 2 erase, 3 select / move / rectangle
  var cursor = null;
  var panKeys = {}, panBtn = {};
  var io = null;
  var selection = [];              // references into LEVEL.objs
  var clipboard = null;
  var selDrag = null;              // {kind:'rect'|'move', ...}

  // ---- undo / redo ----
  var undoStack = [], redoStack = [], strokeBefore = null;
  function snap() { return JSON.stringify(LEVEL.objs); }
  function beginStroke() { strokeBefore = snap(); }
  function endStroke() {
    if (strokeBefore !== null && snap() !== strokeBefore) {
      undoStack.push(strokeBefore);
      var cap = LEVEL.objs.length > 3000 ? 10 : 200;   // big levels keep fewer snapshots
      while (undoStack.length > cap) undoStack.shift();
      redoStack = [];
    }
    strokeBefore = null;
  }
  function setObjs(json) {
    LEVEL.objs = JSON.parse(json);
    LEVEL.dirty = true;
    levelIsDefault = false;
    clearSelection();
    dirty = true;
  }
  function undo() {
    if (!undoStack.length) { flash('Nothing to undo.'); return; }
    redoStack.push(snap());
    setObjs(undoStack.pop());
    flash('Undo.');
  }
  function redo() {
    if (!redoStack.length) { flash('Nothing to redo.'); return; }
    undoStack.push(snap());
    setObjs(redoStack.pop());
    flash('Redo.');
  }

  // ---- selection ----
  function clearSelection() { selection = []; }
  function selectedIndex(o) { return selection.indexOf(o); }
  function selectAt(gx, gy, additive) {
    var i = LEVEL.at(gx, gy);
    var o = i >= 0 ? LEVEL.objs[i] : null;
    if (!additive) clearSelection();
    if (o && selectedIndex(o) < 0) selection.push(o);
    dirty = true;
    return o;
  }
  function selectRect(g0, g1, additive) {
    var minX = Math.min(g0.gx, g1.gx), maxX = Math.max(g0.gx, g1.gx);
    var minY = Math.min(g0.gy, g1.gy), maxY = Math.max(g0.gy, g1.gy);
    if (!additive) clearSelection();
    LEVEL.objs.forEach(function (o) {
      if (o.gx >= minX && o.gx <= maxX && o.gy >= minY && o.gy <= maxY && selectedIndex(o) < 0) selection.push(o);
    });
    dirty = true;
  }
  function deleteSelection() {
    if (!selection.length) return;
    beginStroke();
    LEVEL.objs = LEVEL.objs.filter(function (o) { return selectedIndex(o) < 0; });
    LEVEL.dirty = true;
    clearSelection();
    endStroke();
    levelIsDefault = false;
    dirty = true;
    flash('Deleted.');
  }
  function copySelection() {
    if (!selection.length) { flash('Select objects first (Select tool, drag a box).'); return; }
    var minX = Infinity, minY = Infinity;
    selection.forEach(function (o) { minX = Math.min(minX, o.gx); minY = Math.min(minY, o.gy); });
    clipboard = selection.map(function (o) {
      return { id: o.id, dx: o.gx - minX, dy: o.gy - minY, flipX: o.flipX, flipY: o.flipY };
    });
    flash('Copied ' + clipboard.length + ' object(s). Ctrl+V pastes at the cursor.');
  }
  function pasteAt(gx, gy) {
    if (!clipboard || !clipboard.length) { flash('Nothing copied.'); return; }
    beginStroke();
    clearSelection();
    clipboard.forEach(function (c) {
      var x = gx + c.dx, y = gy + c.dy;
      if (LEVEL.place(c.id, x, y, c.flipX, c.flipY)) {
        selection.push(LEVEL.objs[LEVEL.objs.length - 1]);
      }
    });
    endStroke();
    levelIsDefault = false;
    dirty = true;
    flash('Pasted ' + selection.length + ' object(s).');
  }

  // ---- editor geometry ----
  function editToS(x1, y1) {
    var s = 2 * zoom;
    return { x: CW / 2 + (x1 - editCam.x) * s, y: CH / 2 - (y1 - editCam.y) * s };
  }
  function editScreenToWorld(sx, sy) {
    var s = 2 * zoom;
    return { x: editCam.x + (sx - CW / 2) / s, y: editCam.y + (CH / 2 - sy) / s };
  }
  function clientToCanvas(cx, cy) {
    var r = document.getElementById('editor').getBoundingClientRect();
    return { x: (cx - r.left) * (CW / r.width), y: (cy - r.top) * (CH / r.height) };
  }
  function cellAt(cx, cy) {
    var c = clientToCanvas(cx, cy);
    var w = editScreenToWorld(c.x, c.y);
    return { gx: Math.floor(w.x / CELL), gy: Math.floor(w.y / CELL) };
  }

  function editAction(cx, cy, mode) {
    var cell = cellAt(cx, cy);
    if (cell.gy < 0) return;
    var tool = TOOLS[toolIndex];
    if (mode !== 2 && tool.grp !== undefined) { currentGroup = tool.grp; dirty = true; return; }
    if (mode !== 2 && tool.touchToggle) { touchNext = !touchNext; dirty = true; return; }
    if (mode === 2 || tool.id === 0) {
      LEVEL.remove(cell.gx, cell.gy);
    } else if (tool.p) {
      var tp = { target: currentGroup, touch: touchNext }, key;
      for (key in tool.p) tp[key] = tool.p[key];
      LEVEL.place(tool.id, cell.gx, cell.gy, false, false, { p: tp, groups: currentGroup ? [currentGroup] : undefined });
    } else {
      var fx = flipNext, fy = flipYNext;
      LEVEL.place(tool.id, cell.gx, cell.gy, fx, fy, currentGroup ? { groups: [currentGroup] } : undefined);
    }
    levelIsDefault = false;
    dirty = true;
  }

  function selectionAction(cx, cy, down) {
    var cell = cellAt(cx, cy);
    if (down) {
      var hit = LEVEL.at(cell.gx, cell.gy);
      var o = hit >= 0 ? LEVEL.objs[hit] : null;
      if (o && selectedIndex(o) >= 0) {
        // start moving the selection
        selDrag = { kind: 'move', start: cell, orig: selection.map(function (s) { return { o: s, gx: s.gx, gy: s.gy }; }) };
        return;
      }
      if (o) { selectAt(cell.gx, cell.gy, false); selDrag = { kind: 'move', start: cell, orig: selection.map(function (s) { return { o: s, gx: s.gx, gy: s.gy }; }) }; return; }
      clearSelection();
      selDrag = { kind: 'rect', a: cell, b: cell };
      dirty = true;
    } else if (selDrag) {
      if (selDrag.kind === 'rect') {
        selectRect(selDrag.a, selDrag.b, false);
      }
      selDrag = null;
    }
  }
  function selectionDrag(cx, cy) {
    if (!selDrag) return;
    var cell = cellAt(cx, cy);
    if (selDrag.kind === 'rect') { selDrag.b = cell; dirty = true; return; }
    var dx = cell.gx - selDrag.start.gx, dy = cell.gy - selDrag.start.gy;
    selDrag.orig.forEach(function (r) {
      r.o.gx = Math.max(0, r.gx + dx) ;
      r.o.gy = Math.max(0, r.gy + dy);
    });
    LEVEL.dirty = true;
    dirty = true;
  }

  function renderEdit() {
    // real level background first (the reference editor shows the same texture; white sheet
    // sprites would vanish on a plain white canvas)
    var bgDrawn = false;
    if (!MONO && LEVEL.bgId) {
      var m = bgMirrorCanvas(bgFileOf(LEVEL));
      if (m) bgDrawn = drawTintedTiled(ectx, m, bgColor(), 0, 0, CW, CH, 0, 0);
    }
    if (!bgDrawn) { ectx.fillStyle = '#fff'; ectx.fillRect(0, 0, CW, CH); }
    var s = 2 * zoom;
    var left = editCam.x - (CW / 2) / s, right = editCam.x + (CW / 2) / s;
    var bot = editCam.y - (CH / 2) / s, top = editCam.y + (CH / 2) / s;
    ectx.strokeStyle = '#d0d0d0'; ectx.lineWidth = 1;
    ectx.beginPath();
    for (var gx = Math.floor(left / CELL); gx <= Math.ceil(right / CELL); gx++) {
      var sx = editToS(gx * CELL, 0).x; ectx.moveTo(sx, 0); ectx.lineTo(sx, CH);
    }
    for (var gy = Math.floor(bot / CELL); gy <= Math.ceil(top / CELL); gy++) {
      var sy = editToS(0, gy * CELL).y; ectx.moveTo(0, sy); ectx.lineTo(CW, sy);
    }
    ectx.stroke();
    drawWorld(ectx, editToS, s, false);
    ectx.globalAlpha = 1;
    LEVEL.objs.forEach(function (o) {
      var kind = LevelModel.kindOf(o.id), fp = LevelModel.footprint(o);
      var a = editToS(o.gx * CELL, (o.gy + fp.h) * CELL), b = editToS((o.gx + fp.w) * CELL, o.gy * CELL);
      if (kind === 'trigger') {
        var t = o.p || {};
        var lbl = o.id === 1049 ? (t.activate ? 'S' : 'H') : o.id === 1007 ? 'A' : o.id === 901 ? 'M' : 'X';
        ectx.fillStyle = '#fff'; ectx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ectx.strokeStyle = '#000'; ectx.lineWidth = 2; ectx.strokeRect(a.x + 2, a.y + 2, b.x - a.x - 4, b.y - a.y - 4);
        ectx.fillStyle = '#000'; ectx.font = 'bold 14px Arial, sans-serif'; ectx.textAlign = 'center'; ectx.textBaseline = 'middle';
        ectx.fillText(lbl + (t.touch ? '*' : '') + (t.target || ''), (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else if (o.groups && o.groups.length) {
        ectx.fillStyle = '#000'; ectx.font = 'bold 11px Arial, sans-serif'; ectx.textAlign = 'left'; ectx.textBaseline = 'top';
        ectx.fillText(o.groups.join('.'), a.x + 2, b.y + 1);
      }
    });
    // spawn marker
    var sp1 = editToS(-C.HALF, 2 * C.HALF), sp2 = editToS(C.HALF, 0);
    ectx.setLineDash([6, 4]); ectx.strokeStyle = '#000'; ectx.lineWidth = 2;
    ectx.strokeRect(sp1.x, sp1.y, sp2.x - sp1.x, sp2.y - sp1.y); ectx.setLineDash([]);
    // selection outlines
    selection.forEach(function (o) {
      var fp = LevelModel.footprint(o);
      var a = editToS(o.gx * CELL, (o.gy + fp.h) * CELL), b = editToS((o.gx + fp.w) * CELL, o.gy * CELL);
      ectx.strokeStyle = '#000'; ectx.lineWidth = 3; ectx.setLineDash([4, 3]);
      ectx.strokeRect(a.x - 3, a.y - 3, b.x - a.x + 6, b.y - a.y + 6); ectx.setLineDash([]);
    });
    if (selDrag && selDrag.kind === 'rect') {
      var r1 = editToS(Math.min(selDrag.a.gx, selDrag.b.gx) * CELL, (Math.max(selDrag.a.gy, selDrag.b.gy) + 1) * CELL);
      var r2 = editToS((Math.max(selDrag.a.gx, selDrag.b.gx) + 1) * CELL, Math.min(selDrag.a.gy, selDrag.b.gy) * CELL);
      ectx.strokeStyle = '#000'; ectx.lineWidth = 2; ectx.setLineDash([6, 4]);
      ectx.strokeRect(r1.x, r1.y, r2.x - r1.x, r2.y - r1.y); ectx.setLineDash([]);
    }
    // cursor footprint for the placement tool
    var tool = TOOLS[toolIndex];
    if (cursor && mouseMode === 0 && tool.id > 0) {
      var fp2 = LevelModel.footprint({ id: tool.id });
      var a2 = editToS(cursor.gx * CELL, (cursor.gy + fp2.h) * CELL), b2 = editToS((cursor.gx + fp2.w) * CELL, cursor.gy * CELL);
      ectx.strokeStyle = '#000'; ectx.lineWidth = 3; ectx.strokeRect(a2.x, a2.y, b2.x - a2.x, b2.y - a2.y);
    }
    ectx.fillStyle = '#000'; ectx.textAlign = 'left'; ectx.textBaseline = 'alphabetic'; ectx.font = '15px Arial, sans-serif';
    ectx.fillText('Tool: ' + tool.label + (flipNext ? ' flipX' : '') + (flipYNext ? ' flipY' : '') +
      '    zoom ' + zoom.toFixed(2) + '    objects ' + LEVEL.objs.length + '    selected ' + selection.length + '    group ' + (currentGroup || 'none') + (touchNext ? '  touch' : ''), 12, 22);
    ectx.fillText('Left: place / select | Right: erase | F flipX | V flipY | Del delete | Ctrl+C/V copy paste | Ctrl+Z/Y undo | arrows pan | +/- zoom', 12, 42);
    if (cursor) ectx.fillText('cell ' + cursor.gx + ', ' + cursor.gy, 12, 62);
  }

  function panEditor(frames) {
    var step = 12 / (2 * zoom);
    var dx = 0, dy = 0;
    if (panKeys.left || panBtn.left) dx -= step;
    if (panKeys.right || panBtn.right) dx += step;
    if (panKeys.up || panBtn.up) dy += step;
    if (panKeys.down || panBtn.down) dy -= step;
    if (dx || dy) { editCam.x += dx * frames; editCam.y += dy * frames; dirty = true; }
  }

  // ================= io =================
  function ioSetText(t) { document.getElementById('io').value = t; }
  function doImport(text) {
    try {
      var res = LevelModel.importText(text, { convertDeco: !!(document.getElementById('deco-convert') && document.getElementById('deco-convert').checked) });
      LEVEL = res.level;
      levelIsDefault = false;
      clearSelection(); undoStack = []; redoStack = [];
      var skippedIds = Object.keys(res.skipped);
      flash('Loaded ' + res.level.objs.length + ' objects' + (res.name ? ' from "' + res.name + '"' : '') + (res.converted ? ' (' + res.converted + ' decorations became blocks)' : '') +
        (skippedIds.length ? '. Skipped unsupported ids: ' + skippedIds.join(', ') : '') + '.');
      dirty = true;
    } catch (e) {
      flash('Import failed: ' + e.message);
    }
  }

  // ================= tabs =================
  function setTab(name) {
    activeTab = name;
    document.getElementById('view-play').style.display = name === 'play' ? 'block' : 'none';
    document.getElementById('view-levels').style.display = name === 'levels' ? 'block' : 'none';
    document.getElementById('view-edit').style.display = name === 'edit' ? 'block' : 'none';
    document.getElementById('tab-play').className = name === 'play' ? 'tab on' : 'tab';
    document.getElementById('tab-levels').className = name === 'levels' ? 'tab on' : 'tab';
    document.getElementById('tab-edit').className = name === 'edit' ? 'tab on' : 'tab';
    if (name === 'levels') renderLevelList();
    if (name === 'play') { resetRun(); status = 'ready'; demoActive = false; }
    dirty = true;
  }

  // ================= loop =================
  // wall-clock animation phase for saw spins (reference game-scene: rotation += dt * speed,
  // dt in ms against a free-running timer — spins continue while frozen, like the reference)
  var ANIM_MS = 0, lastAnim = null;
  function loop(now) {
    var dtms = Math.min(100, now - lastNow);
    lastNow = now;
    if (lastAnim === null) lastAnim = now;
    ANIM_MS += now - lastAnim; lastAnim = now;
    acc += dtms;
    var frames = 0;
    while (acc >= FRAME_MS && frames < 4 && !frozen) { acc -= FRAME_MS; frames++; advanceFrame(); }
    if (activeTab === 'edit') { panEditor(frames > 0 ? frames : 0.5); renderEdit(); }
    else if (dirty || status === 'play') { renderPlay(); dirty = false; }
    window.requestAnimationFrame(loop);
  }

  // ================= input =================
  var KEY_PAN = { 37: 'left', 65: 'left', 39: 'right', 68: 'right', 38: 'up', 87: 'up', 40: 'down', 83: 'down' };
  document.onkeydown = function (e) {
    var k = e.keyCode;
    var mod = e.ctrlKey || e.metaKey;
    if (k === 32 && activeTab === 'play') { e.preventDefault(); if (!e.repeat) pressJump(); return; }
    if (activeTab === 'edit') {
      if (mod && k === 90 && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (k === 89 || (k === 90 && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if (mod && k === 67) { e.preventDefault(); copySelection(); return; }
      if (mod && k === 86) { e.preventDefault(); pasteAt(cursor ? cursor.gx : 0, cursor ? cursor.gy : 0); return; }
      if (mod && k === 68) { e.preventDefault(); copySelection(); pasteAt((cursor ? cursor.gx : 0) + 1, cursor ? cursor.gy : 0); return; }
      if (k === 46 || k === 8) { e.preventDefault(); deleteSelection(); return; }
      if (k === 27) { clearSelection(); dirty = true; return; }
      if (KEY_PAN[k]) { e.preventDefault(); panKeys[KEY_PAN[k]] = true; return; }
      if (k === 187 || k === 107) { zoom = Math.min(2.5, zoom * 1.15); dirty = true; return; }
      if (k === 189 || k === 109) { zoom = Math.max(0.4, zoom / 1.15); dirty = true; return; }
      if (k === 70) { flipNext = !flipNext; dirty = true; return; }
      if (k === 86 && !mod) { flipYNext = !flipYNext; dirty = true; return; }
    }
  };
  document.onkeyup = function (e) {
    var k = e.keyCode;
    if (k === 32) releaseJump();
    if (KEY_PAN[k]) panKeys[KEY_PAN[k]] = false;
  };

  function bind(id, down, up) {
    var el = document.getElementById(id);
    if (!el) return;
    el.onmousedown = down; el.onmouseup = up || function () {}; el.onmouseleave = up || function () {};
    el.addEventListener('touchstart', function (e) { e.preventDefault(); down(); }, { passive: false });
    el.addEventListener('touchend', function (e) { e.preventDefault(); if (up) up(); }, { passive: false });
  }
  function click(id, fn) { var el = document.getElementById(id); if (el) el.onclick = fn; }

  function beginEditPointer(cx, cy, button, shift) {
    beginStroke();
    var tool = TOOLS[toolIndex];
    if (tool.id === -1) { mouseMode = 3; selectionAction(cx, cy, true); }
    else if (button === 2 || shift) { mouseMode = 2; editAction(cx, cy, 2); }
    else { mouseMode = 1; editAction(cx, cy, 1); }
  }
  function moveEditPointer(cx, cy) {
    cursor = cellAt(cx, cy);
    if (mouseMode === 3) selectionDrag(cx, cy);
    else if (mouseMode === 1) editAction(cx, cy, 1);
    else if (mouseMode === 2) editAction(cx, cy, 2);
    dirty = true;
  }
  function endEditPointer() {
    if (mouseMode === 3) selectionAction(0, 0, false);
    if (mouseMode) endStroke();
    mouseMode = 0;
  }

  function init() {
    ctx = document.getElementById('game').getContext('2d');
    ectx = document.getElementById('editor').getContext('2d');
    io = document.getElementById('io');

    var game = document.getElementById('game');
    game.onmousedown = function () { if (activeTab === 'play') pressJump(); };
    game.onmouseup = releaseJump;
    game.addEventListener('touchstart', function (e) { e.preventDefault(); if (activeTab === 'play') pressJump(); }, { passive: false });
    game.addEventListener('touchend', function (e) { e.preventDefault(); releaseJump(); }, { passive: false });
    bind('hold', pressJump, releaseJump);

    var ed = document.getElementById('editor');
    ed.onmousedown = function (e) { beginEditPointer(e.clientX, e.clientY, e.button, e.shiftKey); };
    ed.onmousemove = function (e) { moveEditPointer(e.clientX, e.clientY); };
    ed.oncontextmenu = function (e) { e.preventDefault(); };
    window.addEventListener('mouseup', function () { endEditPointer(); releaseJump(); });
    ed.addEventListener('touchstart', function (e) {
      e.preventDefault(); var t = e.touches[0]; beginEditPointer(t.clientX, t.clientY, 0, false);
    }, { passive: false });
    ed.addEventListener('touchmove', function (e) { e.preventDefault(); var t = e.touches[0]; moveEditPointer(t.clientX, t.clientY); }, { passive: false });
    ed.addEventListener('touchend', function (e) { e.preventDefault(); endEditPointer(); }, { passive: false });
    ed.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoom = e.deltaY < 0 ? Math.min(2.5, zoom * 1.1) : Math.max(0.4, zoom / 1.1);
    }, { passive: false });

    bind('pan-left', function () { panBtn.left = true; }, function () { panBtn.left = false; });
    bind('pan-right', function () { panBtn.right = true; }, function () { panBtn.right = false; });
    bind('pan-up', function () { panBtn.up = true; }, function () { panBtn.up = false; });
    bind('pan-down', function () { panBtn.down = true; }, function () { panBtn.down = false; });

    click('tab-play', function () { setTab('play'); });
    click('tab-edit', function () { setTab('edit'); });
    click('tab-levels', function () { setTab('levels'); });
    click('btn-play', function () { demoActive = false; resetRun(); status = 'ready'; dirty = true; });
    click('btn-demo', startDemo);
    click('btn-level', function () { loadLevel((levelIdx + 1) % LEVELS.length); setTab('play'); });
    click('btn-zoom-in', function () { zoom = Math.min(2.5, zoom * 1.15); dirty = true; });
    click('btn-zoom-out', function () { zoom = Math.max(0.4, zoom / 1.15); dirty = true; });
    click('btn-test', function () { setTab('play'); demoActive = false; resetRun(); status = 'ready'; dirty = true; });
    click('btn-import', function () { doImport(io.value); });
    click('btn-export-code', function () { ioSetText(LevelModel.serialize(LEVEL)); flash('Level code. Copy it to save.'); });
    click('btn-export-z', function () { ioSetText(LevelModel.exportLevelString(LEVEL)); flash('Compressed level string. Paste it into Import later.'); });
    click('btn-export-gmd', function () { ioSetText(LevelModel.exportGmd(LEVEL, LEVEL_NAME)); flash('.gmd text. Save it as a .gmd file, or paste it back into Import.'); });
    click('btn-undo', undo);
    click('btn-redo', redo);
    click('btn-clear', function () { beginStroke(); LEVEL.clear(); clearSelection(); endStroke(); levelIsDefault = false; dirty = true; flash('Cleared.'); });
    click('btn-reset', function () { loadLevel(levelIdx); flash('Restored ' + LEVELS[levelIdx].name + '.'); });

    var fileIn = document.getElementById('gmd-file');
    if (fileIn) fileIn.onchange = function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { ioSetText(reader.result); doImport(reader.result); };
      reader.readAsText(f);
    };

    var bar = document.getElementById('tools');
    TOOLS.forEach(function (tool, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'tool'; b.textContent = tool.label;
      b.onclick = function () { toolIndex = i; markTool(); dirty = true; };
      bar.appendChild(b);
      toolBtns.push(b);
    });
    markTool();

    // test hook for the headless harness
    window.CubeDashDebug = {
      advanceFrame: advanceFrame, startDemo: startDemo, resetRun: resetRun,
      startPlay: function () { resetRun(); status = 'ready'; }, pressJump: pressJump, releaseJump: releaseJump,
      getStatus: function () { return status; }, getPlayer: function () { return p; }, getPlayer2: function () { return p2; },
      groupInfo: function (g) { return groupInfo([g]); }, getGroupState: function () { return groupState; },
      getLevel: function () { return LEVEL; }, setLevel: function (l) { LEVEL = l; levelIsDefault = false; snapshotPalette(); },
      endX: endX, setTab: setTab, doImport: doImport, loadLevel: loadLevel, levels: LEVELS,
      setTool: function (i) { toolIndex = i; }, tools: TOOLS, selection: function () { return selection; },
      selectRect: selectRect, deleteSelection: deleteSelection, copySelection: copySelection, pasteAt: pasteAt,
      undo: undo, redo: redo, coinsGot: function () { return coinsGot; },
      // test hook: park the simulation and look at any spot of the level. Triggers are
      // fast-forwarded to the parked x so colour / move states match a real run there.
      freezeAt: function (x, y, flip) {
        frozen = true; status = 'play'; holding = false; pressQueued = false;
        restorePalette();                       // colour triggers must replay from the header palette
        if (p) { p.x = x; p.y = y; p.vy = 0; p.rot = 0; p.flip = !!flip; p.mode = p.mode || 'cube'; p.dead = false; p2 = null; }
        startTriggers();
        if (p) {
          var guard = 0;
          while (guard++ < 20000) {
            processTriggers(); processColourTriggers(); tickTweens();
            if (!p || p.dead || p.x >= x) break;
            p.x = Math.min(x, p.x + 10);
          }
        }
        updatePlayCamera(true); dirty = true;
      },
      setFrozen: function (v) { frozen = !!v; },
      // real-run parking: noclip walk from the level start, one real sim frame at a time,
      // so colour tweens / move / spawn triggers progress exactly like an actual attempt
      setNoclip: function (v) { GameSim.setNoclip(!!v); },
      runTo: function (x) {
        GameSim.setNoclip(true);
        frozen = false; holding = false; pressQueued = false;
        resetRun(); status = 'play';
        var guard = 0;
        while (guard++ < 80000 && p && p.x < x) {
          advanceFrame();
          if (status === 'dead' && p) {         // noclip only skips collisions; out-of-bounds still resets
            p.dead = false; p.vy = 0; p.y = Math.min(Math.max(p.y, 120), 900); status = 'play';
          }
          if (status === 'won') break;
        }
        frozen = true;
        GameSim.setNoclip(false);
        updatePlayCamera(true); dirty = true;
        return { x: p && p.x, y: p && p.y, mode: p && p.mode, flip: p && p.flip };
      },
      triggerColour: startTriggers
    };

    setTab('play');
    dirty = true;
    window.requestAnimationFrame(function (t) { lastNow = t; loop(t); });
  }

  init();
})();
