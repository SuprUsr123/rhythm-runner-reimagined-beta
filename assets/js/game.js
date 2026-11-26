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
  if (typeof Image !== 'undefined' && window.RR_TIER !== 'none') {
    DECOR_DATA.sheets.forEach(function (src, si) {
      var im = new Image();
      im.onload = function () { SHEET_OK[si] = true; dirty = true; };
      im.src = src;
      SHEET_IMG[si] = im;
    });
  }
  BUILTIN.forEach(function (b) { LEVELS.push({ group: 'BUILT-IN', name: b.name, builtin: true, template: b.template, rle: b.rle }); });
  // official levels are streamed: the level string lives in assets/levels/<key>.txt and is fetched when the level
  // is chosen, then dropped again when it is no longer near the current level (see unloadStreamedLevels)
  OFFICIAL.forEach(function (o) { LEVELS.push({ group: 'OFFICIAL', name: o.name, builtin: false, data: null, stream: o.stream, creator: o.creator, stars: o.stars, coins: o.coins }); });
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
  var holding = false, pressQueued = false, leftHeld = false, rightHeld = false;
  var checkpointState = null, activeCheckpointKey = null, fallSpeedLowActive = false;
  var acc = 0, lastNow = 0;
  var playCamY = 0;
  // reference mirror-portal animation (game-scene _stepMirror: 0.4 s, pow-1.2 ease, visual flips at halfway)
  var mirAnim = { animating: false, p: 0, from: 0, to: 0, t: 0 };
  // reference fly ground/ceiling band animation (level.js stepGroundAnimation: 0.5 s linear)
  var flyBand = { on: false, value: 0, from: 0, to: 0, t: 0, spanPx: 600 };
  // reference _updateBackground accumulators: bg scroll and ground shift follow camera deltas
  var bgScrollPx = 0, groundShiftPx = 0, prevCamPx = null;
  var demoActive = false, demoIdx = 0, prevDemoHold = 0;
  var coinsGot = {}, coinCount = 0;
  var DEFAULT_INF = { dx: 0, dy: 0, hidden: false, alpha: 1 };
  var dirty = true;
  // settings (Web Dashers pause-menu toggles). Not persisted: localStorage is volatile on this browser.
  var showNoclip = false, showHitboxes = false, showPercent = true;

  function flash(msg) { var el = document.getElementById('msg'); if (el) el.textContent = msg; }

  var brokenList = [];
  function spawn() {
    p = GS.newPlayer(0, 15, 'cube');
    p.onGround = true; p.canJump = true;
    p2 = null;
    leftHeld = false; rightHeld = false; checkpointState = null; activeCheckpointKey = null; fallSpeedLowActive = false;
    coinsGot = {}; coinCount = 0;
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
    mirAnim.animating = false; mirAnim.p = 0; mirAnim.to = 0;
    flyBand.on = false; flyBand.value = 0; flyBand.to = 0;
    bgScrollPx = 0; groundShiftPx = 0; prevCamPx = null;
    spawn(); updatePlayCamera(true); startTriggers();
  }

  // drop streamed level strings that are not the current level or its neighbours
  function unloadStreamedLevels(keep) {
    for (var k = 0; k < LEVELS.length; k++) {
      if (!LEVELS[k].stream || k === keep || k === keep - 1 || k === keep + 1) continue;
      LEVELS[k].data = null;
    }
  }
  var levelFetchToken = 0;
  function loadStreamedLevel(i) {
    var L = LEVELS[i];
    var token = ++levelFetchToken;
    flash('Loading ' + L.name + '...');
    fetch(L.stream, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (txt) {
      L.data = txt;
      if (token !== levelFetchToken) return;      // a newer selection superseded this fetch
      unloadStreamedLevels(i);
      loadLevel(i);
      dirty = true;
    }).catch(function () {
      flash('Could not load ' + L.name + '. Serve the game over http (not file://).');
    });
  }

  function loadLevel(i) {
    var L0 = LEVELS[i];
    if (!L0.builtin && !L0.data && L0.stream) { loadStreamedLevel(i); return; }
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
        flash('Loaded ' + L.name + ' by ' + L.creator + ': ' + LEVEL.objs.length + ' objects, ' + skipped + ' unsupported skipped, ' + inertCount() + ' inert triggers (not simulated).');
      } catch (e) {
        LEVEL = LevelModel.fromTemplate([]);
        flash('Could not load ' + L.name + ': ' + e.message);
      }
      DEMO_RLE = '';
      levelIsDefault = false;
    }
    LEVEL_NAME = L.name;
    syncPlatformerUI();
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
  function releaseJump() { holding = false; if (p) p.stopJumpUntilRelease = false; if (p2) p2.stopJumpUntilRelease = false; }

  // ---- portals ----
  function copyState(src, dst) {
    dst.x = src.x; dst.y = src.y; dst.lastY = src.lastY; dst.lastX = src.lastX; dst.vy = src.vy; dst.rot = src.rot;
    dst.mode = src.mode; dst.flip = src.flip; dst.mirrored = src.mirrored;
    dst.speed = src.speed; dst.grav = src.grav; dst.yStart = src.yStart;
    dst.dirSign = src.dirSign || 1;
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
    p2.gravityScale = p2GravityScale;
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
    // reference toggleMirror: the world flip animates over 0.4 s; the per-player mirrored flag
    // follows at the halfway point via stepMirror's visual update
    if (kind === 'mirrorOn') { if (pl === p) toggleMirror(true); return; }
    if (kind === 'mirrorOff') { if (pl === p) toggleMirror(false); return; }
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
    GS.setMode(pl, kind, r && r.portalY !== undefined ? r.portalY : undefined);
  }

  // Camera 2.2 controls. The camera remains a Canvas 2D transform: no shader or WebGL path.
  var CAM_LOCK_MODES = { ship: true, ufo: true, wave: true, ball: true, spider: true };
  var camZoom = 1, camOffX = 0, camOffY = 0, camLocked = false, camTweens = [], camAngle = 0, camWorldX = 0;
  var cameraStatic = null, cameraEdges = {};
  var freeCameraMode = false, freeCamEasing = 1, freeCamPadding = 0;
  var timeWarp = 1, lastTriggerX = null, triggerSweep = null, trigTouching = {};
  var p1GravityScale = 1, p2GravityScale = 1;
  function playerNow() { return p; }
  function startCamAngle(tp) {
    var target = tp.add ? camAngle + (tp.degrees || 0) : (tp.degrees || 0);
    if (tp.snap360) {
      while (target > 180) target -= 360;
      while (target < -180) target += 360;
    }
    camTweens.push({ key: 'angle', from: camAngle, to: target, n: camFrames(tp.dur), t: 0, easingType: tp.easingType || 0, easingRate: tp.easingRate === undefined ? 2 : tp.easingRate });
  }
  function applyGameplayRotate(tp, pl) {
    if (!pl) return;
    var sideways = tp.ground === 3 || tp.ground === 4;
    var flipped = tp.ground === 1 || tp.ground === 4, reversed = tp.move === 2 || tp.move === 3;
    var oldDir = pl.dirSign || 1;
    if (!!pl.sideways !== sideways) {
      pl.sideways = sideways; pl.vy = pl.speed;
      pl.onGround = false; pl.onCeiling = false; pl.canJump = false;
    }
    if (!!pl.flip !== flipped) GS.flipGravity(pl, flipped, 1.0);
    pl.dirSign = reversed ? -1 : 1;
    if (pl === p && oldDir !== pl.dirSign) emitGameplayEvent(75, 1);
  }
  function camFrames(sec) { return Math.max(0, Math.round((sec || 0) * 60)); }
  function startCamZoom(params) { camTweens.push({ key: 'zoom', from: camZoom, to: params.zoom, n: camFrames(params.dur), t: 0, easingType: params.easingType || 0, easingRate: params.easingRate === undefined ? 2 : params.easingRate }); }
  function startCamOffset(params) {
    var n = camFrames(params.dur);
    if (params.axis !== 2) camTweens.push({ key: 'offX', from: camOffX, to: params.dx || 0, n: n, t: 0, easingType: params.easingType || 0, easingRate: params.easingRate === undefined ? 2 : params.easingRate });
    if (params.axis !== 1) camTweens.push({ key: 'offY', from: camOffY, to: params.dy || 0, n: n, t: 0, easingType: params.easingType || 0, easingRate: params.easingRate === undefined ? 2 : params.easingRate });
  }
  function startStaticCamera(params) {
    if (params.exit) {
      var snapExit = !!params.exitInstant;
      cameraStatic = null; camLocked = false;
      if (snapExit) updatePlayCamera(true, 1);
      return;
    }
    var target = findGroupPosition(params.target);
    if (!target) return;
    cameraStatic = { group: params.target, follow: !!params.follow, axis: params.axis || 0, anchorX: target.x, anchorY: target.y,
      fromX: camWorldX, fromY: playCamY, elapsed: 0, duration: camFrames(params.dur),
      easingType: params.easingType || 0, easingRate: params.easingRate === undefined ? 2 : params.easingRate,
      followEasing: Math.max(0.1, params.followEasing || 1), smoothVelocity: !!params.smoothVelocity, smoothVelocityMod: params.smoothVelocityMod === undefined ? 1 : params.smoothVelocityMod };
    camLocked = true;
  }
  function tickCamera(frameScale) {
    frameScale = frameScale === undefined ? 1 : frameScale;
    for (var i = camTweens.length - 1; i >= 0; i--) {
      var tw = camTweens[i]; tw.t += frameScale;
      var f = Math.min(1, tw.t / Math.max(1, tw.n));
      f = easingSample(tw.easingType || 0, tw.easingRate === undefined ? 2 : tw.easingRate, f);
      var v = tw.from + (tw.to - tw.from) * f;
      if (tw.key === 'zoom') camZoom = v; else if (tw.key === 'offX') camOffX = v; else if (tw.key === 'offY') camOffY = v; else camAngle = v;
      if (tw.t >= Math.max(1, tw.n)) camTweens.splice(i, 1);
    }
  }
  function applyCameraEdges() {
    var z = Math.max(0.1, camZoom || 1), pos;
    pos = cameraEdges[1] ? findGroupPosition(cameraEdges[1]) : null;
    if (pos) { var minX = pos.x + CENTER_X / (2 * z) - camOffX; if (camWorldX < minX) camWorldX = minX; }
    pos = cameraEdges[2] ? findGroupPosition(cameraEdges[2]) : null;
    if (pos) { var maxX = pos.x - (CW - CENTER_X) / (2 * z) - camOffX; if (camWorldX > maxX) camWorldX = maxX; }
    pos = cameraEdges[3] ? findGroupPosition(cameraEdges[3]) : null;
    if (pos) { var topY = (playCamY + GROUND_SY) / (2 * z) + camOffY; if (topY > pos.y) playCamY = -GROUND_SY + 2 * z * (pos.y - camOffY); }
    pos = cameraEdges[4] ? findGroupPosition(cameraEdges[4]) : null;
    if (pos) { var bottomY = (playCamY + GROUND_SY - CH) / (2 * z) + camOffY; if (bottomY < pos.y) playCamY = CH - GROUND_SY + 2 * z * (pos.y - camOffY); }
  }
  function updatePlayCamera(snap, frameScale) {
    frameScale = frameScale === undefined ? (timeWarp || 1) : frameScale;
    if (!p) return;
    if (cameraStatic) {
      var target = cameraStatic.follow ? findGroupPosition(cameraStatic.group) : { x: cameraStatic.anchorX, y: cameraStatic.anchorY };
      if (target) {
        var tx = target.x - camOffX;
        var ty = CH / 2 - GROUND_SY + 2 * camZoom * (target.y - camOffY);
        var axisX = cameraStatic.axis !== 2, axisY = cameraStatic.axis !== 1;
        if (cameraStatic.duration > 0 && cameraStatic.elapsed < cameraStatic.duration) {
          cameraStatic.elapsed = Math.min(cameraStatic.duration, cameraStatic.elapsed + frameScale);
          var f = easingSample(cameraStatic.easingType, cameraStatic.easingRate, cameraStatic.elapsed / cameraStatic.duration);
          if (axisX) camWorldX = cameraStatic.fromX + (tx - cameraStatic.fromX) * f;
          if (axisY) playCamY = cameraStatic.fromY + (ty - cameraStatic.fromY) * f;
        } else if (cameraStatic.follow) {
          var follow = 1 - Math.pow(0.9, frameScale * cameraStatic.followEasing * (cameraStatic.smoothVelocity ? Math.max(0.1, cameraStatic.smoothVelocityMod) : 1));
          if (axisX) camWorldX += (tx - camWorldX) * follow;
          if (axisY) playCamY += (ty - playCamY) * follow;
        } else {
          // A non-follow Static Camera is a fixed anchor, not a one-time tween that
          // falls back to the player camera as soon as its move time has elapsed.
          if (axisX) camWorldX = tx;
          if (axisY) playCamY = ty;
        }
      }
    } else {
      camWorldX = p.x;
      // A rotated gameplay frame maps world Y onto the screen's horizontal axis. Follow
      // that coordinate with the camera's Y offset; otherwise the player walks off the
      // left/right edge while the camera keeps following the now-vertical world-X axis.
      if (p.sideways) {
        var sideTargetY = CH / 2 - GROUND_SY + 2 * camZoom * (p.y - camOffY);
        var sideEase = 1 - Math.pow(0.9, frameScale * (freeCameraMode ? freeCamEasing : 1));
        if (snap) playCamY = sideTargetY; else playCamY += (sideTargetY - playCamY) * sideEase;
      }
      // The Camera Mode trigger can release the normal fly-corridor camera lock.
      else if (!freeCameraMode && CAM_LOCK_MODES[p.mode] && p.flyCeil !== null && p.flyCeil !== undefined) {
        var fc = (p.flyFloor + p.flyCeil) / 2;
        var flyTarget = Math.max(0, 2 * fc - 320 + REF_O), flyFollow = 1 - Math.pow(0.9, frameScale);
        if (snap) playCamY = flyTarget; else playCamY += (flyTarget - playCamY) * flyFollow;
      } else {
        var yr = 2 * p.y, cy = playCamY, targetY = cy;
        var pad = freeCameraMode ? freeCamPadding * CH * 0.5 : 0;
        var topThreshold = 140 + pad, bottomThreshold = 80 + pad;
        var A = cy - REF_O + 320;
        if (!p.flip) {
          if (yr > A + topThreshold) targetY = yr - 320 - topThreshold + REF_O;
          else if (yr < A - bottomThreshold) targetY = yr - 320 + bottomThreshold + REF_O;
        } else {
          if (yr > A + bottomThreshold) targetY = yr - 320 - bottomThreshold + REF_O;
          else if (yr < A - topThreshold) targetY = yr - 320 + topThreshold + REF_O;
        }
        if (targetY < 0) targetY = 0;
        var camEase = 1 - Math.pow(0.9, frameScale * (freeCameraMode ? freeCamEasing : 1));
        if (snap) playCamY = targetY; else playCamY += (targetY - playCamY) * camEase;
      }
    }
    applyCameraEdges();
  }

  // reference _mirrorProgress / toggleMirror / _stepMirror (game-scene.js): the world reflects
  // around the screen centre over 0.4 s; the mirrored flag (player sprite flip) switches at the
  // halfway point, matching the reference's visual update
  function mirrorProgress() { return mirAnim.animating ? mirAnim.p : (p && p.mirrored ? 1 : 0); }
  function toggleMirror(on) {
    var cur = mirAnim.animating ? !!mirAnim.to : !!(p && p.mirrored);
    if (cur === on) return;
    mirAnim.from = mirrorProgress(); mirAnim.p = mirAnim.from;
    mirAnim.to = on ? 1 : 0; mirAnim.t = 0; mirAnim.animating = true;
  }
  function stepMirror(dtSec) {
    if (!mirAnim.animating) return;
    mirAnim.t += dtSec;
    var k = Math.min(1, mirAnim.t / 0.4);
    var t2 = k * 2;
    var eased = t2 < 1 ? 0.5 * Math.pow(t2, 1.2) : 1 - 0.5 * Math.pow(2 - t2, 1.2);
    mirAnim.p = mirAnim.from + (mirAnim.to - mirAnim.from) * eased;
    if (k >= 1) { mirAnim.p = mirAnim.to; mirAnim.animating = false; }
    var visual = mirAnim.animating ? mirAnim.p >= 0.5 : !!mirAnim.to;
    if (p) p.mirrored = visual;
    if (p2) p2.mirrored = visual;
  }
  // reference level.js stepGroundAnimation + setFlyMode insets: entering a fly mode slides the
  // ground band down and drops a ceiling band in from the top, over 0.5 s linear
  function stepFlyBand(dtSec) {
    var want = !!(p && CAM_LOCK_MODES[p.mode] && p.flyCeil !== null && p.flyCeil !== undefined);
    if (want !== flyBand.on) {
      flyBand.on = want;
      flyBand.from = flyBand.value; flyBand.to = want ? 1 : 0; flyBand.t = 0;
      if (want) flyBand.spanPx = 2 * Math.max(0, p.flyCeil - p.flyFloor);
    }
    if (flyBand.value !== flyBand.to) {
      flyBand.t += dtSec;
      var kk = Math.min(1, flyBand.t / 0.5);
      flyBand.value = flyBand.from + (flyBand.to - flyBand.from) * kk;
    }
  }
  // per-frame visual state in the reference update order: camera -> mirror step -> background
  // scroll / ground shift -> ground band animation
  function stepVisualAnims(dtSec) {
    stepMirror(dtSec);
    var camPx = 2 * (p ? camWorldX : 0);
    if (prevCamPx === null) prevCamPx = camPx;
    var dCam = camPx - prevCamPx;
    if (dCam) {
      var mp = mirrorProgress();
      bgScrollPx += dCam * (1 - 2 * mp);
      if (mp > 0) groundShiftPx += 2 * mp * dCam;
    }
    prevCamPx = camPx;
    stepFlyBand(dtSec);
  }

  function coinKey(c) { return c.cx + ',' + c.cy; }

  // sideways gameplay: exchange the player's x and y (and the last positions) around the step, and step
  // on the transposed collision copy (reference _swapSidewaysFrame)
  function swapSidewaysFrame(pl) {
    var t = pl.x; pl.x = pl.y; pl.y = t;
    t = pl.lastX; pl.lastX = pl.lastY; pl.lastY = t;
  }
  function stepOne(pl, sub, lv, hold, pressed, end) {
    var sideways = !!pl.sideways;
    if (sideways) swapSidewaysFrame(pl);
    var lvStep = sideways ? LevelModel.transposeSim(lv) : lv;
    var playerPressed = pressed && !pl.stopJumpUntilRelease;
    var playerHold = hold && !pl.stopJumpUntilRelease;
    var r = GS.step(pl, sub, { pressed: playerPressed, hold: playerHold, platformer: !!LEVEL.platformer, left: pl === p ? leftHeld : false, right: pl === p ? rightHeld : false, freeModeCamera: freeCameraMode }, lvStep);
    if (sideways) swapSidewaysFrame(pl);
    if (r.died && !pl.__deathLogged && typeof window !== 'undefined' && window.__onDeath) { pl.__deathLogged = true; try { window.__onDeath(pl, r, lvStep); } catch (e) { } }
    if (r.portal) {
      // stacked portals arrive as an array (gamemode + gravity + size at the same spot)
      if (r.portal instanceof Array) {
        for (var pi = 0; pi < r.portal.length; pi++) applyPortal(r.portal[pi], r, pl);
      } else applyPortal(r.portal, r, pl);
    }
    if (r.speed !== null) GS.setSpeed(pl, r.speed);
    if (r.checkpoint) activateCheckpoint(r.checkpoint, pl);
    for (var k = 0; k < r.coins.length; k++) {
      var coinObj = lvStep.coins[r.coins[k]];
      var ck = coinKey(coinObj.orig || coinObj);
      if (!coinsGot[ck]) { coinsGot[ck] = true; coinCount++; }
    }
    if (r.breaks.length) {
      var newlyBroken = false;
      for (var bk = 0; bk < r.breaks.length; bk++) {
        var block = r.breaks[bk];
        if (block && block.orig) block = block.orig;     // breaks from the transposed copy map back to the level
        // The level snapshot is reused for all four substeps in a frame. Ignore duplicate
        // contacts after the first one has already marked this object as broken.
        if (block && !block.broken) {
          block.broken = true;
          brokenList.push(block);
          newlyBroken = true;
        }
      }
      if (newlyBroken) LEVEL.dirty = true;      // rebuild the sim without the broken blocks
    }
    return r;
  }

  // ---- groups and triggers (legacy object triggers plus Canvas-compatible 2.2 gameplay triggers) ----
  var groupState = {}, trigFired = {}, groupQueue = [], frameNo = 0;
  var groupCenterCache = {}, channelPulses = [];
  var dynDirty = true, lastDynLevel = null;   // grouped objects are rebuilt only when the group state changes
  var currentGroup = 0, touchNext = false;
  function gstate(g) {
    if (!groupState[g]) groupState[g] = { bx: 0, by: 0, tweens: [], hidden: false, alpha: 1, atw: null, rotation: 0, rotTweens: [], centerGroup: 0, lockRotation: false, pulses: [] };
    return groupState[g];
  }
  function frames(sec) { return Math.max(1, Math.round((sec || 0) * 60)); }
  function groupInfo(groups) {
    var dx = 0, dy = 0, hidden = false, alpha = 1, rotation = 0, pivot = null, lockRotation = false, pulseTint = null;
    var centerGroup = 0, k, s, j, tw, f;
    for (k = 0; k < groups.length; k++) {
      s = groupState[groups[k]];
      if (!s) continue;
      dx += s.bx; dy += s.by;
      for (j = 0; j < s.tweens.length; j++) {
        tw = s.tweens[j]; f = Math.min(1, tw.t / tw.dur);
        f = easingSample(tw.easingType, tw.easingRate, f);
        dx += tw.dx * f; dy += tw.dy * f;
      }
      rotation += s.rotation || 0;
      if (s.centerGroup > 0) {
        centerGroup = s.centerGroup;
        if (groupCenterCache[s.centerGroup]) {
          // Resolve the live pivot once so rendering and physics use exactly the same
          // point while the centre group itself is being moved.
          var basePivot = groupCenterCache[s.centerGroup];
          var pivotX = basePivot.x, pivotY = basePivot.y;
          var pivotState = groupState[s.centerGroup];
          if (pivotState) {
            pivotX += pivotState.bx; pivotY += pivotState.by;
            for (var pj = 0; pj < pivotState.tweens.length; pj++) {
              var pt = pivotState.tweens[pj];
              var pfrac = easingSample(pt.easingType, pt.easingRate, Math.min(1, pt.t / pt.dur));
              pivotX += pt.dx * pfrac; pivotY += pt.dy * pfrac;
            }
          }
          pivot = { x: pivotX, y: pivotY };
        }
        lockRotation = !!s.lockRotation;
      }
      if (s.pulses && s.pulses.length) pulseTint = s.pulses[s.pulses.length - 1].tint || pulseTint;
      if (s.hidden) hidden = true;
      if (s.alpha < alpha) alpha = s.alpha;
    }
    return { dx: dx, dy: dy, hidden: hidden, alpha: alpha, rotation: rotation, pivot: pivot, centerGroup: centerGroup, lockRotation: lockRotation, pulseTint: pulseTint };
  }
  var GC_MEMO = { objs: null, rev: -1, len: -1 };
  function rebuildGroupCenters() {
    if (GC_MEMO.objs === LEVEL.objs && GC_MEMO.rev === (LEVEL.revision || 0) && GC_MEMO.len === LEVEL.objs.length) return;
    GC_MEMO.objs = LEVEL.objs; GC_MEMO.rev = LEVEL.revision || 0; GC_MEMO.len = LEVEL.objs.length;
    var acc = {};
    if (!LEVEL || !LEVEL.objs) { groupCenterCache = {}; return; }
    LEVEL.objs.forEach(function (o) {
      if (!o.groups || !o.groups.length || kindFast(o) === 'trigger' || (kindFast(o) === 'fx' && o.id !== 2016)) return;
      var fp = footFast(o), cx = o.gx * CELL + fp.w * CELL / 2, cy = o.gy * CELL + fp.h * CELL / 2;
      o.groups.forEach(function (gid) {
        if (!acc[gid]) acc[gid] = { x: 0, y: 0, n: 0 };
        acc[gid].x += cx; acc[gid].y += cy; acc[gid].n++;
      });
    });
    groupCenterCache = {};
    Object.keys(acc).forEach(function (gid) { groupCenterCache[gid] = { x: acc[gid].x / acc[gid].n, y: acc[gid].y / acc[gid].n }; });
  }
  function easingSample(type, rate, x) {
    if (x === 0 || x === 1) return x;
    if (rate === undefined || rate === null) rate = 2;
    function bounceTime(v) {
      if (v < 1 / 2.75) return 7.5625 * v * v;
      if (v < 2 / 2.75) { v -= 1.5 / 2.75; return 7.5625 * v * v + 0.75; }
      if (v < 2.5 / 2.75) { v -= 2.25 / 2.75; return 7.5625 * v * v + 0.9375; }
      v -= 2.625 / 2.75; return 7.5625 * v * v + 0.984375;
    }
    var t, period, shift;
    switch (type) {
      case 0: return x;
      case 1: t = x * 2; return t < 1 ? 0.5 * Math.pow(t, rate) : 1 - 0.5 * Math.pow(2 - t, rate);
      case 2: return Math.pow(x, rate);
      case 3: return Math.pow(x, 1 / rate);
      case 4:
        period = rate || 0.45; shift = period / 4; t = x - 1;
        return t < 0 ? -0.5 * Math.pow(2, 10 * t) * Math.sin((t - shift) * 2 * Math.PI / period) : Math.pow(2, -10 * t) * Math.sin((t - shift) * 2 * Math.PI / period) * 0.5 + 1;
      case 5: period = rate; shift = period / 4; t = x - 1; return -Math.pow(2, 10 * t) * Math.sin((t - shift) * 2 * Math.PI / period);
      case 6: period = rate; shift = period / 4; return Math.pow(2, -10 * x) * Math.sin((x - shift) * 2 * Math.PI / period) + 1;
      case 7: return x < 0.5 ? (1 - bounceTime(1 - x * 2)) * 0.5 : bounceTime(x * 2 - 1) * 0.5 + 0.5;
      case 8: return 1 - bounceTime(1 - x);
      case 9: return bounceTime(x);
      case 10: return x < 0.5 ? 0.5 * Math.pow(2, 10 * (x * 2 - 1)) : 0.5 * (-Math.pow(2, -10 * (x * 2 - 1)) + 2);
      case 11: return Math.max(0, Math.pow(2, 10 * (x - 1)) - 0.001);
      case 12: return -Math.pow(2, -10 * x) + 1;
      case 13: return -0.5 * (Math.cos(x * Math.PI) - 1);
      case 14: return 1 - Math.cos(x * Math.PI / 2);
      case 15: return Math.sin(x * Math.PI / 2);
      case 16:
        var overshoot = 1.70158 * 1.525; t = x * 2;
        return t < 1 ? (t * t * ((overshoot + 1) * t - overshoot)) / 2 : ((t - 2) * (t - 2) * ((overshoot + 1) * (t - 2) + overshoot)) / 2 + 1;
      case 17: return x * x * ((1.70158 + 1) * x - 1.70158);
      case 18: t = x - 1; return t * t * ((1.70158 + 1) * t + 1.70158) + 1;
      default: return x;
    }
  }

  function pulseIntensity(t, fadeIn, hold, fadeOut) {
    var v;
    if (t < fadeIn) v = fadeIn > 0 ? t / fadeIn : 1;
    else if (t < fadeIn + hold) v = 1;
    else if (t < fadeIn + hold + fadeOut) v = fadeOut > 0 ? 1 - (t - fadeIn - hold) / fadeOut : 0;
    else v = 0;
    return Math.round(v * 32) / 32;
  }
  function tickTweens(frameScale) {
    frameScale = frameScale === undefined ? 1 : frameScale;
    Object.keys(groupState).forEach(function (g) {
      var s = groupState[g], j, tw, f;
      if (s.tweens.length || s.atw || s.rotTweens.length) dynDirty = true;
      for (j = s.tweens.length - 1; j >= 0; j--) {
        tw = s.tweens[j]; tw.t += frameScale;
        if (tw.t >= tw.dur) { s.bx += tw.dx; s.by += tw.dy; s.tweens.splice(j, 1); }
      }
      if (s.atw) {
        s.atw.t += frameScale;
        f = Math.min(1, s.atw.t / s.atw.dur);
        f = easingSample(s.atw.easingType, s.atw.easingRate, f);
        s.alpha = s.atw.from + (s.atw.to - s.atw.from) * f;
        if (f >= 1) s.atw = null;
      }
      for (j = s.rotTweens.length - 1; j >= 0; j--) {
        tw = s.rotTweens[j]; tw.t += frameScale;
        var rp = Math.min(1, tw.t / tw.dur);
        var rs = easingSample(tw.easingType, tw.easingRate, rp);
        var ps = easingSample(tw.easingType, tw.easingRate, tw.prev);
        s.rotation += (rs - ps) * tw.totalRad;
        tw.prev = rp;
        if (rp >= 1) s.rotTweens.splice(j, 1);
      }
      for (j = s.pulses.length - 1; j >= 0; j--) {
        var pulse = s.pulses[j]; pulse.t += frameScale;
        var sec = pulse.t / 60;
        var intensity = pulseIntensity(sec, pulse.fadeIn, pulse.hold, pulse.fadeOut);
        pulse.tint = intensity > 0.01 ? rgbStr({ r: pulse.r * intensity, g: pulse.g * intensity, b: pulse.b * intensity }) : null;
        if (sec >= pulse.total) s.pulses.splice(j, 1);
      }
    });
    for (var cp = channelPulses.length - 1; cp >= 0; cp--) {
      var chp = channelPulses[cp]; chp.t += frameScale;
      var cs = chp.t / 60, ci = pulseIntensity(cs, chp.fadeIn, chp.hold, chp.fadeOut);
      if (ci > 0.01) LEVEL.palette[chp.channel] = rgbStr({ r: chp.base.r + (chp.r - chp.base.r) * ci, g: chp.base.g + (chp.g - chp.base.g) * ci, b: chp.base.b + (chp.b - chp.base.b) * ci });
      else LEVEL.palette[chp.channel] = rgbStr(chp.base);
      if (cs >= chp.total) { LEVEL.palette[chp.channel] = rgbStr(chp.base); channelPulses.splice(cp, 1); }
    }
  }
  function stopGroup(g) {
    var s = groupState[g];
    if (!s) return;
    dynDirty = true;
    s.tweens.forEach(function (tw) { var f = easingSample(tw.easingType, tw.easingRate, Math.min(1, tw.t / tw.dur)); s.bx += tw.dx * f; s.by += tw.dy * f; });
    s.tweens = [];
    s.rotTweens = [];
    s.pulses = [];
    s.atw = null;
  }
  // triggers the build recognises but does not simulate (particles, shaders, tints, ...): shown in the load message
  function inertCount() {
    var n = 0;
    if (LEVEL && LEVEL.objs) for (var i = 0; i < LEVEL.objs.length; i++) {
      var o = LEVEL.objs[i];
      if (kindFast(o) === 'fx') n++;
    }
    return n;
  }
  function findGroupPosition(groupId) {
    if (!(groupId > 0) || !groupCenterCache[groupId]) return null;
    // Match the game's group-centre lookup, including currently active group motion and
    // centre-group rotation, rather than picking an arbitrary object in the target group.
    var base = groupCenterCache[groupId], inf = groupInfo([groupId]);
    var x = base.x + inf.dx, y = base.y + inf.dy;
    if (inf.rotation && inf.centerGroup > 0 && inf.pivot) {
      var dx = x - inf.pivot.x, dy = y - inf.pivot.y;
      var c = Math.cos(inf.rotation), sn = -Math.sin(inf.rotation);
      x = inf.pivot.x + dx * c - dy * sn;
      y = inf.pivot.y + dx * sn + dy * c;
    }
    return { x: x, y: y };
  }
  function applyPlayerControl(target, params) {
    if (!target) return;
    // Stop Jump releases an existing held/queued jump; it is not a permanent input lock.
    // A fresh press is accepted again after the player releases the current hold.
    if (params.stopJump && (holding || pressQueued)) target.stopJumpUntilRelease = true;
    if (params.stopMove && (leftHeld || rightHeld)) target.stopMoveUntilRelease = true;
    if (params.stopSlide) target.vx = 0;
    if (params.stopRotate) { target.rotActive = false; target.rot = 0; }
  }
  // Event Trigger (3604) links verified gameplay event codes to an ordinary spawn group.
  // Only event codes confirmed by the reference documentation are emitted here.
  function emitGameplayEvent(code, playerSlot, extraId) {
    var list = LEVEL.sim().triggers;
    for (var i = 0; i < list.length; i++) {
      var eventTrigger = list[i];
      if (eventTrigger.kind !== 'event') continue;
      var params = eventTrigger.p || {}, events = params.events || [];
      if (events.indexOf(code) < 0) continue;
      if (params.player && params.player !== playerSlot) continue;
      if (params.extraId && extraId !== undefined && params.extraId !== extraId) continue;
      if (params.extraId && extraId === undefined) continue;
      if (trigFired[i] && !params.multiTrigger) continue;
      if (!params.multiTrigger) trigFired[i] = true;
      if (params.target > 0) groupQueue.push({ group: params.target, at: frameNo });
    }
  }
  function activateCheckpoint(checkpoint, pl) {
    if (!LEVEL.platformer || pl !== p || !checkpoint) return;
    var key = String(checkpoint.cx) + ':' + String(checkpoint.cy);
    if (key === activeCheckpointKey) return;
    activeCheckpointKey = key;
    checkpointState = { x: checkpoint.cx, y: checkpoint.cy, mode: pl.mode, speed: pl.speed, flip: !!pl.flip, mirrored: !!pl.mirrored, gravityScale: pl.gravityScale || 1, dirSign: pl.dirSign || 1 };
  }
  function respawnAtCheckpoint() {
    if (!checkpointState) return false;
    var cp = checkpointState;
    p = GS.newPlayer(cp.x, cp.y, cp.mode);
    GS.setSpeed(p, cp.speed);
    if (cp.flip) GS.flipGravity(p, true, 1);
    p.gravityScale = cp.gravityScale; p.dirSign = cp.dirSign; p.mirrored = cp.mirrored;
    p.onGround = false; p.canJump = false; p.lastX = p.x; p.lastY = p.y; p.vx = 0; p.vy = 0;
    p.frameStartY = p.y; p.frameDeltaY = 0;
    p.stopMoveUntilRelease = false; p.stopJumpUntilRelease = false; p.freeModeCamera = freeCameraMode;
    lastTriggerX = p.x; triggerSweep = null;
    emitGameplayEvent(64, 1);
    return true;
  }

  function fireTrigger(t) {
    var p = t.p, g = p.target;
    if (t.kind === 'reverse') {
      if (playerNow()) playerNow().dirSign = -(playerNow().dirSign || 1);
      if (p2) p2.dirSign = -(p2.dirSign || 1);
      emitGameplayEvent(75, 1);
      return;
    }
    if (t.kind === 'gravity') {
      var strength = Math.max(0.1, Math.min(2, p.gravity === undefined ? 1 : p.gravity));
      if (p.p1 !== false) { p1GravityScale = strength; if (playerNow()) playerNow().gravityScale = strength; }
      if (p.p2 !== false) { p2GravityScale = strength; if (p2) p2.gravityScale = strength; }
      return;
    }
    if (t.kind === 'playerControl') {
      if (p.p1 !== false) applyPlayerControl(playerNow(), p);
      if (p.p2 !== false) applyPlayerControl(p2, p);
      return;
    }
    if (t.kind === 'timewarp') {
      timeWarp = Math.max(0.1, Math.min(2, p.timeMod === undefined ? 1 : p.timeMod));
      return;
    }
    if (t.kind === 'teleport') {
      var destination = findGroupPosition(g), pl = playerNow();
      if (!destination || !pl) return;
      var oldX = pl.x, oldY = pl.y;
      if (!p.usePlayerX) pl.x = destination.x;
      if (!p.usePlayerY) pl.y = destination.y;
      pl.lastX = pl.x; pl.lastY = pl.y;
      if (Math.abs(pl.x - oldX) > 1e-6 || Math.abs(pl.y - oldY) > 1e-6) {
        pl.onGround = false; pl.onCeiling = false; pl.canJump = false;
      }
      if (p.gravityMode === 1) GS.flipGravity(pl, false, 1);
      else if (p.gravityMode === 2) GS.flipGravity(pl, true, 1);
      else if (p.gravityMode === 3) GS.flipGravity(pl, !pl.flip, 1);
      return;
    }
    if (t.kind === 'end') {
      status = 'won';
      return;
    }
    if (t.kind === 'zoom') { startCamZoom(p); return; }
    if (t.kind === 'camoffset') { startCamOffset(p); return; }
    if (t.kind === 'static') { startStaticCamera(p); return; }
    if (t.kind === 'cameraEdge') { if (p.edge >= 1 && p.edge <= 4) { if (g > 0) cameraEdges[p.edge] = g; else delete cameraEdges[p.edge]; } return; }
    if (t.kind === 'cameraMode') { freeCameraMode = !!p.freeMode; if (p.editSettings) { freeCamEasing = Math.max(1, Math.min(40, p.easing || 1)); freeCamPadding = Math.max(0, Math.min(1, p.padding || 0)); } return; }
    if (t.kind === 'camrot') { startCamAngle(t.p); return; }
    if (t.kind === 'rotategp') {
      if (t.p.changeChannel) setChannel(t.p.targetChannel, t.p.move === 2 || t.p.move === 3);
      if (!t.p.channelOnly) applyGameplayRotate(t.p, playerNow());
      return;
    }
    if (t.kind === 'pulse') {
      var fadeIn = Math.max(0, p.fadeIn || 0), hold = Math.max(0, p.hold || 0), fadeOut = Math.max(0, p.fadeOut || 0);
      var total = fadeIn + hold + fadeOut;
      if (p.targetType === 1 && p.targetGroup > 0) {
        var ps = gstate(p.targetGroup);
        ps.pulses.push({ r: p.r, g: p.g, b: p.b, fadeIn: fadeIn, hold: hold, fadeOut: fadeOut, total: total > 0 ? total : 0.01, t: 0, tint: null });
      } else if (p.targetType === 0 && p.targetChannel > 0) {
        channelPulses.push({ channel: p.targetChannel, base: parseRGB(LEVEL.palette[p.targetChannel]), r: p.r, g: p.g, b: p.b, fadeIn: fadeIn, hold: hold, fadeOut: fadeOut, total: total > 0 ? total : 0.01, t: 0 });
      }
      return;
    }
    // Shader / particle-style 2.2 visual triggers are intentionally inert in this Canvas 2D build.
    // Running the partial post-FX path here clears the composed frame and can leave a white
    // viewport; keep these unsupported trigger IDs harmless instead of showing a broken effect.
    if (t.kind === 'shader') return;
    if (!g) return;
    dynDirty = true;
    if (t.kind === 'stop') { stopGroup(g); return; }
    var s = gstate(g);
    if (t.kind === 'toggle') s.hidden = !p.activate;
    else if (t.kind === 'alpha') s.atw = { from: s.alpha, to: p.opacity === undefined ? 1 : p.opacity, dur: frames(p.dur), t: 0, easingType: p.easingType || 0, easingRate: p.easingRate === undefined ? 2 : p.easingRate };
    else if (t.kind === 'move') s.tweens.push({ dx: p.dx || 0, dy: p.dy || 0, dur: frames(p.dur), t: 0, easingType: p.easingType || 0, easingRate: p.easingRate === undefined ? 2 : p.easingRate });
    else if (t.kind === 'rotate') {
      var totalDeg = (p.degrees || 0) + ((p.times360 || 0) * 360);
      s.centerGroup = p.centerGroup || 0;
      s.lockRotation = !!p.lockRotation;
      s.rotTweens.push({ totalRad: totalDeg * Math.PI / 180, dur: frames(p.dur), t: 0, prev: 0, easingType: p.easingType || 0, easingRate: p.easingRate === undefined ? 2 : p.easingRate });
    }
  }
  // Reference rules: a non-touch trigger fires when the player passes it; a spawn trigger (touch or position)
  // queues its target group after its delay; the group's triggers then fire. Triggers in a spawn-targeted
  // group only fire through their group. Triggers never fire at level start by themselves.
  var targetsCache = {};
  function startTriggers() {
    groupState = {}; trigFired = {}; groupQueue = []; frameNo = 0; dynDirty = true; channelPulses = [];
    timeWarp = 1; lastTriggerX = null; triggerSweep = null; trigTouching = {};
    p1GravityScale = 1; p2GravityScale = 1;
    if (p) { p.gravityScale = 1; p.stopJumpUntilRelease = false; }
    if (p2) { p2.gravityScale = 1; p2.stopJumpUntilRelease = false; }
    camZoom = 1; camOffX = 0; camOffY = 0; camLocked = false; camTweens = []; camAngle = 0;
    resetFx();
    setupChannels();
    camWorldX = p ? p.x : 0; cameraStatic = null; cameraEdges = {}; freeCameraMode = false; freeCamEasing = 1; freeCamPadding = 0;
    rebuildGroupCenters();
    targetsCache = spawnTargets();
    fireStartTriggers();
    startColourTriggers();
  }
  // Reference: triggers at or left of the start (checkAlphaTriggers: trig.x <= playerX) and spawn-triggered
  // triggers (key 62) apply when the level starts. A sweep that only fires on crossing skips them, so a group
  // hidden by a trigger left of the start stayed visible.
  function fireStartTriggers() {
    var list = LEVEL.sim().triggers, i, t, sx = p ? p.x : 0;
    for (i = 0; i < list.length; i++) {
      t = list[i];
      if (trigFired[i] || t.kind === 'event' || t.kind === 'spawn') continue;
      if (t.p.touch && !t.p.spawn) continue;
      if (t.p.spawn || t.x <= sx) fireTriggerAt(i);
    }
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
    if (!t.p.multiTrigger) trigFired[i] = true;
    if (t.p.touch) trigTouching[i] = true;
    if (t.kind === 'spawn') {
      if (t.p.target) groupQueue.push({ group: t.p.target, at: frameNo + Math.round((t.p.delay || 0) * 60) });
      return;
    }
    fireTrigger(t);
  }
  // Trigger channels (reference level-channels.js): triggers with a channel (key 170) wait in a per-channel list
  // ordered by order (115) then position. A rotate-gameplay trigger with change-channel (171) sets the active
  // channel (173) and its direction. Channel 0 stays positional.
  var chLists = null, chActive = 0, chIdx = {}, chRev = {};
  function setupChannels() {
    chLists = null;
    var list = LEVEL.sim().triggers, rots = [], a, b;
    for (a = 0; a < list.length; a++) if (list[a].kind === 'rotategp') rots.push(list[a]);
    var used = rots.some(function (t) { return t.p.changeChannel; }) || list.some(function (t) { return t.p.channel > 0 && !t.p.touch; });
    if (!used) return;
    // reference: rotate-gameplay triggers that are not real touches become positional when channels are used
    rots.forEach(function (t) { t.p.touch = !!t.p.realTouch; });
    // Web Dashers sorts channel triggers on the gameplay travel axis.
    var dirOf = {};
    rots.slice().sort(function (x, y) { return x.left - y.left; }).forEach(function (t) {
      if (!(t.p.targetChannel in dirOf)) dirOf[t.p.targetChannel] = t.p.move || 4;
    });
    chLists = new Map();
    for (b = 0; b < list.length; b++) {
      var tb = list[b];
      if (!(tb.p.channel > 0) || tb.p.touch) continue;
      var moveDir = dirOf[tb.p.channel] || 4, axisY = moveDir === 1 || moveDir === 2;
      if (!chLists.has(tb.p.channel)) chLists.set(tb.p.channel, []);
      chLists.get(tb.p.channel).push({ i: b, ord: tb.p.ord || 0, x: tb.left, y: tb.y, axisY: axisY });
    }
    chLists.forEach(function (entries, ch) {
      var moveDir = dirOf[ch] || 4, rev = moveDir === 2 || moveDir === 3, axisY = moveDir === 1 || moveDir === 2;
      entries.sort(function (x, y) { var xp = axisY ? x.y : x.x, yp = axisY ? y.y : y.x; return x.ord - y.ord || (rev ? yp - xp : xp - yp) || x.i - y.i; });
    });
    chActive = 0; chIdx = {}; chRev = {};
  }
  function setChannel(ch, rev) { chActive = ch; chRev[ch] = !!rev; }
  function stepChannels() {
    if (!chLists || !p) return;
    var list = LEVEL.sim().triggers;
    for (;;) {
      var entries = chLists.get(chActive);
      if (!entries) return;
      var idx = chIdx[chActive] || 0;
      if (idx >= entries.length) return;
      var e = entries[idx], et = list[e.i];
      var rev = !!chRev[chActive], sideways = !!p.sideways;
      // Channel cursor is world-X normally and world-Y in sideways gameplay,
      // matching Web Dashers' playerWorldX/playerY and trigger x/y coordinates.
      var pos = sideways ? p.y : p.x, threshold = sideways ? et.y : et.left;
      if (rev ? threshold < pos : pos < threshold) return;
      chIdx[chActive] = idx + 1;
      fireTriggerAt(e.i);
    }
  }
  function processTriggers() {
    stepChannels();
    var list = LEVEL.sim().triggers, k, t, i, item;
    for (k = groupQueue.length - 1; k >= 0; k--) {
      item = groupQueue[k];
      if (frameNo < item.at) continue;
      groupQueue.splice(k, 1);
      for (i = 0; i < list.length; i++) {
        if (!trigFired[i] && list[i].kind !== 'event' && !list[i].p.touch && list[i].groups.indexOf(item.group) >= 0) fireTriggerAt(i);
      }
    }
    if (!p) return;
    var targets = targetsCache;
    var sweep = triggerSweep || { from: p.x, to: p.x, y: p.y, dir: p.dirSign || 1 };
    for (i = 0; i < list.length; i++) {
      t = list[i];
      if (trigFired[i] || t.kind === 'event') continue;
      if (t.p.touch) {
        var inside = sweep.to >= t.x0 - C.HALF && sweep.to <= t.x1 + C.HALF && sweep.y >= t.y0 - C.HALF && sweep.y <= t.y1 + C.HALF;
        var wasInside = trigTouching[i] === true;
        trigTouching[i] = inside;
        if (inside && !wasInside) fireTriggerAt(i);
      } else if (!spawnOnly(t, targets) && !(chLists && t.p.channel > 0)) {
        // A reverse sweep only fires triggers actually crossed since the previous frame.
        // Merely being to the right of the player after reversing must not fire every trigger.
        var crossed = sweep.dir < 0
          ? (sweep.from > t.x && sweep.to <= t.x)
          : (sweep.from < t.x && sweep.to >= t.x);
        if (crossed) fireTriggerAt(i);
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
    CHANNEL_ALPHA = {};
    CHANNEL_BLEND = {};
    LIGHT_BG_CACHE.key = null;
    var list = LEVEL.sim().colourTriggers || [];
    for (var i = 0; i < list.length; i++) colTrigFired[i] = false;
  }
  function applyColourNow(t) {
    var ch = t.p.channel;
    // reference triggerColor: the target is the copy-source channel (with its HSV adjustment)
    // when a copy channel is set; the opacity tweens separately and applies as sprite alpha
    var target = { r: t.p.r, g: t.p.g, b: t.p.b };
    var copy = t.p.copy > 0 && t.p.copy !== ch ? t.p.copy : 0;
    if (copy) {
      var srcCol = copy === 1000 ? bgColor() : copy === 1001 ? groundColor() : channelColor(copy);
      var srcRgb = rgbParts(srcCol) || { r: 255, g: 255, b: 255 };
      target = applyChannelHsv(srcRgb, t.p.hsv || null);
    }
    if (t.p.blending) CHANNEL_BLEND[ch] = true;      // reference setChannelBlending (sticky)
    // a new trigger on a channel supersedes (and stops) any tween still running there
    for (var i = colourTweens.length - 1; i >= 0; i--) if (colourTweens[i].ch === ch) colourTweens.splice(i, 1);
    var opFrom = channelAlphaOf(ch), opTo = t.p.op === undefined ? 1 : Math.max(0, Math.min(1, t.p.op));
    if (!t.p.dur || t.p.dur <= 1 / 60) {
      LEVEL.palette[ch] = rgbStr(target);
      CHANNEL_ALPHA[ch] = opTo;
      return;
    }
    colourTweens.push({
      ch: ch, from: parseRGB(LEVEL.palette[ch] || channelColor(ch) || 'rgb(255,255,255)'), to: target,
      t: 0, dur: frames(t.p.dur), copy: copy, hsv: t.p.hsv || null,
      opFrom: opFrom, opTo: opTo
    });
  }
  function tickColourTweens(frameScale) {
    frameScale = frameScale === undefined ? 1 : frameScale;
    for (var i = colourTweens.length - 1; i >= 0; i--) {
      var tw = colourTweens[i];
      tw.t += frameScale;
      var f = Math.min(1, tw.t / tw.dur);
      // reference ColorManager.step: a copy tween re-resolves its target while it runs
      if (tw.copy) {
        var srcCol = tw.copy === 1000 ? bgColor() : tw.copy === 1001 ? groundColor() : channelColor(tw.copy);
        var srcRgb = rgbParts(srcCol);
        if (srcRgb) tw.to = applyChannelHsv(srcRgb, tw.hsv || null);
      }
      LEVEL.palette[tw.ch] = rgbStr({ r: tw.from.r + (tw.to.r - tw.from.r) * f, g: tw.from.g + (tw.to.g - tw.from.g) * f, b: tw.from.b + (tw.to.b - tw.from.b) * f });
      CHANNEL_ALPHA[tw.ch] = tw.opFrom + (tw.opTo - tw.opFrom) * f;
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
      var sweep = triggerSweep || { from: p.x, to: p.x, y: p.y, dir: p.dirSign || 1 };
      if (t.p.touch) {
        if (sweep.to >= t.x0 - C.HALF && sweep.to <= t.x1 + C.HALF && sweep.y >= t.y0 - C.HALF && sweep.y <= t.y1 + C.HALF) {
          colTrigFired[i] = true; applyColourNow(t);
        }
      } else {
        var crossed = sweep.dir < 0
          ? (sweep.from > t.x && sweep.to <= t.x)
          : (sweep.from < t.x && sweep.to >= t.x);
        if (crossed) { colTrigFired[i] = true; applyColourNow(t); }
      }
    }
    tickColourTweens(timeWarp);
  }

  function advanceFrame() {
    if (status !== 'play') return;
    frameNo += timeWarp;
    if (p) {
      var fromX = lastTriggerX === null ? p.x : lastTriggerX;
      // Positional triggers are crossed along the actual world-X displacement. dirSign is only the intended horizontal travel direction; rotate-gameplay can move the player in a different world axis while gravity/collisions still change X. Using dirSign here drops camera exits, zoom resets, and colour triggers during those transitions.
      triggerSweep = { from: fromX, to: p.x, y: p.y, dir: p.x > fromX ? 1 : (p.x < fromX ? -1 : 0) };
    } else triggerSweep = null;
    processTriggers();
    processColourTriggers();
    if (p) lastTriggerX = p.x;       // teleport triggers can relocate the player during this sweep
    if (status !== 'play') { dirty = true; return; }
    tickTweens(timeWarp); tickCamera(timeWarp); stepShaders(timeWarp / 60);
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
    // Preserve the full-frame displacement for the UFO's reference tilt calculation;
    // GameSim itself runs four substeps and its lastY is updated per substep.
    p.frameStartY = p.y;
    if (p2) p2.frameStartY = p2.y;
    var substeps = Math.max(1, Math.ceil(4 * timeWarp));
    var subSize = timeWarp / substeps;
    for (var i = 0; i < substeps; i++) {
      var pressed = pressQueued && i === 0;
      var hold = holding;
      var r1 = stepOne(p, subSize, lv, hold, pressed, end);
      var r2 = p2 ? stepOne(p2, subSize, lv, hold, pressed, end) : null;
      if (p.dead || (p2 && p2.dead)) {
        if (LEVEL.platformer && p.dead && checkpointState) { respawnAtCheckpoint(); break; }
        status = 'dead'; demoActive = false; break;
      }
      if (!LEVEL.platformer && (((p.dirSign || 1) >= 0 && p.x >= end) || ((p.dirSign || 1) < 0 && p.x <= 0))) { status = 'won'; demoActive = false; break; }
    }
    p.frameDeltaY = p.y - p.frameStartY;
    if (p2) p2.frameDeltaY = p2.y - p2.frameStartY;
    pressQueued = false;
    if (LEVEL.platformer && p && !p.dead) {
      var gravityVelocity = p.vy * (p.flip ? -1 : 1);
      var lowFall = gravityVelocity < 0 && Math.abs(gravityVelocity) <= 2;
      if (lowFall && !fallSpeedLowActive) emitGameplayEvent(76, 1);
      fallSpeedLowActive = lowFall;
    }
    updatePlayCamera(false, timeWarp);
    stepVisualAnims(FRAME_MS / 1000 * timeWarp);
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
  // ---- special channels (reference ColorManager._getBaseColor / lightBgColor) ----
  // 1005 = player primary, 1006 = player secondary, 1007 = lightened background mixed toward
  // the player colour when the bg is dark, 1009 = ground copy, 1010 = black, 1011 = white.
  // Channels 1005-1007 (and any channel with blending on) render additive in the reference.
  var CHANNEL_BLEND = {};           // colour-trigger "blending" flag per channel (sticky)
  var CHANNEL_ALPHA = {};           // colour-trigger channel opacity (applied as sprite alpha)
  function rgbParts(str) {
    var m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(str || '');
    return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
  }
  function rgbToHsvPort(c) {
    var max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b), diff = max - min, h = 0;
    if (diff !== 0) {
      if (max === c.r) h = 60 * (((c.g - c.b) / diff) % 6);
      else if (max === c.g) h = 60 * ((c.b - c.r) / diff + 2);
      else h = 60 * ((c.r - c.g) / diff + 4);
      if (h < 0) h += 360;
    }
    return { h: h, s: max === 0 ? 0 : (diff / max) * 100, v: (max / 255) * 100 };
  }
  function hsvToRgbPort(h, s, v) {
    var sat = Math.max(0, Math.min(100, s)) / 100, val = Math.max(0, Math.min(100, v)) / 100;
    var c = val * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = val - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return { r: Math.trunc((r + m) * 255), g: Math.trunc((g + m) * 255), b: Math.trunc((b + m) * 255) };
  }
  // reference applyChannelHsv: copy-channel HSV adjustments
  function applyChannelHsv(c, hsv) {
    if (!hsv) return c;
    var base = rgbToHsvPort(c);
    var h = (base.h + hsv.h) % 360; if (h < 0) h += 360;
    var s = hsv.sAdd ? base.s / 100 + hsv.s : (base.s / 100) * hsv.s;
    var v = hsv.vAdd ? base.v / 100 + hsv.v : (base.v / 100) * hsv.v;
    return hsvToRgbPort(h, s * 100, v * 100);
  }
  // reference lightBgColor: lighten the bg colour; when the bg is very dark, mix toward the
  // player colour proportionally to how far below 150 the channel sum is
  var LIGHT_BG_CACHE = { key: null, val: null };
  function lightBgColor() {
    var bgStr = bgColor(), key = bgStr;
    if (LIGHT_BG_CACHE.key === key) return LIGHT_BG_CACHE.val;
    var bg = rgbParts(bgStr) || { r: 255, g: 255, b: 255 };
    var p1 = rgbParts(ICON_MAIN) || { r: 255, g: 255, b: 255 };
    var max = Math.max(bg.r, bg.g, bg.b) / 255, min = Math.min(bg.r, bg.g, bg.b) / 255;
    var base = rgbToHsvPort(bg);
    var sat = Math.max(0.0001, Math.min(1, (max === 0 ? 0 : (max - min) / max) - 0.2));
    var val = Math.max(0.0001, Math.min(1, max + 0.2));
    var c = val * sat, h = base.h, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = val - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    var target = { r: Math.trunc((r + m) * 255), g: Math.trunc((g + m) * 255), b: Math.trunc((b + m) * 255) };
    var out;
    var sum = bg.r + bg.g + bg.b;
    if (sum >= 150) out = target;
    else {
      var f = sum / 150;
      out = {
        r: Math.trunc(Math.max(0, Math.min(255, (1 - f) * p1.r + f * target.r))),
        g: Math.trunc(Math.max(0, Math.min(255, (1 - f) * p1.g + f * target.g))),
        b: Math.trunc(Math.max(0, Math.min(255, (1 - f) * p1.b + f * target.b)))
      };
    }
    LIGHT_BG_CACHE.key = key; LIGHT_BG_CACHE.val = 'rgb(' + out.r + ',' + out.g + ',' + out.b + ')';
    return LIGHT_BG_CACHE.val;
  }
  // resolve any channel to a css colour, reference ColorManager._getBaseColor order:
  // explicit palette value first, then the special channels, then white.
  function channelColor(ch) {
    var pal = LEVEL.palette;
    if (MONO || !pal || !ch || ch < 0) return null;
    if (pal[ch]) return pal[ch];
    if (ch === 1005) return ICON_MAIN;         // player primary (reference: mainColor)
    if (ch === 1006) return ICON_SEC;          // player secondary (reference: secondaryColor)
    if (ch === 1007) return lightBgColor();    // light bg (reference: lightBgColor(bg, p1))
    if (ch === 1009) return groundColor();     // ground copy
    if (ch === 1010) return '#000000';         // black channel when unset
    if (ch === 1011) return '#ffffff';         // white channel when unset
    if (ch === 1) return ICON_MAIN;            // reference _getBaseColor(1) = mainColor
    if (ch === 2) return ICON_SEC;             // reference _getBaseColor(2) = secondaryColor
    return '#ffffff';                          // unset channels default white
  }
  function channelAlphaOf(ch) {
    if (!ch || ch < 0) return 1;
    var a = CHANNEL_ALPHA[ch];
    return a === undefined ? 1 : a;
  }
  function chanColor(o) {
    if (MONO || !LEVEL.palette) return null;
    var ch = o.col || defChannel(o.id);
    if (!ch || ch === 1000 || ch === 1001) return null;   // bg / ground come from their own header channels
    return channelColor(ch);
  }
  // reference registerColor: channels 1005-1007, blending-flagged channels and the legacy
  // 1002 line channel render additive
  function chanAdditive(o) {
    var ch = o.col || defChannel(o.id);
    if (isAdditive(o.id)) return true;
    if (!ch || !canColor(o.id)) return false;
    if (ch >= 1005 && ch <= 1007) return true;
    if (LEVEL.legacyColor && ch === 1002) return true;
    return !!(CHANNEL_BLEND[ch] || (LEVEL.blendHeader && LEVEL.blendHeader[ch]));
  }
  // background and ground come from their own header channels (1000, 1001), never from object channels.
  // Unset channels use the reference ColorManager defaults: bg rgb(0,102,255), ground rgb(0,68,170)
  function bgColor() { return MONO || !LEVEL.palette ? '#fff' : (LEVEL.palette[1000] || 'rgb(0,102,255)'); }
  function groundColor() { return MONO || !LEVEL.palette ? '#000' : (LEVEL.palette[1001] || 'rgb(0,68,170)'); }

  // ---- background / ground textures (reference game-scene _bg tileSprite + _buildGround) ----
  // texture key kA6 -> file game_bg_<kA6 + 1>_001-hd.png ; kA7 -> groundSquare_0<kA7>_001.png
  var TEX_IMG = {}, TEX_OK = {};
  // Bounded LRU for derived canvases (tint / flip / grey). Lookup is one property read: each entry carries a
  // use stamp. Over budget, the least recently used entries are dropped in one pass down to 75% of the budget,
  // so eviction is rare. The budget is sized for phones (derived canvases are the main memory cost there).
  var CANVAS_CACHE_BYTES = 24 * 1024 * 1024;
  var canvasCache = { map: {}, bytes: 0, sizes: {}, uses: {}, count: 0, stamp: 0 };
  function cacheGet(key) {
    var c = canvasCache.map[key];
    if (c === undefined) return undefined;
    canvasCache.uses[key] = ++canvasCache.stamp;
    return c;
  }
  function cachePut(key, canvas) {
    var cc = canvasCache;
    var bytes = (canvas.width || 0) * (canvas.height || 0) * 4;
    if (cc.map[key] !== undefined) cc.bytes -= cc.sizes[key] || 0;
    else cc.count++;
    cc.map[key] = canvas; cc.sizes[key] = bytes; cc.uses[key] = ++cc.stamp; cc.bytes += bytes;
    if (cc.bytes > CANVAS_CACHE_BYTES) cacheTrim(key);
    return canvas;
  }
  function cacheTrim(keep) {
    var cc = canvasCache, keys = Object.keys(cc.uses), i = 0;
    keys = keys.filter(function (k) { return k !== keep; });
    keys.sort(function (x, y) { return cc.uses[x] - cc.uses[y]; });
    var target = CANVAS_CACHE_BYTES * 0.75;
    while (cc.bytes > target && i < keys.length) {
      var old = keys[i++];
      cc.bytes -= cc.sizes[old] || 0;
      delete cc.map[old]; delete cc.sizes[old]; delete cc.uses[old]; cc.count--;
    }
  }
  function clearCanvasCache() { canvasCache = { map: {}, bytes: 0, sizes: {}, uses: {}, count: 0, stamp: 0 }; }

  // Drops every image and derived canvas that was built lazily (sprite atlases, ground/background
  // textures, tint and flip canvases, child caches) so the next frame re-requests them fresh.
  function clearAssetCaches() {
    ASSET_EPOCH++;
    SHEET_IMGS = []; SHEET_OK = [];
    TEX_IMG = {}; TEX_OK = {};
    MIRROR_CANVAS = {};
    clearCanvasCache();
    SPRITE_GREY = {}; TINTED = {};
    clearCanvasCache();
    WHITE_INK = {};
    LIGHT_BG_CACHE = { key: null, val: null };
    CHILD_ORDER_CACHE = {}; LEGACY_CHILD_CACHE = {};
    dirty = true;
    return ASSET_EPOCH;
  }
  function texImage(file) {
    if (window.RR_TIER === 'none') { TEX_IMG[file] = null; return null; }
    if (TEX_IMG[file] !== undefined) return TEX_IMG[file];
    var im = new Image();
    if (typeof Image !== 'undefined') {
      im.onload = function () { TEX_OK[file] = true; dirty = true; };
      im.onerror = function () { TEX_OK[file] = false; };
      im.src = assetUrl('assets/sprites/tex/' + file);
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
  // vertically flipped copy of a texture (the reference ceiling tiles are the ground tiles setFlipY)
  function flippedCanvas(src) {
    var key = src.__tkey || (src.__tkey = Math.random());
    var hitF = cacheGet('f:' + key); if (hitF) return hitF;
    if (!src.width) return null;
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var t = c.getContext('2d');
    t.translate(0, src.height);
    t.scale(1, -1);
    t.drawImage(src, 0, 0);
    return cachePut('f:' + key, c);
  }
  function tintedCanvas(src, col) {
    var key = (src.__tkey || (src.__tkey = Math.random())) + ':' + col;
    var hitT = cacheGet('t:' + key); if (hitT) return hitT;
    var c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    var t = c.getContext('2d');
    t.drawImage(src, 0, 0);
    t.globalCompositeOperation = 'multiply';
    t.fillStyle = col;
    t.fillRect(0, 0, c.width, c.height);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(src, 0, 0);
    return cachePut('t:' + key, c);
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
    // if the tinted copy can't be made (memory pressure), tile the plain texture so the ground never vanishes
    var t = tintedCanvas(src, col) || src;
    var pat = g.createPattern(t, 'repeat');
    if (!pat && t !== src) { t = src; pat = g.createPattern(src, 'repeat'); }
    if (!pat) { g.fillStyle = col; g.fillRect(x, y, w, h); return true; }
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

  // Reference ground (level.js _buildGround): one tile per column, its top edge on the ground line, repeated only
  // horizontally. The texture is not tiled downwards, so the band is drawn once at its own height.
  function drawTintedRow(g, src, col, x, y, w, phaseX, maxH) {
    if (!src || !col || w <= 0) return false;
    var t = tintedCanvas(src, col) || src;
    var pat = g.createPattern(t, 'repeat-x');
    if (!pat && t !== src) { t = src; pat = g.createPattern(src, 'repeat-x'); }
    if (!pat) return false;
    var a = (phaseX !== undefined ? phaseX : x) % t.width;
    var hgt = Math.min(t.height, maxH === undefined ? t.height : maxH);
    g.save();
    g.beginPath(); g.rect(x, y, w, hgt); g.clip();
    g.translate(a, y);
    g.fillStyle = pat;
    g.fillRect(x - a, 0, w, hgt);
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
    var hit = cacheGet('s:' + key); if (hit) return hit;
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
    return cachePut('s:' + key, c);
  }

  // ---- animated saws (Web Dashers game-scene.js: deltaTime * 0.003) ----
  // Only sawblade atlas frames and dropRing/gravJumpRing ring sprites are animated.
  // Blade/cogwheel decorations with similar silhouettes are static in Web Dashers.
  function sawPhase() { return ANIM_MS * 0.003; }

  // ---- reference saw spin (level.js sawObjectIds / fastSawObjectIds + game-scene update) ----
  // Saw ids spin continuously; each instance gets a random direction and ±10% speed
  // (base 0.0032 rad/ms, fast 0.0063, decorative sawblade frames ×1.15) plus a sinusoidal
  // wobble (±0.0004/0.00065) around it. Values are hashed per instance so they stay stable.
  var SAW_OBJ_IDS = { 183: 1, 184: 1, 185: 1, 186: 1, 187: 1, 188: 1, 397: 1, 398: 1, 399: 1, 678: 1, 679: 1, 680: 1, 740: 1, 741: 1, 742: 1, 1619: 1, 1620: 1, 1708: 1, 1709: 1, 1710: 1, 1734: 1, 1735: 1, 1736: 1, 85: 1, 86: 1, 87: 1, 97: 1, 137: 1, 138: 1, 139: 1, 154: 1, 155: 1, 156: 1, 180: 1, 181: 1, 182: 1, 1019: 1, 1020: 1, 1021: 1, 1058: 1, 1059: 1, 1060: 1, 1061: 1, 1752: 1, 396: 1, 395: 1, 222: 1, 223: 1, 224: 1, 997: 1, 998: 1, 999: 1, 1000: 1, 1055: 1, 1056: 1, 1057: 1, 394: 1, 375: 1, 376: 1, 377: 1, 378: 1, 677: 1, 676: 1, 675: 1 };
  var SAW_FAST_IDS = { 186: 1, 187: 1, 188: 1, 89: 1, 88: 1, 98: 1, 183: 1, 185: 1, 184: 1, 397: 1, 398: 1, 399: 1, 678: 1, 679: 1, 680: 1, 740: 1, 741: 1, 742: 1, 1619: 1, 1620: 1, 1705: 1, 1706: 1, 1707: 1, 1708: 1, 1709: 1, 1710: 1, 1734: 1, 1735: 1, 1736: 1 };
  function sawHash(o) {
    var h = (o.id | 0) * 374761393 + ((o.gx * 30) | 0) * 668265263 + ((o.gy * 30) | 0) * 2246822519;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;    // 0..1
  }
  function sawSpinPhase(o, frameName) {
    var fast = SAW_FAST_IDS[o.id] === 1;
    var deco = frameName && frameName.indexOf('sawblade') >= 0;
    var base = (fast ? 0.0063 : 0.0032) * (deco ? 1.15 : 1);
    var r1 = sawHash(o);                              // speed sign + variation
    var r2 = sawHash({ id: o.id + 7, gx: o.gy, gy: o.gx });   // wobble phase
    var speed = (r1 < 0.5 ? -1 : 1) * (base * (0.9 + 0.2 * ((r1 * 7919) % 1)));
    var wobble = deco ? (fast ? 0.00075 : 0.00045) : (fast ? 0.00065 : 0.0004);
    var phase = r2 * Math.PI * 2;
    var t = ANIM_MS;                                  // elapsed ms
    // rotation(t) = ∫ (speed + wobble·sin(t/1000 + φ)) dt   (reference per-frame update)
    return speed * t - wobble * 1000 * (Math.cos(t / 1000 + phase) - Math.cos(phase));
  }

  // ---- atlas sprites (ZainojdafMod / Web Dashers art). Sheets load once; frames are cut from them ----
  var SPRITE_UNIT = 0.5;                     // world units per atlas pixel (the hd atlases used here)
  var SHEET_IMGS = [];
  // bumped by clearAssetCaches(): images requested after a clear get a ?r= query so the browser's
  // HTTP cache can't hand back the old atlas. Normal loading (epoch 0) uses the plain paths.
  var ASSET_EPOCH = 0;
  function assetUrl(path) { return ASSET_EPOCH ? path + '?r=' + ASSET_EPOCH : path; }
  function sheetImage(si) {
    if (window.RR_TIER === 'none') return null;          // no assets: callers use their shape fallback
    if (!SHEET_IMGS[si]) {
      var im = new Image();
      im.onload = function () { dirty = true; clearCanvasCache(); };  // drop tint canvases made before this atlas was ready
      // data URIs keep the canvas untainted on file:// (same-origin), which getImageData needs
      if (typeof SPRITE_SHEET_DATA !== 'undefined' && SPRITE_SHEET_DATA[si]) {
        im.src = SPRITE_SHEET_DATA[si];
        SPRITE_SHEET_DATA[si] = null;        // the Image owns its src copy now; free the string
      } else {
        im.src = assetUrl(SPRITE_SHEETS[si]);
      }
      SHEET_IMGS[si] = im;
    }
    return SHEET_IMGS[si].complete && SHEET_IMGS[si].naturalWidth > 0 ? SHEET_IMGS[si] : null;
  }
  // channel tint, the same as Phaser's setTint used by Web Dashers: multiply, then keep the frame's alpha
  function frameTint(name, f, col) {
    var key = name + '|' + col;
    var hitFT = cacheGet('ft:' + key); if (hitFT) return hitFT;
    var img = SHEET_IMGS[f[0]];
    // the sheet may still be decoding: tinting an empty image would produce (and cache) a
    // fully transparent canvas (destination-in with an empty source clears everything), so
    // bail out until the atlas has loaded — the caller falls back to the untinted frame
    if (!img || !img.complete || !img.naturalWidth || !f[3] || !f[4]) return null;
    var c = document.createElement('canvas');
    c.width = f[3]; c.height = f[4];
    var t = c.getContext('2d');
    t.drawImage(img, f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
    t.globalCompositeOperation = 'multiply'; t.fillStyle = col; t.fillRect(0, 0, f[3], f[4]);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(img, f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
    return cachePut('ft:' + key, c);
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
  function drawAtlasCrop(g, f, src, x, y, sx, sy) {
    var fsc = f[10] || 1;   // SD-tier sheets: source pixels are half the logical (HD) size
    var fsy = f[11] || fsc; // vertical scale (SD frames whose aspect differs from High by rounding)
    var fsy = f[11] || fsc;
    if (src) g.drawImage(src, 0, 0, f[3], f[4], x, y, f[3] * fsc * sx, f[4] * fsy * sy);
    else g.drawImage(SHEET_IMGS[f[0]], f[1], f[2], f[3], f[4], x, y, f[3] * fsc * sx, f[4] * fsy * sy);
  }

  // A packed atlas frame is often only the trimmed visible portion of a larger sprite.
  // Web Dashers keeps the original sprite origin at the level object's x/y and applies
  // the frame's spriteSourceSize offset before rotation. Rotate around that authored
  // origin, NOT around the trimmed rectangle's centre (Hexagon Force decorations rely on this).
  function framePlacement(f, kx, ky, unit) {
    // centre of the trimmed frame relative to the untrimmed source centre (both axes, same convention),
    // so front and back halves of a portal land on the same oval
    var fsc = f[10] || 1;
    var lw = f[3] * fsc, lh = f[4] * (f[11] || fsc); // logical (HD-unit) size; source pixels may be smaller
    var sw = f[7] || lw, sh = f[8] || lh;
    var tx = f[5] || 0, ty = f[6] || 0;
    return {
      x: (tx + lw / 2 - sw / 2) * unit * kx,
      y: (ty + lh / 2 - sh / 2) * unit * ky,
      w: lw * unit * kx,
      h: lh * unit * ky
    };
  }

  // draws an object from its atlas frame: centred on the object, rotated about that centre (clockwise, as GD),
  // flipped if the level says so, and added to the background for additive objects (Web Dashers' blend)
  // child parts of multi-part objects (reference level.js children): each offset is in the object's own space,
  // so it is drawn inside the object's flip and rotation transform, centred on the child position
  function objectMeta(id) {
    return typeof OBJ_META !== 'undefined' && OBJ_META[id] ? OBJ_META[id] : {};
  }
  function frameForObject(o) {
    var meta = objectMeta(o.id);
    if (meta.animFrames && meta.animFrames.length) {
      return meta.animFrames[Math.floor(ANIM_MS / (meta.animInterval || 100)) % meta.animFrames.length];
    }
    if (meta.randomFrames && meta.randomFrames.length) {
      var seed = Math.abs(Math.round((o.gx || 0) * 73 + (o.gy || 0) * 131 + o.id * 7));
      return meta.randomFrames[seed % meta.randomFrames.length];
    }
    return frameOf(o.id);
  }

  var CHILD_ORDER_CACHE = {}, LEGACY_CHILD_CACHE = {};
  function drawChildParts(g, kids, kx, ky, col, o, front, pulseTint, parentGlowFrame) {
    // Child definitions are immutable per object ID. Sort them once, not twice per
    // instance per frame (late levels can contain 10k+ child-bearing instances).
    var cacheKey = String(o.id), ordered = CHILD_ORDER_CACHE[cacheKey];
    if (!ordered) {
      ordered = kids.slice().sort(function (a, b) { return (Number(a[5]) || 0) - (Number(b[5]) || 0); });
      CHILD_ORDER_CACHE[cacheKey] = ordered;
    }
    // Web Dashers children have their own tint, blend mode and z offset. Negative-z
    // children sit behind the parent; zero/positive-z children sit in front.
    for (var i = 0; i < ordered.length; i++) {
      var k = ordered[i], cf = FRAMES[k[0]];
      if (!cf || !cf[3] || !cf[4] || cf[9] || !sheetImage(cf[0]) || ((k[5] >= 0) !== !!front)) continue;
      if (k[6] && window.enablePortalGuide === false) continue;
      if (k[7] && window.enableOrbGuide === false) continue;
      var sx = SPRITE_UNIT * kx, sy = SPRITE_UNIT * ky;
      var cp = framePlacement(cf, kx, ky, SPRITE_UNIT);
      var cw = cp.w, ch = cp.h;
      var childName = k[0];
      var childSaw = childName.indexOf('sawblade') >= 0;
      var childRing = childName.indexOf('dropRing') >= 0 || childName.indexOf('gravJumpRing') >= 0;
      var childSpin = (childSaw || childRing) ? sawPhase() : 0;
      // child colour: channel mode 0 = parent base channel, 1 = object detail channel,
      // >1 = explicit channel (reference registerColor child resolution); literal child
      // tints are only a fallback when no channel colour applies
      // reference childVisualDef/blackDefault: a child whose literal tint is 0 (black) keeps
      // that black even while the group pulses
      var childTint = k[3] === 0 ? '#000000' : (pulseTint || null);
      if (!childTint) {
        var chMode = k.length > 11 ? k[11] : 0;
        var childCol = null;
        if (canColor(o.id)) {
          if (chMode === 1) childCol = channelColor(o.col2 || objectMeta(o.id).detailChannel || 2);
          else if (chMode > 1) childCol = channelColor(chMode);
          else childCol = col;
        }
        if (childCol) childTint = childCol;
        else if (k[3] !== null && k[3] !== undefined) {
          childTint = typeof k[3] === 'number' ? '#' + ('000000' + (k[3] >>> 0).toString(16)).slice(-6) : String(k[3]);
        }
      }
      if (childSaw) childTint = '#000';
      var csrc = childTint ? frameTint(k[0], cf, childTint) : null;
      // TEMP PROBE: record child draws for traced objects
      if (window.RRDebug && RRDebug._traceIds && RRDebug._traceIds.indexOf(o.id) >= 0 && g.canvas && g.canvas.id === 'game') {
        (RRDebug.__childProbe = RRDebug.__childProbe || []).push({ id: o.id, fr: k[0], tint: childTint, front: !!front, z: k[5], rot: k[9] || 0, dw: Math.round(cw), dh: Math.round(ch) });
        if (RRDebug.__childProbe.length > 200) RRDebug.__childProbe.length = 200;
      }
      g.save();
      var objectScale = o.scale !== undefined && isFinite(o.scale) && o.scale > 0 ? o.scale : 1;
      // reference v2.0 level.js: localDx/localDy are multiplied by the parent's scale BEFORE
      // the rotation transform, i.e. child offsets scale WITH the object. The canvas transform
      // here already carries the parent scale, so translate in unscaled local units.
      g.translate(k[1] * kx, k[2] * ky);
      if (k[4]) g.globalCompositeOperation = 'lighter';
      if (k[8]) { g.globalAlpha *= 0.9; g.scale(0.1 / objectScale, 0.1 / objectScale); }
      // reference Phaser Image: the trimmed-frame offset lives in the sprite's LOCAL space,
      // so it rotates with the child's own rotation (setAngle applies around the anchor,
      // then the cutout sits at spriteSourceSize within the sourceSize box). Rotating the
      // child BEFORE translating by the placement offset reproduces that order; the old
      // translate-then-rotate left every rotated child stuck at the unrotated offset,
      // collapsing 4-blade saws into one corner of their box (HF gear corruption).
      if (childSpin) g.rotate(childSpin);
      if (k.length > 9 && k[9]) g.rotate(k[9] * Math.PI / 180);   // reference childDef.rot
      g.translate(cp.x, cp.y);
      // reference child glow: children whose def (or whose parent's def) carries glow get
      // an additive glow sprite behind them at 0.425 alpha, tinted like the child
      var glowName = k.length > 10 ? k[10] : null;
      if (!glowName && parentGlowFrame && /\.png$/.test(childName)) {
        var derived = childName.replace('_001.png', '_glow_001.png');
        if (derived !== childName && FRAMES[derived]) glowName = derived;
      }
      if (glowName && FRAMES[glowName] && FRAMES[glowName][3] && FRAMES[glowName][4] && !FRAMES[glowName][9] && sheetImage(FRAMES[glowName][0])) {
        var cgf = FRAMES[glowName];
        var cgp = framePlacement(cgf, kx, ky, SPRITE_UNIT);
        // reference _addGlowSprite: the child glow uses the child def's literal tint when it
        // carries one (e.g. the green blade child glows), otherwise the resolved child colour
        var glowTint = childTint;
        if (k[3] !== null && k[3] !== undefined) {
          glowTint = typeof k[3] === 'number' ? '#' + ('000000' + (k[3] >>> 0).toString(16)).slice(-6) : String(k[3]);
        }
        var cgsrc = glowTint ? frameTint(glowName, cgf, glowTint) : null;
        var cga = g.globalAlpha, cgco = g.globalCompositeOperation;
        g.globalAlpha = cga * 0.425;
        g.globalCompositeOperation = 'lighter';
        if (cgsrc) g.drawImage(cgsrc, 0, 0, cgf[3], cgf[4], -cgp.w / 2, -cgp.h / 2, cgp.w, cgp.h);
        else g.drawImage(SHEET_IMGS[cgf[0]], cgf[1], cgf[2], cgf[3], cgf[4], -cgp.w / 2, -cgp.h / 2, cgp.w, cgp.h);
        g.globalAlpha = cga;
        g.globalCompositeOperation = cgco;
      }
      drawAtlasCrop(g, cf, csrc, -cw / 2, -ch / 2, sx, sy);
      if (childSaw) {
        g.rotate(Math.PI);
        drawAtlasCrop(g, cf, csrc, -cw / 2, -ch / 2, sx, sy);
      }
      g.restore();
    }
  }

  function drawSpriteObj(g, toS, o, x0, y1, alpha, rotationExtra, pulseTint) {
    // object scale (level keys sx / sy). drawWorld has already scaled the box about its centre, so the
    // centre is recovered from the scaled box and the sprite (and its children) take the scale.
    var osx = o.sx || 1, osy = o.sy || 1;
    if (MONO) return false;
    var kind = kindFast(o);
    var name = frameForObject(o);
    var kidList = typeof OBJ_CHILDREN !== 'undefined' ? OBJ_CHILDREN[o.id] : null;
    // reference v2.0: objects whose main frame is "none"/"emptyFrame" (or whose frame is not
    // in the atlas, e.g. the "noen" typo) render through their children only — no fallback box
    if ((!name || !FRAMES[name] || !FRAMES[name][3] || !FRAMES[name][4]) && kidList && kidList.length) {
      var fp0 = footFast(o);
      var ccx = x0 + fp0.w * CELL * osx / 2, ccy = y1 - fp0.h * CELL * osy / 2;
      var C0 = toS(ccx, ccy), O0 = toS(ccx + 1, ccy + 1);
      var kx0 = Math.abs(O0.x - C0.x) * osx, ky0 = Math.abs(O0.y - C0.y) * osy;
      var col0 = pulseTint || chanColor(o);
      var ga0 = g.globalAlpha, gco0 = g.globalCompositeOperation;
      // reference _mirrorTransformObjects: objects fade out toward the screen edges mid-flip
      var mirP0 = mirrorProgress();
      if (mirP0 > 0 && mirP0 < 1) {
        var fade0 = Math.min(1, Math.min(C0.x, CW - C0.x) / 140);
        if (fade0 <= 0) return true;
        if (fade0 < 1) alpha = (alpha || 1) * fade0;
      }
      var mFlip0 = mirP0 >= 0.5 ? -1 : 1;
      g.save();
      g.globalAlpha = ga0 * (alpha || 1);
      if (chanAdditive(o)) g.globalCompositeOperation = 'lighter';
      g.translate(C0.x, C0.y);
      if (o.rot || rotationExtra) g.rotate(mFlip0 * ((o.rot || 0) * Math.PI / 180 + (rotationExtra || 0)));
      if ((o.flipX ? -1 : 1) * mFlip0 < 0) g.scale(-1, 1);
      if (o.flipY) g.scale(1, -1);
      if (o.scale !== undefined && isFinite(o.scale) && o.scale > 0 && o.scale !== 1) g.scale(o.scale, o.scale);
      drawChildParts(g, kidList, kx0, ky0, col0, o, false, pulseTint, false);
      drawChildParts(g, kidList, kx0, ky0, col0, o, true, pulseTint, false);
      g.restore();
      g.globalAlpha = ga0; g.globalCompositeOperation = gco0;
      return true;
    }
    if (!name || !FRAMES[name] || !FRAMES[name][3] || !FRAMES[name][4]) return false;
    var f = FRAMES[name];
    if (f[9] || !sheetImage(f[0])) return false;     // rotated atlas frames and unloaded sheets use the fallback
    var u = SPRITE_UNIT;
    var fp = footFast(o);
    var cx = x0 + fp.w * CELL * osx / 2, cy = y1 - fp.h * CELL * osy / 2;      // object centre, world units
    // The level object's x/y is the authored sprite origin. Preserve the trimmed
    // atlas frame's source-size offset in that local coordinate space before rotation.
    var C = toS(cx, cy), O = toS(cx + 1, cy + 1), Z = toS(cx, cy);
    var kx = Math.abs(O.x - Z.x) * osx, ky = Math.abs(O.y - Z.y) * osy;          // screen px per world unit (scaled by sx / sy)
    // reference _mirrorTransformObjects: fade toward the screen edges while the flip animates
    var mirP = mirrorProgress();
    if (mirP > 0 && mirP < 1) {
      var fade = Math.min(1, Math.min(C.x, CW - C.x) / 140);
      if (fade <= 0) return true;
      if (fade < 1) alpha = (alpha || 1) * fade;
    }
    var place = framePlacement(f, kx, ky, u);
    var dw = place.w, dh = place.h;
    var col = pulseTint || chanColor(o);
    var kids = typeof blackChildren === 'function' ? blackChildren(o.id) : null;
    var black = typeof isBlackObj === 'function' && isBlackObj(o.id);
    // sawblade handling (reference level.js): frames containing "sawblade" tint black and
    // gain a mirrored twin at rotation + PI. Continuous spin is driven by the reference
    // sawObjectIds set (blades, cogwheels, spikewheels, rotating balls, ...) plus the
    // sawblade-named decorative frames and dropRing/gravJumpRing orbs.
    var isSawFrame = name.indexOf('sawblade') >= 0;
    var isRing = kind === 'orb' && (name.indexOf('dropRing') >= 0 || name.indexOf('gravJumpRing') >= 0);
    var isSawObj = SAW_OBJ_IDS[o.id] === 1;
    var spin = (isSawObj || isSawFrame || isRing) ? sawSpinPhase(o, name) : 0;
    var meta = objectMeta(o.id);
    var overlayName = (kind === 'solid' || kind === 'hazard') ? name.replace('_001.png', '_2_001.png') : '';
    var overlayFrame = overlayName && overlayName !== name ? FRAMES[overlayName] : null;
    var overlayChannel = o.col2 || meta.detailChannel || 2;
    if (overlayChannel <= 0) overlayChannel = 2;
    var overlayColor = pulseTint || (canColor(o.id) ? channelColor(overlayChannel) : null);
    if (black && !canColor(o.id)) { overlayColor = null; }
    var src = null, tintCol = null, glowOff = false;
    // reference _applyChannelTint: a black-default object that cannot be coloured stays BLACK no
    // matter what (the pulse tint must not repaint it either). Colourable black objects stay
    // black until their channel actually carries a colour.
    if (black && (!canColor(o.id) || !o.col)) { src = frameTint(name, f, '#000'); glowOff = true; }
    else if (pulseTint) { src = frameTint(name, f, pulseTint); tintCol = pulseTint; }
    else if (isSawFrame) { src = frameTint(name, f, '#000'); glowOff = true; }
    else if (black) { src = frameTint(name, f, '#000'); glowOff = true; }
    else if (col && canColor(o.id) && !(col === '#ffffff' && kids)) { src = frameTint(name, f, col); tintCol = col; }
    else if (typeof defTint === 'function' && defTint(o.id) && canColor(o.id)) { src = frameTint(name, f, defTint(o.id)); tintCol = defTint(o.id); }
    // NOTE: white sheet sprites stay white — the real textured background shows them exactly
    // like the reference (the old "paint white ink black" hack made additive wheels/orbs vanish)
    if (window.RRDebug && RRDebug._traceIds && RRDebug._traceIds.indexOf(o.id) >= 0) {
      (RRDebug._trace = RRDebug._trace || []).push({
        id: o.id, kind: kind, name: name, path: src === null ? 'raw' : (src === undefined ? '?' : 'tinted'), tgt: (g.canvas && g.canvas.id) || '?',
        col: col, tintCol: tintCol || null, black: !!black, glowOff: glowOff, pulse: pulseTint || null, canColor: canColor(o.id), additive: isAdditive(o.id), alpha: alpha,
        whiteInk: (kind === 'spike' || kind === 'hazard' || kind === 'decor') ? isWhiteInk(name, f) : null,
        rot: o.rot || 0, scale: o.scale || 1, flipX: !!o.flipX, flipY: !!o.flipY, gx: o.gx, gy: o.gy, Cx: Math.round(C.x), Cy: Math.round(C.y),
        srcPx: (function () { try { var d = src.getContext('2d').getImageData(Math.floor(f[3] / 2), Math.floor(f[4] / 2), 1, 1).data; return d.join(','); } catch (e) { return 'err'; } })(),
        overlay: overlayName, hasOverlay: !!overlayFrame,
        dw: Math.round(dw), dh: Math.round(dh), ox: Math.round(place.x), oy: Math.round(place.y), cx: Math.round(cx), cy: Math.round(cy)
      });
      if (RRDebug._trace.length > 400) RRDebug._trace.splice(0, 200);
    }
    var ga = g.globalAlpha, gco = g.globalCompositeOperation;
    g.save();
    g.globalAlpha = ga * (alpha || 1);
    // reference _updateInvisibleBlockOpacity: invis_/invisibleOutline_ frames fade OUT as the
    // player approaches (alpha = distance / (screenWidth / 2.5), clamped); the editor shows them
    if ((name.lastIndexOf('invis', 0) === 0 || name.lastIndexOf('invisibleOutline', 0) === 0) && g.canvas && g.canvas.id === 'game') {
      var fadeD = CW / 2.5;
      var dPx = Math.abs(2 * (cx - p.x));
      g.globalAlpha *= Math.max(0, Math.min(1, dPx / fadeD));
    }
    if (chanAdditive(o)) g.globalCompositeOperation = 'lighter';
    g.translate(C.x, C.y);
    // reference _mirrorTransformObjects: past halfway the sprite mirrors (scaleX negates, rotation negates)
    var mirFlip = mirP >= 0.5 ? -1 : 1;
    if (o.rot || spin || rotationExtra) g.rotate(mirFlip * ((o.rot || 0) * Math.PI / 180 + spin + (rotationExtra || 0)));
    if ((o.flipX ? -1 : 1) * mirFlip < 0) g.scale(-1, 1);
    if (o.flipY) g.scale(1, -1);
    if (o.scale !== undefined && isFinite(o.scale) && o.scale > 0 && o.scale !== 1) g.scale(o.scale, o.scale);
    var isRingType = typeof defType === 'function' && defType(o.id) === 'r';
    if (isRingType) g.scale(0.75, 0.75); // Web Dashers applies setScale(0.75) to every ring
    var dx = place.x - dw / 2, dy = place.y - dh / 2;
    // portals draw their back half first (Web Dashers: front frame + _back_ frame make the full oval)
    if (kind === 'portal' && name.indexOf('_front_') > 0) {
      var bname = name.replace('_front_', '_back_'), bf = FRAMES[bname];
      if (bf && bf[3] && bf[4] && !bf[9] && sheetImage(bf[0])) {
        var bp = framePlacement(bf, kx, ky, u);
        var bdw = bp.w, bdh = bp.h;
        var bdx = bp.x - bdw / 2, bdy = bp.y - bdh / 2;
        var bsrc = col && canColor(o.id) ? frameTint(bname, bf, col) : null;
        if (bsrc) g.drawImage(bsrc, 0, 0, bf[3], bf[4], bdx, bdy, bdw, bdh);
        else g.drawImage(SHEET_IMGS[bf[0]], bf[1], bf[2], bf[3], bf[4], bdx, bdy, bdw, bdh);
      }
    }
    // child parts: drawn over the parent, in the object's flipped and rotated space
    var kidList = typeof OBJ_CHILDREN !== 'undefined' ? OBJ_CHILDREN[o.id] : null;
    if (kidList && !MONO) drawChildParts(g, kidList, kx, ky, col, o, false, pulseTint, !glowOff && typeof GLOW_OF === 'object' && GLOW_OF[o.id]);
    // sawblade mirror twin drawn behind, half a turn ahead of the blade (reference sawMirror)
    // reference _addGlowSprite: objects whose def carries glow get an additive glow sprite
    // behind them at alpha 0.425, tinted like the object (black-default objects skip it)
    if (!glowOff && typeof GLOW_OF === 'object' && GLOW_OF[o.id]) {
      var gname = GLOW_OF[o.id], gf = FRAMES[gname];
      if (gf && gf[3] && gf[4] && !gf[9] && sheetImage(gf[0])) {
        var gp = framePlacement(gf, kx, ky, u);
        var gdw = gp.w, gdh = gp.h;
        var gdx = gp.x - gdw / 2, gdy = gp.y - gdh / 2;
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
    if (src) g.drawImage(src, 0, 0, f[3], f[4], dx, dy, dw, dh);
    else g.drawImage(SHEET_IMGS[f[0]], f[1], f[2], f[3], f[4], dx, dy, dw, dh);
    if (window.__PITDBG && o.id === 61) { g.save(); g.fillStyle = '#00ff00'; g.fillRect(dx, dy, dw, dh); g.restore(); }
    if (isSawFrame) {
      // Web Dashers creates a second black sawblade sprite at rotation + PI.
      g.save();
      g.rotate(Math.PI);
      if (src) g.drawImage(src, 0, 0, f[3], f[4], dx, dy, dw, dh);
      else g.drawImage(SHEET_IMGS[f[0]], f[1], f[2], f[3], f[4], dx, dy, dw, dh);
      g.restore();
    }
    // Web Dashers adds a separate _2 overlay to solid/hazard frames, using detail channel 2 by default.
    if (overlayFrame && overlayFrame[3] && overlayFrame[4] && !overlayFrame[9] && sheetImage(overlayFrame[0])) {
      var op = framePlacement(overlayFrame, kx, ky, u);
      var odw = op.w, odh = op.h, odx = op.x - odw / 2, ody = op.y - odh / 2;
      // an overlay is only ever drawn tinted: a raw overlay frame is white art, which showed up as pale boxes
      var osrc = overlayColor ? frameTint(overlayName, overlayFrame, overlayColor) : null;
      if (osrc) g.drawImage(osrc, 0, 0, overlayFrame[3], overlayFrame[4], odx, ody, odw, odh);
    }
    if (kidList && !MONO) drawChildParts(g, kidList, kx, ky, col, o, true, pulseTint, !glowOff && typeof GLOW_OF === 'object' && GLOW_OF[o.id]);
    // tint-0 child frames are already represented by OBJ_CHILDREN in current Web Dashers data;
    // retain only any legacy entries that are not present in the child list.
    if (kids) {
      var kidCol = pulseTint || channelColor(o.col2 || 2) || '#000';   // detail channel (key 22); default black
      var legacyKey = String(o.id), legacyKids = LEGACY_CHILD_CACHE[legacyKey];
      if (!legacyKids) {
        legacyKids = [];
        for (var lk = 0; lk < kids.length; lk++) {
          var present = false;
          if (kidList) for (var li = 0; li < kidList.length; li++) if (kidList[li][0] === kids[lk]) { present = true; break; }
          if (!present) legacyKids.push(kids[lk]);
        }
        LEGACY_CHILD_CACHE[legacyKey] = legacyKids;
      }
      for (var kk = 0; kk < legacyKids.length; kk++) {
        var kf = FRAMES[legacyKids[kk]];
        if (!kf || !kf[3] || !kf[4] || kf[9] || !sheetImage(kf[0])) continue;
        var kp = framePlacement(kf, kx, ky, u);
        var kdw = kp.w, kdh = kp.h;
        var kdx = kp.x - kdw / 2, kdy = kp.y - kdh / 2;
        g.drawImage(frameTint(legacyKids[kk], kf, kidCol), 0, 0, kf[3], kf[4], kdx, kdy, kdw, kdh);
      }
    }
    g.restore();
    g.globalAlpha = ga; g.globalCompositeOperation = gco;
    return true;
  }

  // one decoration sprite: the sheet frame placed by its trimmed box (sheet px = 2x level units)
  function drawDecor(g, toS, o, x0, y0, rotationExtra, pulseTint) {
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
    var cx = dx + dw / 2, cy = dy + dh / 2;
    var scale = o.scale !== undefined && isFinite(o.scale) && o.scale > 0 ? o.scale : 1;
    var tint = pulseTint ? tintedSprite(A, pulseTint) : (canColor(o.id) ? tintedSprite(A, chanColor(o)) : null);
    g.save();
    // Transform around the sprite centre. Applying flipX and flipY as independent
    // translations used to break when both were set, and rotation was ignored here.
    g.translate(cx, cy);
    var dMir = mirrorProgress() >= 0.5 ? -1 : 1;
    if (o.rot || rotationExtra) g.rotate(dMir * ((o.rot || 0) * Math.PI / 180 + (rotationExtra || 0)));
    g.scale((o.flipX ? -1 : 1) * dMir * scale, (o.flipY ? -1 : 1) * scale);
    if (tint) g.drawImage(tint, 0, 0, A[3], A[4], -dw / 2, -dh / 2, dw, dh);
    else g.drawImage(SHEET_IMG[A[0]], A[1], A[2], A[3], A[4], -dw / 2, -dh / 2, dw, dh);
    g.restore();
  }

  // GD 2.2 text object (914): the k31 string centred on the object, tinted via its colour channel
  function drawTextObj(g, toS, o, rotationExtra, pulseTint) {
    var fp = footFast(o);
    var cx = o.gx * 30 + fp.w * 30 / 2, cy = o.gy * 30 + fp.h * 30 / 2;
    var size = Math.max(6, Math.round(18 * (o.scale || 1)));
    var C = toS(cx, cy);
    var O = toS(cx + 1, cy + 1), Z = toS(cx, cy);
    var k = Math.abs(O.x - Z.x);                    // screen px per world unit
    var col = pulseTint || chanColor(o) || '#ffffff';
    g.save();
    g.translate(C.x, C.y);
    var tMir = mirrorProgress() >= 0.5 ? -1 : 1;
    if (o.rot || rotationExtra) g.rotate(tMir * ((o.rot || 0) * Math.PI / 180 + (rotationExtra || 0)));
    if (o.flipX || o.flipY || tMir < 0) g.scale((o.flipX ? -1 : 1) * tMir, o.flipY ? -1 : 1);
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

  var PLAY_HIDDEN = { 1755: true };
  function drawWorld(g, toS, s, live) {
    var gz = toS(0, 0);
    // reference updateGroundTiles: the ground pattern is world-locked and only SHIFTED by
    // 2*mirrorP*cameraDelta during a mirror flip — it is not reflected with the level containers
    var groundX = live ? (CENTER_X - 2 * p.x + groundShiftPx) : toS(0, 0).x;
    var objs = live ? visibleObjs(p.x) : allRenderOrder();
    for (var oi = 0; oi < objs.length; oi++) {
      var o = objs[oi];
      if (o.broken) continue;
      var kind = kindFast(o);
      if (kind === 'trigger' || kind === 'fx' || kind === 'forceBlock') continue;
      if (live && o.hidden) continue;          // reference key 135: the sprite is hidden during play
      if (live && PLAY_HIDDEN[o.id]) continue;      // reference: editor-only dblock sprites are hidden during play
      var inf = live ? (o.groups ? groupInfo(o.groups) : DEFAULT_INF) : null;
      if (inf && inf.hidden) continue;
      // reference _applyChannelAlpha: channel opacity applies as sprite alpha
      g.globalAlpha = (inf ? inf.alpha : 1) * (live && canColor(o.id) ? channelAlphaOf(o.col || defChannel(o.id)) : 1);
      var fp = footFast(o);
      var x0 = o.gx * CELL + (inf ? inf.dx : 0), y0 = o.gy * CELL + (inf ? inf.dy : 0), x1 = x0 + fp.w * CELL, y1 = y0 + fp.h * CELL;
      if (o.sx || o.sy) {
        var scCx = (x0 + x1) / 2, scCy = (y0 + y1) / 2;
        var scHw = (x1 - x0) / 2 * (o.sx || 1), scHh = (y1 - y0) / 2 * (o.sy || 1);
        x0 = scCx - scHw; x1 = scCx + scHw; y0 = scCy - scHh; y1 = scCy + scHh;
      }
      var rotationExtra = inf && (!inf.centerGroup || inf.pivot) && (!inf.centerGroup || !inf.lockRotation) ? inf.rotation : 0;
      if (inf && inf.rotation && inf.centerGroup > 0 && inf.pivot) {
        var ocx = x0 + fp.w * CELL / 2, ocy = y0 + fp.h * CELL / 2;
        var pivotX = inf.pivot.x, pivotY = inf.pivot.y;
        var odx = ocx - pivotX, ody = ocy - pivotY;
        var orc = Math.cos(inf.rotation), ors = -Math.sin(inf.rotation); // world y-up; positive GD rotation is clockwise on screen
        var ncx = pivotX + odx * orc - ody * ors, ncy = pivotY + odx * ors + ody * orc;
        x0 += ncx - ocx; x1 += ncx - ocx; y0 += ncy - ocy; y1 += ncy - ocy;
      }
      var pulseTint = inf ? inf.pulseTint : null;
      // cheap horizontal cull before any allocation (the play view maps x as CENTER_X + 2*(x - p.x))
      if (live && !sidewaysNow()) {
        var cx0 = CENTER_X + 2 * camZoom * (x0 - camWorldX - camOffX), cx1 = CENTER_X + 2 * camZoom * (x1 - camWorldX - camOffX);
        var cmp = mirrorProgress();
        if (cmp > 0) {
          // mirror-mapped positions: the reflection can pull far-side objects into view mid-flip
          cx0 += cmp * (CW - 2 * cx0); cx1 += cmp * (CW - 2 * cx1);
          if (cx1 < cx0) { var ctmp = cx0; cx0 = cx1; cx1 = ctmp; }
        }
        if (cx1 < -60 || cx0 > CW + 60) continue;
      }
      var a = toS(x0, y1), b = toS(x1, y0);
      if (b.x < -60 || a.x > CW + 60 || b.y < -60 || a.y > CH + 60) continue;
      var w = b.x - a.x, h = b.y - a.y;
      if (BEAST_KEYS[o.id]) { drawBeast(g, toS, o, x0, y1); g.globalAlpha = 1; continue; }
      if (kind === 'text') { drawTextObj(g, toS, o, rotationExtra, pulseTint); g.globalAlpha = 1; continue; }
      if (kind === 'decor') {
        if (!drawSpriteObj(g, toS, o, x0, y1, 1, rotationExtra, pulseTint)) drawDecor(g, toS, o, x0, y0, rotationExtra, pulseTint);
      } else if (kind === 'solid') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1, rotationExtra, pulseTint)) continue;
        g.fillStyle = '#000'; g.fillRect(a.x, a.y, w, h);
        g.fillStyle = pulseTint || chanColor(o) || '#fff'; g.fillRect(a.x + 2.5 * s, a.y + 2.5 * s, w - 5 * s, h - 5 * s);
      } else if (kind === 'deco') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1, rotationExtra, pulseTint)) continue;        // soliddeco sprites are fully opaque; only the fallback outline is faint
        // passable block: drawn faint with a dashed outline, no collision
        var ga = g.globalAlpha, pc = pulseTint || chanColor(o);
        g.globalAlpha = ga * 0.45; g.fillStyle = pc || '#999'; g.fillRect(a.x, a.y, w, h);
        g.globalAlpha = ga; g.strokeStyle = '#000'; g.lineWidth = 2; g.setLineDash([6, 4]);
        g.strokeRect(a.x + 1, a.y + 1, w - 2, h - 2); g.setLineDash([]);
      } else if (kind === 'hazard') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1, rotationExtra, pulseTint)) continue;
        var hzd = LevelModel.HAZ ? LevelModel.HAZ[o.id] : null;
        g.fillStyle = pulseTint || '#000';
        if (hzd && hzd.pit) g.fillRect(a.x, toS(x0, y0 + 0.5 * fp.h * CELL).y, w, a.y - toS(x0, y0 + 0.5 * fp.h * CELL).y);
        else {
          var hc = toS(x0 + fp.w * CELL / 2, y0 + fp.h * CELL / 2), hr = 0.36 * Math.min(w, h);
          g.beginPath(); g.arc(hc.x, hc.y, hr, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(hc.x, hc.y, hr * 0.35, 0, Math.PI * 2); g.fill();
        }
      } else if (kind === 'spike') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1, rotationExtra, pulseTint)) continue;
        var base = toS(x0, y0), apex = toS(x0 + CELL / 2, y0 + CELL), tip = toS(x1, y0);
        g.fillStyle = pulseTint || '#000';
        g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(apex.x, apex.y); g.lineTo(tip.x, tip.y);
        g.closePath(); g.fill();
      } else if (kind === 'slope') {
        // reference: every slope object is its sprite (decoration or physical); the black wedge is only
        // the fallback when no sprite is available
        if (drawSpriteObj(g, toS, o, x0, y1, 1, rotationExtra, pulseTint)) continue;
        var cs = slopeCorners(o, x0, x1, y0, y1).map(function (c) { return toS(c[0], c[1]); });
        g.fillStyle = '#000';
        g.beginPath(); g.moveTo(cs[0].x, cs[0].y); g.lineTo(cs[1].x, cs[1].y); g.lineTo(cs[2].x, cs[2].y);
        g.closePath(); g.fill();
      } else if (kind === 'portal' || kind === 'speed' || kind === 'exit') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1, rotationExtra, pulseTint)) continue;    // real GD portal / boost sprite
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
        if (drawSpriteObj(g, toS, o, x0, y1, 1, rotationExtra, pulseTint)) continue;
        var pt = toS(x0, y0 + C.PAD_H);
        g.fillStyle = '#000'; g.fillRect(a.x, pt.y, w, a.y - pt.y);
        g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(10 * s / 2) + 'px Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(PAD_LABEL[o.id] || '', a.x + w / 2, pt.y + (a.y - pt.y) / 2);
      } else if (kind === 'orb') {
        if (drawSpriteObj(g, toS, o, x0, y1, 1, rotationExtra, pulseTint)) continue;    // real GD orb ring sprite
        var c = toS(x0 + fp.w * CELL / 2, y0 + fp.h * CELL / 2), r = 15 * s;
        g.fillStyle = '#fff'; g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#000'; g.font = 'bold ' + Math.round(13 * s / 2) + 'px Arial, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(ORB_LABEL[o.id] || '', c.x, c.y);
      } else if (kind === 'coin') {
        var coinX = x0 + fp.w * CELL / 2, coinY = y0 + fp.h * CELL / 2;
        var cc = toS(coinX, coinY), rr = 11 * s;
        var got = coinsGot[coinX + ',' + coinY];
        if (drawSpriteObj(g, toS, o, x0, y1, got ? 0.3 : 1, rotationExtra, pulseTint)) continue;   // real GD coin sprite
        g.fillStyle = got ? '#888' : '#fff';
        g.beginPath(); g.arc(cc.x, cc.y, rr, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke();
        g.beginPath(); g.arc(cc.x, cc.y, rr * 0.5, 0, Math.PI * 2); g.stroke();
      }
    }
    // reference render order: every level object (max z depth ~13.5) is drawn BEHIND the ground
    // tiles (depth 20), so the ground and its edge line cover object art below the line — spikes
    // and pit hazards sink into the ground instead of floating on top of it.
    // reference updateGroundTiles fly branch: entering a fly mode slides the ground band down to
    // 620 - inset and drops a ceiling band in from the top to 20 + inset over 0.5 s
    // (inset = (600 - corridorSpanPx)/2: ship/ufo/wave 0, ball 60, spider 30). At rest the bands
    // coincide with the physics corridor edges because the camera locks its centre at y 320.
    var bandInset = Math.max(0, (600 - flyBand.spanPx) / 2);
    var groundTopY = gz.y, ceilBotY = null;
    if (live && flyBand.value > 0.001) {
      var targetGroundY = 620 - bandInset, targetCeilY = 20 + bandInset;
      groundTopY = gz.y + (targetGroundY - gz.y) * flyBand.value;
      if (groundTopY > gz.y) groundTopY = gz.y;   // reference clamp: never above the world line
      ceilBotY = targetCeilY * flyBand.value;
    }
    var drewGround = false;
    if (!MONO && LEVEL.groundId) {
      var gimg = texImage(groundFileOf(LEVEL));
      if (TEX_OK[groundFileOf(LEVEL)] && gimg.width) {
        // reference _buildGround: the tile's top edge sits on the ground line, world-locked (no parallax)
        drewGround = drawTintedRow(g, gimg, groundColor(), 0, groundTopY, CW, groundX, Math.max(0, CH - groundTopY));
        // reference setGround2Color: the darker inner pattern is ALWAYS drawn (channel 1009
        // copies the ground channel 1001 when unset), not only when the header carries 1009
        var g2 = texImage(ground2FileOf(LEVEL));
        var g2col = LEVEL.palette ? channelColor(1009) : null;
        if (g2col && TEX_OK[ground2FileOf(LEVEL)] && g2.width) {
          drawTintedRow(g, g2, g2col, 0, groundTopY, CW, groundX, Math.max(0, CH - groundTopY));
        }
      }
    }
    if (!drewGround) { g.fillStyle = groundColor(); g.fillRect(0, groundTopY, CW, CH - groundTopY); }
    // reference floorLine sprite: floorLine_01 stretched to the screen width, additive, top at
    // groundY - 1; the art carries its own soft alpha falloff (no extra alpha scaling)
    function drawFloorLine(yLine) {
      var prevGA = g.globalAlpha, prevGCO = g.globalCompositeOperation;
      g.globalCompositeOperation = 'lighter';
      var flf = FRAMES['floorLine_01_001.png'];
      if (flf && !flf[9] && sheetImage(flf[0])) {
        g.drawImage(SHEET_IMGS[flf[0]], flf[1], flf[2], flf[3], flf[4], 0, yLine - 1, CW, flf[4]);
      } else {
        g.globalAlpha = 0.9 * prevGA;
        g.fillStyle = '#bfbfbf';
        g.fillRect(0, yLine - 1, CW, 2);
        g.globalAlpha = prevGA;
      }
      g.globalCompositeOperation = prevGCO;
    }
    if (live && !MONO) {
      drawFloorLine(groundTopY);
      // the ceiling band hangs flipped from the top, its bottom edge animated down to
      // 20 + inset (reference updateGroundTiles rightTileIndex); needs the ground texture
      // loaded: the demo enters ship mode before the first texture arrives
      if (ceilBotY !== null && gimg && TEX_OK[groundFileOf(LEVEL)] && ceilBotY > -gimg.height && ceilBotY < CH) {
        var fimg = flippedCanvas(gimg) || gimg;
        var bandY = Math.max(0, ceilBotY - gimg.height), bandH = Math.min(ceilBotY, CH) - bandY;
        var cg = drawTintedTiled(g, fimg, groundColor(), 0, bandY, CW, bandH, groundX, ceilBotY);
        var f2g2col = LEVEL.palette ? channelColor(1009) : null;
        if (cg && f2g2col && TEX_OK[ground2FileOf(LEVEL)] && g2 && g2.width) {
          var f2 = flippedCanvas(g2) || g2;
          drawTintedTiled(g, f2, f2g2col, 0, bandY, CW, bandH, groundX, ceilBotY);
        }
        drawFloorLine(ceilBotY);
      }
    }
    g.globalAlpha = 1;
  }

  // Render-order cache and two spatial indexes. Static objects only need a small
  // viewport-sized query; grouped objects retain the original wide query window
  // because move/rotate triggers can bring distant objects into view.
  // Web Dashers default layer / order per object (levelObj.zLayer || default_z_layer); the level's own
  // keys 24 / 25 override them. Table: data/zdefaults.js (OBJ_ZDEFAULTS).
  function defZLayer(id) { var d = typeof OBJ_ZDEFAULTS !== 'undefined' ? OBJ_ZDEFAULTS[id] : null; return d ? d[0] : 0; }
  function defZOrder(id) { var d = typeof OBJ_ZDEFAULTS !== 'undefined' ? OBJ_ZDEFAULTS[id] : null; return d ? d[1] : 0; }
  var RENDER_LAYER_DEPTH = { '-5': -12, '-3': -9, '-1': -6, '0': 0, '1': 3, '3': 6, '5': 9, '7': 10.5, '9': 12, '11': 13.5 };
  function objectRenderDepth(o) {
    var isText = kindFast(o) === 'text';
    var layer = o.zLayer || (typeof defZLayer === 'function' ? defZLayer(o.id) : (isText ? 3 : 0));
    var order = o.zOrder || (typeof defZOrder === 'function' ? defZOrder(o.id) : 0);
    return (RENDER_LAYER_DEPTH[layer] !== undefined ? RENDER_LAYER_DEPTH[layer] : 0) + order * 0.01;
  }
  var OBJ_STATIC_X = [], OBJ_GROUPED_X = [], OBJ_ALL_DEPTH = [], OBJ_SORTED_SRC = null, OBJ_SORTED_LEN = -1, OBJ_SORTED_REV = -1;
  var VISIBLE_BUFFER = [];
  var GROUP_VIS_MARGIN = 1200; // retain the prior trigger-movement safety range
  var STATIC_VIS_MARGIN = 180; // enough for the widest authored static footprints
  function rebuildSortedObjs() {
    var src = LEVEL.objs;
    OBJ_STATIC_X = []; OBJ_GROUPED_X = []; OBJ_ALL_DEPTH = src.slice();
    for (var i = 0; i < src.length; i++) {
      var o = src[i];
      o._renderIndex = i;
      o._renderDepth = objectRenderDepth(o);
      o._renderKey = Math.round((o._renderDepth + 1000) * 100) * 16777216 + i;
      if (o.groups && o.groups.length) OBJ_GROUPED_X.push(o);
      else OBJ_STATIC_X.push(o);
    }
    // x indexes are independent of draw order; the cached depth key is used only
    // after collecting the small candidate set for this frame.
    OBJ_STATIC_X.sort(function (a, b) { return a.gx - b.gx || a._renderIndex - b._renderIndex; });
    OBJ_GROUPED_X.sort(function (a, b) { return a.gx - b.gx || a._renderIndex - b._renderIndex; });
    OBJ_ALL_DEPTH.sort(function (a, b) { return a._renderDepth - b._renderDepth || a._renderIndex - b._renderIndex; });
    OBJ_SORTED_SRC = src;
    OBJ_SORTED_LEN = src.length;
    OBJ_SORTED_REV = LEVEL.revision || 0;
  }
  function ensureRenderIndexes() {
    if (OBJ_SORTED_SRC !== LEVEL.objs || OBJ_SORTED_LEN !== LEVEL.objs.length || OBJ_SORTED_REV !== (LEVEL.revision || 0)) rebuildSortedObjs();
  }
  function lowerBoundGX(arr, x) {
    var a = 0, b = arr.length;
    while (a < b) { var m = (a + b) >> 1; if (arr[m].gx < x) a = m + 1; else b = m; }
    return a;
  }
  function appendGXRange(arr, lo, hi, out) {
    var i = lowerBoundGX(arr, lo);
    while (i < arr.length && arr[i].gx <= hi) out.push(arr[i++]);
  }
  // per-object kind and footprint are fixed for an object: cache them on first use (draw path)
  function kindFast(o) {
    var k = o._k;
    if (k === undefined) { k = LevelModel.kindOf(o.id); o._k = k === null ? '' : k; }
    return k === '' ? null : k;
  }
  function footFast(o) {
    var f0 = o._f;
    if (f0 === undefined) { f0 = LevelModel.footprint(o); o._f = f0; }
    return f0;
  }
  var KEY_SCRATCH = new Float64Array(2048);
  function sortByRenderKey(arr) {
    var n = arr.length, i;
    if (KEY_SCRATCH.length < n) KEY_SCRATCH = new Float64Array(n * 2);
    for (i = 0; i < n; i++) KEY_SCRATCH[i] = arr[i]._renderKey;
    var sub = KEY_SCRATCH.subarray(0, n);
    sub.sort();
    for (i = 0; i < n; i++) arr[i] = LEVEL.objs[sub[i] % 16777216];
    return arr;
  }
  function visibleObjs(playerX) {
    ensureRenderIndexes();
    VISIBLE_BUFFER.length = 0;
    // Canvas scale is 2x world units, so the visible half-width is CW/4.
    // Keep a 180-unit static overscan for large sprites/footprints. Grouped
    // objects use the historical 1200-unit window to preserve trigger behavior.
    var staticHalf = CW / 4 + STATIC_VIS_MARGIN;
    var staticLo = (playerX - staticHalf) / CELL;
    var staticHi = (playerX + staticHalf) / CELL;
    appendGXRange(OBJ_STATIC_X, staticLo, staticHi, VISIBLE_BUFFER);
    var groupLo = playerX / CELL - GROUP_VIS_MARGIN / CELL;
    var groupHi = playerX / CELL + (CW / 2 + GROUP_VIS_MARGIN) / CELL;
    appendGXRange(OBJ_GROUPED_X, groupLo, groupHi, VISIBLE_BUFFER);
    // Stable tie-break preserves source order for objects with identical depth.
    // Reusing this array avoids a fresh slice/allocation on every animation frame.
    sortByRenderKey(VISIBLE_BUFFER);
    return VISIBLE_BUFFER;
  }
  function allRenderOrder() {
    ensureRenderIndexes();
    return OBJ_ALL_DEPTH;
  }

  // ---- player icon sprites (reference player.js: base frame tinted mainColor, _2 overlay
  // tinted secondaryColor; defaults green #04FF00 / cyan #00FBFF; dual inverts the pair) ----
  var ICON_BASE = { cube: 'player_01_001.png', ship: 'ship_01_001.png', ball: 'player_ball_01_001.png',
    ufo: 'bird_01_001.png', wave: 'dart_01_001.png', robot: 'robot_01_01_001.png', spider: 'spider_01_01_001.png', swing: 'swing_01_001.png' };
  var ICON_OVER = { cube: 'player_01_2_001.png', ship: 'ship_01_2_001.png', ball: 'player_ball_01_2_001.png',
    ufo: 'bird_01_3_001.png', wave: 'dart_01_2_001.png', robot: 'robot_01_01_2_001.png', spider: 'spider_01_01_2_001.png', swing: 'swing_01_2_001.png' };
  var ICON_MAIN = '#04ff00', ICON_SEC = '#00fbff';
  function drawIconLayer(g, name, k, tint, oy) {
    var f = FRAMES[name];
    if (!f || f[9] || !sheetImage(f[0])) return false;
    // the icons atlas is 1x: one atlas pixel = one world unit (the cube frame is 60px = the
    // 30-unit hitbox box drawn at the 2px/unit play scale) — unlike the hd level sheets (0.5)
    var fsc = f[10] || 1, fsy = f[11] || fsc;
    var dw = f[3] * fsc * k, dh = f[4] * fsy * k;
    var dx = (f[5] - f[7] / 2) * k, dy = (f[6] - f[8] / 2) * k + (oy || 0);
    var tc = tint ? frameTint(name, f, tint) : null;
    if (tc) g.drawImage(tc, 0, 0, f[3], f[4], dx, dy, dw, dh);
    else g.drawImage(sheetImage(f[0]), f[1], f[2], f[3], f[4], dx, dy, dw, dh);
    return true;
  }
  // ---- robot / spider skeletons (port of Web Dashers player.js _applyRobotFrame / _applySpiderFrame) ----
  // Each pose sprite is a body part: base frame tinted main, _2 overlay tinted secondary, _extra_ untinted
  // (the eyes). Parts are placed from the descriptor position with the per-tag offsets Web Dashers uses.
  var SKEL_LAYERS = [];
  function skelVariant(tex, v) {
    if (v === 'overlay') return tex.replace(/_001\.png$/, '_2_001.png');
    if (v === 'extra') return tex.replace(/_001\.png$/, '_extra_001.png');
    return tex;
  }
  function skelFrameKey(name, pl) {
    var d = SKELETON_DATA[name], G = d.groups;
    var tm = ANIM_MS / 1000;
    var goingUp = pl.flip ? pl.vy < 0 : pl.vy > 0;
    function pick(list, fps) { return list[Math.floor(tm * fps) % list.length]; }
    function startThenLoop(start, loop, fps) {
      if (!start || !start.length) return loop ? pick(loop, fps) : null;
      var startDur = start.length / fps;
      if (tm < startDur || !loop || !loop.length) return start[Math.min(start.length - 1, Math.floor(tm * fps))];
      return loop[Math.floor((tm - startDur) * fps) % loop.length];
    }
    if (name === 'robot') {
      if (pl.dashing && G.fallLoop) return pick(G.fallLoop, 16);
      if (pl.onGround) return G.run ? pick(G.run, 16) : (G.idle1 ? pick(G.idle1, 16) : (G.idle ? pick(G.idle, 16) : null));
      return goingUp ? startThenLoop(G.jumpStart, G.jumpLoop, 15) : startThenLoop(G.fallStart, G.fallLoop, 15);
    }
    if (!pl.onGround) return G.fall ? pick(G.fall, 12) : null;
    if (G.run) return pick(G.run, 16);
    if (G.walk) return pick(G.walk, 16);
    return G.idle ? pick(G.idle, 16) : null;
  }
  function drawSkeleton(g, name, pl, k, main, sec) {
    var d = SKELETON_DATA[name];
    if (!d) return false;
    var key = skelFrameKey(name, pl);
    var sprites = key ? d.frames[key] : null;
    if (!sprites) return false;
    var isRobot = name === 'robot';
    SKEL_LAYERS.length = 0;
    for (var i = 0; i < sprites.length; i++) {
      var sp = sprites[i], tag = sp[0], tex = sp[1];
      var isLeg = isRobot ? (tag === 0 || tag === 2 || tag === 4 || tag === 6) : (tag === 0 || tag === 1 || tag === 4 || tag === 5);
      var isArm = isRobot && (tag === 1 || tag === 5);
      var yOff = tag === 3 ? 5 : (isArm ? -1 : (isLeg ? -9 : 0));
      var xs = (isLeg || isArm) ? 1.8 : 1;
      var z = sp[9] || tag;
      // Web Dashers y is up (positionYSign -1); the canvas flips for gravity in drawPlayer
      var layers = [['overlay', -0.02, sec], ['base', 0, main], ['extra', 0.08, null]];
      for (var li = 0; li < layers.length; li++) {
        SKEL_LAYERS.push({ depth: 8 + z * 0.1 + layers[li][1], order: SKEL_LAYERS.length, tex: skelVariant(tex, layers[li][0]),
          px: sp[2] * xs, py: -(sp[3] + yOff), sx: sp[4], sy: sp[5], rot: sp[6] * Math.PI / 180, fx: sp[7], fy: sp[8], tint: layers[li][2] });
      }
    }
    SKEL_LAYERS.sort(function (a, b) { return a.depth - b.depth || a.order - b.order; });
    var drew = false;
    for (var j = 0; j < SKEL_LAYERS.length; j++) {
      var L = SKEL_LAYERS[j], f = FRAMES[L.tex];
      if (!f || f[9] || !f[3] || !f[4] || !sheetImage(f[0])) continue;
      g.save();
      g.translate(L.px * k, L.py * k);
      if (L.rot) g.rotate(L.rot);
      g.scale(L.sx * (L.fx ? -1 : 1), L.sy * (L.fy ? -1 : 1));
      var fsc2 = f[10] || 1;
      var fsy2 = f[11] || fsc2;
      var dw = f[3] * fsc2 * k, dh = f[4] * fsy2 * k, dx = (f[5] - f[7] / 2) * k, dy = (f[6] - f[8] / 2) * k;
      var tc = L.tint ? frameTint(L.tex, f, L.tint) : null;
      if (tc) g.drawImage(tc, 0, 0, f[3], f[4], dx, dy, dw, dh);
      else g.drawImage(sheetImage(f[0]), f[1], f[2], f[3], f[4], dx, dy, dw, dh);
      g.restore();
      drew = true;
    }
    return drew;
  }

  // ---- beasts (Web Dashers animations.js BeastAnim): animated monster hazards ----
  // Each beast is a skeleton of parts (SKELETON_DATA.beastNN) drawn in its object space. The eye
  // (GJBeast01_03) has no pose of its own: it is drawn at its parent part's transform each frame.
  var BEAST_KEYS = { 918: 'beast01', 1327: 'beast02', 1328: 'beast03', 1584: 'beast04', 2012: 'beast05' };
  var BEAST_DETAIL_TAGS = { 1327: [0], 1328: [0], 1584: [0], 2012: [1, 2] };
  var BEAST_EYE = { 918: { frame: 'GJBeast01_03_001.png', parent: 'GJBeast01_01_001.png' } };
  var BEAST_LAYERS = [];
  // the idle cycle: the default animation first, then the others, each playing once (looped ones repeat)
  function beastFrameKey(o, d) {
    var t = ANIM_MS / 1000 + ((Math.abs(o.gx) * 37 + Math.abs(o.gy) * 91) % 101) * 0.037;   // per-object phase
    var def = d.groups[d.default];
    if (def && def.looped) return def.keys[Math.floor(t / def.delay) % def.frames];
    var names = [d.default], k;
    for (k in d.groups) if (k !== d.default) names.push(k);
    var period = 0;
    for (k = 0; k < names.length; k++) { var gg = d.groups[names[k]]; if (gg) period += gg.frames * gg.delay; }
    if (!(period > 0)) return null;
    var local = t % period;
    for (k = 0; k < names.length; k++) {
      var g2 = d.groups[names[k]]; if (!g2) continue;
      var span = g2.frames * g2.delay;
      if (local < span) return g2.keys[Math.min(g2.frames - 1, Math.floor(local / g2.delay))];
      local -= span;
    }
    return null;
  }
  function drawBeast(g, toS, o, x0, y1) {
    var d = SKELETON_DATA[BEAST_KEYS[o.id]];
    if (!d) return false;
    var key = beastFrameKey(o, d);
    var sprites = key ? d.frames[key] : null;
    if (!sprites) return false;
    var fp = footFast(o);
    var ccx = x0 + fp.w * CELL / 2, ccy = y1 - fp.h * CELL / 2;
    var C = toS(ccx, ccy), O = toS(ccx + 1, ccy + 1);
    var kx = Math.abs(O.x - C.x), ky = Math.abs(O.y - C.y);
    var kids = OBJ_CHILDREN[o.id] || [];
    var detailTags = BEAST_DETAIL_TAGS[o.id] || [];
    var eye = BEAST_EYE[o.id];
    var mainCol = chanColor(o), detailCol = channelColor(o.col2 > 0 ? o.col2 : 1011);
    BEAST_LAYERS.length = 0;
    for (var i = 0; i < sprites.length; i++) {
      var sp = sprites[i], tex = sp[1];
      var kidTint;
      for (var ki = 0; ki < kids.length; ki++) if (kids[ki][0] === tex) { kidTint = kids[ki][3]; break; }
      var detail = detailTags.indexOf(sp[0]) >= 0;
      var tint = (kidTint === 0 && !detail) ? '#000000' : (detail ? detailCol : mainCol);
      BEAST_LAYERS.push({ tex: tex, px: sp[2], py: -sp[3], sx: sp[4], sy: sp[5], rot: sp[6] * Math.PI / 180, fx: sp[7], fy: sp[8], z: sp[9], tint: tint, parent: tex });
    }
    BEAST_LAYERS.sort(function (a, b) { return a.z - b.z; });
    function layer(L, tex, tint) {
      var f = FRAMES[tex];
      if (!f || !f[3] || !f[4] || f[9] || !sheetImage(f[0])) return;
      g.save();
      g.translate(L.px * kx, L.py * ky);
      if (L.rot) g.rotate(L.rot);
      g.scale(L.sx * (L.fx ? -1 : 1), L.sy * (L.fy ? -1 : 1));
      var pl = framePlacement(f, kx, ky, SPRITE_UNIT);
      var dx = pl.x - pl.w / 2, dy = pl.y - pl.h / 2;
      var tc = tint ? frameTint(tex, f, tint) : null;
      if (tc) g.drawImage(tc, 0, 0, f[3], f[4], dx, dy, pl.w, pl.h);
      else g.drawImage(sheetImage(f[0]), f[1], f[2], f[3], f[4], dx, dy, pl.w, pl.h);
      g.restore();
    }
    g.save();
    g.translate(C.x, C.y);
    if (o.rot) g.rotate(o.rot * Math.PI / 180);
    if (o.flipX) g.scale(-1, 1);
    if (o.flipY) g.scale(1, -1);
    for (var j = 0; j < BEAST_LAYERS.length; j++) {
      var L = BEAST_LAYERS[j];
      layer(L, L.tex, L.tint);
      if (eye && L.tex === eye.parent) layer(L, eye.frame, null);   // eye rides its parent part
    }
    g.restore();
    return true;
  }

  function drawPlayer(g, toS, s, pl, invert) {
    var c = toS(pl.x, pl.y);
    var h = pl.half * s;
    var main = invert ? ICON_SEC : ICON_MAIN, sec = invert ? ICON_MAIN : ICON_SEC;
    var base = ICON_BASE[pl.mode] || ICON_BASE.cube;
    var over = ICON_OVER[pl.mode];
    if (base && FRAMES[base] && sheetImage(FRAMES[base][0])) {
      g.save();
      g.translate(c.x, c.y);
      var k = h / 30;                                  // 30 world units = 60 atlas px
      if (pl.mode === 'wave') g.translate((pl.mirrored ? 1.5 : -1.5) * s, -1 * s);
      if (pl.mode === 'ship' || pl.mode === 'ufo') {
        // Port of Web Dashers player.js syncSprites(): the vehicle is native scale,
        // while the cube nested inside it is 0.55 scale. k already includes mini scaling.
        var miniS = pl.isMini ? 0.6 : 1;
        var mir = pl.mirrored ? -1 : 1;
        var grav = pl.flip ? -1 : 1;
        var angle = pl.mode === 'ship' ? pl.rot : 0;
        var cubeOffset = pl.flip ? -30 * miniS : 10 * miniS;
        var cubeX = cubeOffset * Math.sin(angle) * mir;
        var cubeY = -cubeOffset * Math.cos(angle) + (pl.isMini ? 8 * miniS : 0) + (pl.flip ? -20 * miniS : 0);
        var vehicleX = -10 * Math.sin(angle) * mir;
        var ufoDelta = pl.frameDeltaY !== undefined ? pl.frameDeltaY : (pl.y - pl.lastY);
        var ufoTilt = Math.max(-0.05, Math.min(0.05, -ufoDelta * 0.016));
        var vehicleY = pl.mode === 'ship'
          ? 10 * Math.cos(angle) + (pl.flip ? -20 * miniS : 0)
          : 10 + (pl.flip ? -15 : 5);
        var vehicleRot = pl.mode === 'ship' ? (mir < 0 ? -angle : angle) : ufoTilt;
        var cubeRot = pl.mode === 'ship' ? (mir < 0 ? -angle : angle) : 0;
        var cubeBase = ICON_BASE.cube;
        var cubeOver = ICON_OVER.cube;
        if (pl.mode === 'ufo') vehicleRot = mir < 0 ? -ufoTilt : ufoTilt;
        function layerAt(name, tint, scale, x, y, rotation) {
          if (!name || !FRAMES[name]) return;
          g.save();
          g.translate(x, y);
          if (rotation) g.rotate(rotation);
          g.scale(mir, grav);
          drawIconLayer(g, name, scale, tint, 0);
          g.restore();
        }
        // Match Web Dashers depth order: both secondary overlays (8), then both
        // main sprites (10), then any untinted extra layer (12).
        layerAt(cubeOver, sec, k * 0.55, cubeX, cubeY, cubeRot);
        if (pl.mode === 'ship') layerAt('ship_01_2_001.png', sec, k, vehicleX, vehicleY, vehicleRot);
        else layerAt('bird_01_3_001.png', sec, k, vehicleX, vehicleY, vehicleRot);
        layerAt(cubeBase, main, k * 0.55, cubeX, cubeY, cubeRot);
        if (pl.mode === 'ship') {
          layerAt('ship_01_001.png', main, k, vehicleX, vehicleY, vehicleRot);
          layerAt('ship_01_extra_001.png', null, k, vehicleX, vehicleY, vehicleRot);
        } else {
          // Web Dashers bird_2 is the disabled glow layer; bird_3 is the overlay.
          layerAt('bird_01_001.png', main, k, vehicleX, vehicleY, vehicleRot);
          layerAt('bird_01_extra_001.png', null, k, vehicleX, vehicleY, vehicleRot);
        }
        g.restore();
        return;
      }
      if (pl.mode === 'robot' || pl.mode === 'spider') {
        // skeleton pose: its own save so a missing pose falls through to the normal icon untouched
        g.save();
        if (pl.flip) g.scale(1, -1);
        if (pl.mirrored) g.scale(-1, 1);
        var drewSkel = drawSkeleton(g, pl.mode, pl, k, main, sec);
        g.restore();
        if (drewSkel) { g.restore(); return; }
      }
      // reference syncSprites: rotation negates while mirrored
      g.rotate((pl.mode === 'cube' || pl.mode === 'ball' || pl.mode === 'wave' || pl.mode === 'swing' ? pl.rot : 0) * (pl.mirrored ? -1 : 1));
      if (pl.flip) g.scale(1, -1);
      if (pl.mirrored) g.scale(-1, 1);
      if (pl.mode === 'wave') k *= 0.94;               // reference syncSprites: fix wave size
      if (over) drawIconLayer(g, over, k, sec, 0);
      drawIconLayer(g, base, k, main, 0);
      var xb = base.replace('_001.png', '_extra_001.png');
      if (FRAMES[xb]) drawIconLayer(g, xb, k, null, 0);
      g.restore();
      return;
    }
    // vector fallback when the icon sheet has not loaded: a white body with a black border
    // (player 2 is the inverse: black body, white border, so the two stay distinguishable)
    g.save();
    g.translate(c.x, c.y);
    g.rotate(pl.mirrored ? -pl.rot : pl.rot);
    if (pl.flip) g.scale(1, -1);
    if (pl.mirrored) g.scale(-1, 1);
    var fg = invert ? '#fff' : '#000', bg = invert ? '#000' : '#fff';
    var edgeCol = fg, lw = Math.max(2, h * 0.12);
    // fill the body with the body colour, then outline the same path in the border colour
    function body(pathFn) {
      g.beginPath(); pathFn(); g.closePath();
      g.fillStyle = bg; g.fill();
      g.strokeStyle = edgeCol; g.lineWidth = lw; g.stroke();
    }
    function ellipsePath(rx, ry) { g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); }
    if (pl.mode === 'cube') {
      body(function () { g.rect(-h, -h, h * 2, h * 2); });
      g.fillStyle = fg; g.fillRect(-3, -3, 6, 6);
    } else if (pl.mode === 'ball') {
      body(function () { g.arc(0, 0, h, 0, Math.PI * 2); });
      g.strokeStyle = fg; g.lineWidth = Math.max(2, h * 0.1);
      g.beginPath(); g.moveTo(-h * 0.6, 0); g.lineTo(h * 0.6, 0); g.stroke();
    } else if (pl.mode === 'ufo') {
      body(function () { ellipsePath(h, h * 0.6); });
      g.strokeStyle = fg; g.lineWidth = Math.max(1.5, h * 0.08);
      g.beginPath(); ellipsePath(h * 0.45, h * 0.25); g.stroke();
    } else if (pl.mode === 'ship') {
      body(function () {
        g.moveTo(h * 1.1, 0); g.lineTo(-h * 0.8, -h * 0.7); g.lineTo(-h * 0.5, 0); g.lineTo(-h * 0.8, h * 0.7);
      });
    } else if (pl.mode === 'wave') {
      body(function () { g.moveTo(h * 0.8, 0); g.lineTo(-h * 0.6, -h * 0.5); g.lineTo(-h * 0.6, h * 0.5); });
    } else if (pl.mode === 'robot') {
      body(function () { g.rect(-h * 0.7, -h * 0.2, h * 1.4, h * 1.2); });
      body(function () { g.rect(-h * 0.5, h * 0.4, h * 0.35, h * 0.6); });
      body(function () { g.rect(h * 0.15, h * 0.4, h * 0.35, h * 0.6); });
      g.strokeStyle = fg; g.lineWidth = Math.max(1.5, h * 0.08);
      g.beginPath(); g.rect(-h * 0.45, -h * 0.05, h * 0.9, h * 0.4); g.stroke();
    } else if (pl.mode === 'swing') {
      body(function () { g.moveTo(0, -h * 0.9); g.lineTo(h * 0.9, 0); g.lineTo(0, h * 0.9); g.lineTo(-h * 0.9, 0); });
      g.fillStyle = fg; g.beginPath(); g.arc(0, 0, h * 0.2, 0, Math.PI * 2); g.fill();
    } else if (pl.mode === 'spider') {
      g.strokeStyle = fg; g.lineWidth = Math.max(2, h * 0.1);
      for (var k = -1; k <= 1; k += 2) {
        g.beginPath(); g.moveTo(k * h * 0.5, -h * 0.3); g.lineTo(k * h * 1.2, -h * 0.9); g.stroke();
        g.beginPath(); g.moveTo(k * h * 0.5, h * 0.3); g.lineTo(k * h * 1.2, h * 0.9); g.stroke();
      }
      body(function () { g.arc(0, 0, h * 0.7, 0, Math.PI * 2); });
    }
    g.restore();
  }

  // ---- play rendering ----
  function playToS(x1, y1) {
    var sx = CENTER_X + 2 * camZoom * (x1 - camWorldX - camOffX);
    // reference mirror: x' = x + p * (screenWidth - 2x) — the world reflects around the screen
    // centre while the flip animates and stays fully reflected at rest (container scaleX -1)
    var mp = mirrorProgress();
    if (mp > 0) sx += mp * (CW - 2 * sx);
    return { x: sx, y: playCamY + GROUND_SY - 2 * camZoom * y1 + 2 * camOffY };
  }
  // push settings into the sim and the toggle buttons, then redraw
  function setSettingButton(id, on, label) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = label + ': ' + (on ? 'ON' : 'OFF');
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.className = on ? 'selected' : '';
  }
  function syncSettings() {
    GS.setNoclip(showNoclip);
    setSettingButton('set-noclip', showNoclip, 'NOCLIP');
    setSettingButton('set-hitboxes', showHitboxes, 'HITBOXES');
    setSettingButton('set-percent', showPercent, 'PERCENT');
    dirty = true;
  }

  // ---- hitbox overlay (Show Hitboxes). Solid lines: solids. Dashed: hazards. Player: thick outer box, thin inner box.
  // white halo under every outline so black lines stay readable on black sprites
  function strokeBoxWorld(x0, x1, y0, y1, dashed, lw) {
    var a = playToS(x0, y1), b = playToS(x1, y0);
    var w = b.x - a.x, h = b.y - a.y;
    ctx.setLineDash([]);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = lw + 2;
    ctx.strokeRect(a.x, a.y, w, h);
    ctx.strokeStyle = '#000'; ctx.lineWidth = lw;
    ctx.setLineDash(dashed ? [6, 4] : []);
    ctx.strokeRect(a.x, a.y, w, h);
  }
  function drawHitboxes(lv) {
    var lo = p.x - CENTER_X / 2 - 60, hi = p.x + (CW - CENTER_X) / 2 + 60;
    var i, o, c, r;
    ctx.strokeStyle = '#000';
    for (i = 0; i < lv.solids.length; i++) {
      o = lv.solids[i];
      if (o.x0 < -1e8 || o.x1 < lo || o.x0 > hi) continue;      // skip the infinite ground and off-screen blocks
      strokeBoxWorld(o.x0, o.x1, o.y0, o.y1, false, 1.5);
    }
    for (i = 0; i < lv.spikes.length; i++) {
      o = lv.spikes[i];
      if (o.cx < lo || o.cx > hi) continue;
      if (o.r !== undefined) {
        c = playToS(o.cx, o.cy);
        r = o.r * 2;
        ctx.setLineDash([]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
      } else {
        strokeBoxWorld(o.x0, o.x1, o.y0, o.y1, true, 1.5);
      }
    }
    // outer box = the collision box the sim actually uses (wave is 4.5 half-size, mini 9 or 3)
    var PH = p.mode === 'wave' ? (p.isMini ? 3 : 4.5) : p.half;
    strokeBoxWorld(p.x - PH, p.x + PH, p.y - PH, p.y + PH, false, 3);
    strokeBoxWorld(p.x - p.inner, p.x + p.inner, p.y - p.inner, p.y + p.inner, false, 1.5);
    ctx.setLineDash([]); ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  }

  // sideways view: the reference maps (gameY, C - frameX) on the screen, a reflection across the diagonal
  function sidewaysNow() { var q = playerNow(); return !!(q && q.sideways); }
  function reflectAbout(g, cx, cy) { g.translate(cx, cy); g.transform(0, -1, -1, 0, 0, 0); g.translate(-cx, -cy); }
  // the cube is counter-reflected so it reads upright (its own rotation is applied inside)
  function drawPlayerView(g, toS, s, pl, invert) {
    if (!pl.sideways) { drawPlayer(g, toS, s, pl, invert); return; }
    var c = toS(pl.x, pl.y);
    g.save(); reflectAbout(g, c.x, c.y);
    drawPlayer(g, toS, s, pl, invert);
    g.restore();
  }
  // ================= GD 2.2 shader triggers (2904-2924) as Canvas 2D post-FX =================
  // Behaviour reference: Web Dashers level-shaders.js (value tweens, clocks, and the
  // shockwave/shockline ring math of GD_SHADER_SOURCE). Everything here renders with plain
  // canvas strip/cell blits and ctx.filter — no WebGL, no shaders, no particles. When no
  // effect is active the whole path costs one boolean check per frame.
  var fx = {
    active: false, clock: 0,
    // colour-space values (tweened)
    gray: 0, grayTintCh: 0, grayLum: false, sepia: 0, invert: 0, invertR: 1, invertG: 1, invertB: 1, invertClamp: false,
    hue: 0, chromX: 0, chromY: 0,
    colorR: 1, colorG: 1, colorB: 1, addR: 0, addG: 0, addB: 0,
    // lens / radial / bulge
    lensStrength: 0, lensSize: 0, lensFade: 0, lensOffX: 0, lensOffY: 0, lensTarget: 0, lensChannel: 0, lensAdd: false,
    radial: 0, radialI: 0, radialFade: 0, radialOffX: 0, radialOffY: 0, radialTarget: 0, radialOnlyEmpty: false,
    bulge: 0, bulgeOffX: 0, bulgeOffY: 0, bulgeRadius: 0, bulgeTarget: 0, bulgeValue2: 0,
    // shockwave / shockline clocks + params (reference _swTime / _slTime + uniforms)
    swActive: false, swTime: 0, swInvert: false, swTarget: 0, swOffX: 0, swOffY: 0,
    slActive: false, slTime: 0, slTarget: 0, slOff: 0, slAxis: false, slDir: false, slDual: false, slFlip: false,
    swSpeed: 0, swThick: 0, swStrength: 0, swWidth: 0, swFadeIn: 0, swFadeOut: 0, swMin: 0, swMax: 0, swMaxDist: 0, swTimeOff: 0,
    slSpeed: 0, slThick: 0, slStrength: 0, slWidth: 0, slFadeIn: 0, slFadeOut: 0, slMaxDist: 0, slTimeOff: 0,
    // CRT (2911 "chromatic glitch")
    cgEnabled: false, cgTime: 0, cgSpeed: 0, cgRGB: 0, cgYOff: 0, cgStrength: 0, cgHeight: 0, cgLineFade: 0, cgLineThick: 0, cgFollow: false,
    // parsed but not rendered (Dash contains none of them)
    glitch: 0, pixX: 0, pixY: 0, pinchX: 0, pinchY: 0, splitR: 0, splitC: 0
  };
  var fxTweens = [];
  var fxCvs = null, fxCtx = null, fxW = 0, fxH = 0;
  var fxCvsB = null, fxCtxB = null;              // scratch buffer (channel isolation / CRT compose)
  var fxToS = null;                               // play transform for player-anchored effects
  var fxFilterOK = false;
  var FX_SL = 40, FX_CELLS_X = 10, FX_CELLS_Y = 6, FX_RINGS = 12, FX_CG_SLICES = 24, FX_RAD_COPIES = 5;
  function fxSmoothstep(a, b, x) {
    if (x <= a) return 0;
    if (x >= b) return 1;
    var t = (x - a) / (b - a);
    return t * t * (3 - 2 * t);
  }
  function fxNoise(x, y) {
    var s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }
  function resetFx() {
    fxTweens.length = 0;
    fx.active = false; fx.clock = 0;
    fx.gray = 0; fx.grayTintCh = 0; fx.grayLum = false; fx.sepia = 0; fx.invert = 0;
    fx.invertR = 1; fx.invertG = 1; fx.invertB = 1; fx.invertClamp = false;
    fx.hue = 0; fx.chromX = 0; fx.chromY = 0;
    fx.colorR = 1; fx.colorG = 1; fx.colorB = 1; fx.addR = 0; fx.addG = 0; fx.addB = 0;
    fx.lensStrength = 0; fx.lensSize = 0; fx.lensFade = 0; fx.lensOffX = 0; fx.lensOffY = 0; fx.lensTarget = 0; fx.lensChannel = 0; fx.lensAdd = false;
    fx.radial = 0; fx.radialI = 0; fx.radialFade = 0; fx.radialOffX = 0; fx.radialOffY = 0; fx.radialTarget = 0; fx.radialOnlyEmpty = false;
    fx.bulge = 0; fx.bulgeOffX = 0; fx.bulgeOffY = 0; fx.bulgeRadius = 0; fx.bulgeTarget = 0;
    fx.swActive = false; fx.swTime = 0; fx.swInvert = false; fx.swTarget = 0; fx.swOffX = 0; fx.swOffY = 0;
    fx.slActive = false; fx.slTime = 0; fx.slTarget = 0; fx.slOff = 0; fx.slAxis = false; fx.slDir = false; fx.slDual = false; fx.slFlip = false;
    fx.swSpeed = 0; fx.swThick = 0; fx.swStrength = 0; fx.swWidth = 0; fx.swFadeIn = 0; fx.swFadeOut = 0; fx.swMin = 0; fx.swMax = 0; fx.swMaxDist = 0; fx.swTimeOff = 0;
    fx.slSpeed = 0; fx.slThick = 0; fx.slStrength = 0; fx.slWidth = 0; fx.slFadeIn = 0; fx.slFadeOut = 0; fx.slMaxDist = 0; fx.slTimeOff = 0;
    fx.cgEnabled = false; fx.cgTime = 0; fx.cgSpeed = 0; fx.cgRGB = 0; fx.cgYOff = 0; fx.cgStrength = 0; fx.cgHeight = 0; fx.cgLineFade = 0; fx.cgLineThick = 0; fx.cgFollow = false;
    fx.glitch = 0; fx.pixX = 0; fx.pixY = 0; fx.pinchX = 0; fx.pinchY = 0; fx.splitR = 0; fx.splitC = 0;
  }
  function fxT(key, to, q) {
    if (typeof to !== 'number' || !isFinite(to)) to = 0;   // missing trigger fields must not reach the renderer as undefined/NaN
    // reference _tweenShaderValue: duration 0 applies instantly, otherwise an eased tween
    var dur = frames(q.dur), et = q.easingType || 0, er = q.easingRate === undefined || q.easingRate === null ? 2 : (q.easingRate > 0 ? q.easingRate : 2);
    if (!q.dur || q.dur <= 0) { fx[key] = to; var i; for (i = fxTweens.length - 1; i >= 0; i--) if (fxTweens[i].key === key) fxTweens.splice(i, 1); return; }
    var from = fx[key];
    for (var j = fxTweens.length - 1; j >= 0; j--) if (fxTweens[j].key === key) fxTweens.splice(j, 1);
    fxTweens.push({ key: key, from: from, to: to, t: 0, dur: dur, easingType: et, easingRate: er });
    fx.active = true;
  }
  function fireShader(t) {
    var q = t.p, fxn = q.fx;
    fx.active = true;
    if (fxn === 'layers') {
      if (q.b192) resetFx();
      return;
    }
    if (fxn === 'shockwave') {
      // reference 2905: non-513 resets the clock/flags; 513 only re-tweens the values
      if (!q.b513) {
        fx.swTime = 0;
        fx.swInvert = q.b184;
        fx.swTarget = q.b188 ? (q.p1 ? -1 : q.p2 ? -2 : q.target) : 0;
        fx.swOffX = q.v290 || 0; fx.swOffY = q.v291 || 0;
      }
      fx.swActive = true;
      fx.swSpeed = q.v175; fx.swStrength = q.v176; fx.swThick = q.v180; fx.swWidth = q.v179;
      fx.swFadeIn = q.v181; fx.swFadeOut = q.v182; fx.swMin = q.v191; fx.swMax = q.v189; fx.swMaxDist = q.v512; fx.swTimeOff = q.v177 || 0;
      return;
    }
    if (fxn === 'shockline') {
      if (!q.b513) {
        fx.slTime = 0;
        fx.slAxis = q.b186; fx.slDir = q.b185; fx.slDual = q.b187; fx.slFlip = q.b184;
        fx.slTarget = q.b188 ? (q.p1 ? -1 : q.p2 ? -2 : q.target) : 0;
        fx.slOff = q.v290 || 0;
      }
      fx.slActive = true;
      fx.slSpeed = q.v175; fx.slStrength = q.v176; fx.slThick = q.v180; fx.slWidth = q.v179;
      fx.slFadeIn = q.v181; fx.slFadeOut = q.v182; fx.slMaxDist = q.v512; fx.slTimeOff = q.v177 || 0;
      return;
    }
    if (fxn === 'chromatic') {
      if (q.b188) fxT('chromX', q.v180, q);
      if (q.b190) fxT('chromY', q.v189, q);
      return;
    }
    if (fxn === 'crt') {
      if (!fx.cgEnabled) fx.cgTime = fx.clock;
      fx.cgEnabled = !q.b192;
      fx.cgFollow = q.b194;
      fxT('cgSpeed', q.v175, q); fxT('cgHeight', 1 / Math.max(0.1, q.v189), q);
      fxT('cgStrength', q.v176, q); fxT('cgLineFade', q.v179, q);
      fxT('cgLineThick', q.v191, q); fxT('cgRGB', q.v180, q);
      return;
    }
    if (fxn === 'grayscale') {
      if (q.b190) fx.grayTintCh = q.target;
      fx.grayLum = q.b188;
      fxT('gray', q.v176, q);
      return;
    }
    if (fxn === 'sepia') { fxT('sepia', q.v176, q); return; }
    if (fxn === 'invert') {
      if (q.b188) {
        fx.invertClamp = q.b194;
        if (q.b190) { fxT('invertR', q.v179, q); fxT('invertG', q.v180, q); fxT('invertB', q.v189, q); }
        else { fx.invertR = q.v179; fx.invertG = q.v180; fx.invertB = q.v189; }
      }
      fxT('invert', q.v176, q);
      return;
    }
    if (fxn === 'hue') { fxT('hue', q.v176, q); return; }
    if (fxn === 'color') {
      fxT('colorR', q.v175, q); fxT('colorG', q.v176, q); fxT('colorB', q.v191, q);
      fxT('addR', q.v179, q); fxT('addG', q.v180, q); fxT('addB', q.v189, q);
      return;
    }
    if (fxn === 'lens') {
      fx.lensTarget = q.p1 ? -1 : q.p2 ? -2 : q.target;
      fx.lensChannel = q.centerGroup;
      fxT('lensStrength', Math.max(0, Math.min(1, q.v176)), q);
      fxT('lensSize', q.v179, q); fxT('lensFade', q.v181, q);
      fxT('lensOffX', q.v290 || 0, q); fxT('lensOffY', q.v291 || 0, q);
      return;
    }
    if (fxn === 'radial') {
      fx.radialTarget = q.b188 ? (q.p1 ? -1 : q.p2 ? -2 : q.target) : 0;
      fx.radialOnlyEmpty = q.b513;
      fxT('radial', q.v179, q); fxT('radialI', q.v176, q); fxT('radialFade', q.v181, q);
      fxT('radialOffX', q.v290 || 0, q); fxT('radialOffY', q.v291 || 0, q);
      return;
    }
    if (fxn === 'bulge') {
      fx.bulgeTarget = q.b188 ? (q.p1 ? -1 : q.p2 ? -2 : q.target) : 0;
      fxT('bulge', q.v176, q); fxT('bulgeOffX', q.v290 || 0, q); fxT('bulgeOffY', q.v291 || 0, q);
      fxT('bulgeRadius', q.v180, q);
      return;
    }
    if (fxn === 'glitch') { fx.glitch = q.v176; return; }
    if (fxn === 'pixelate') { if (q.b188) fx.pixX = q.v180; if (q.b190) fx.pixY = q.v189; return; }
    if (fxn === 'pinch') { fx.pinchX = q.v180; fx.pinchY = q.v189; return; }
    if (fxn === 'split') { if (q.b188) fx.splitC = q.v180; if (q.b190) fx.splitR = q.v189; return; }
    // motion (2915): stored but not rendered (Dash contains none)
  }
  function stepShaders(dtSec) {
    if (!fx.active && !fxTweens.length) return;
    fx.clock += dtSec;
    var i, tw, f;
    for (i = fxTweens.length - 1; i >= 0; i--) {
      tw = fxTweens[i];
      tw.t += dtSec * 60;
      f = Math.min(1, tw.t / tw.dur);
      fx[tw.key] = tw.from + (tw.to - tw.from) * easingSample(tw.easingType, tw.easingRate, f);
      if (f >= 1) fxTweens.splice(i, 1);
    }
    if (fx.swActive) {
      fx.swTime += fx.swSpeed * dtSec;
      // the ring band leaves the screen: stop paying for it (reference keeps the uniform set,
      // but the smoothstep window makes the contribution exactly zero past the diagonal)
      var wS = fx.swThick <= 0.001 ? 0.0002 : fx.swThick * 0.2;
      var tS = fx.swTime + fx.swTimeOff * 0.1;
      var outerS = tS * (fx.swInvert ? 1 : tS) - fx.swFadeIn * wS;
      if (outerS > 2.2) fx.swActive = false;
    }
    if (fx.slActive) {
      fx.slTime += fx.slSpeed * dtSec;
      var wL = fx.slThick <= 0.001 ? 0.0002 : fx.slThick * 0.2;
      var tL = fx.slTime + fx.slTimeOff * 0.1;
      if (fx.slFlip) tL = (fx.slDual ? 0.5 : 1) * (fx.slFadeOut * wL + wL + fx.slFadeIn * wL) - tL;
      var outerL = tL - fx.slFadeIn * wL;
      if (outerL > 2.2) fx.slActive = false;
    }
    if (fx.cgEnabled) {
      var ct = fx.cgTime + fx.cgSpeed * dtSec;
      fx.cgTime = Math.floor(ct) % 1000 + (ct - Math.floor(ct));
    }
    fx.active = fx.swActive || fx.slActive || fx.cgEnabled || fx.gray > 0 || fx.sepia > 0 || fx.invert > 0 ||
      fx.hue !== 0 || fx.chromX !== 0 || fx.chromY !== 0 || fx.colorR !== 1 || fx.colorG !== 1 || fx.colorB !== 1 ||
      fx.addR !== 0 || fx.addG !== 0 || fx.addB !== 0 || fx.lensStrength > 0 || fx.bulge > 0 || fx.radial !== 0;
  }
  function fxEnsure(w, h) {
    if (!fxCvs) {
      fxCvs = document.createElement('canvas'); fxCtx = fxCvs.getContext('2d');
      fxCvsB = document.createElement('canvas'); fxCtxB = fxCvsB.getContext('2d');
      fxFilterOK = typeof fxCtx.filter === 'string';
    }
    if (fxW !== w || fxH !== h) { fxW = w; fxH = h; fxCvs.width = w; fxCvs.height = h; fxCvsB.width = w; fxCvsB.height = h; }
  }
  // player-centred effects resolve their origin the same way as the reference _shaderScreenPos(-1)
  function fxTargetPos(target) {
    if (target === -1 && p && fxToS) { var c = fxToS(p.x, p.y); return [c.x / fxW, 1 - c.y / fxH]; }
    if (target === -2 && p2 && fxToS) { var c2 = fxToS(p2.x, p2.y); return [c2.x / fxW, 1 - c2.y / fxH]; }
    return null;
  }
  function drawFxIsolated(dst, src, srcCtx, r, g, b) {
    // src * solid(rgb): multiply isolates a channel, destination-in restores the source alpha
    // (without it the multiply fill would paint solid colour into transparent gaps)
    dst.clearRect(0, 0, fxW, fxH);
    dst.globalCompositeOperation = 'source-over';
    dst.drawImage(src, 0, 0);
    dst.globalCompositeOperation = 'multiply';
    dst.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    dst.fillRect(0, 0, fxW, fxH);
    dst.globalCompositeOperation = 'destination-in';
    dst.drawImage(src, 0, 0);
    dst.globalCompositeOperation = 'source-over';
  }
  function fxChromatic(g, src) {
    // reference CHROMATIC: R at +offset, B at -offset, G in place
    var dx = fx.chromX, dy = fx.chromY;
    if (dx === 0 && dy === 0) return;
    var ddx = Math.round(dx * 2), ddy = Math.round(dy * 2);
    if (ddx === 0 && ddy === 0) return;
    var saveA = g.globalAlpha, saveC = g.globalCompositeOperation;
    drawFxIsolated(fxCtxB, fxCvs, fxCtx, 255, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(fxCvsB, ddx, ddy);
    drawFxIsolated(fxCtxB, fxCvs, fxCtx, 0, 255, 0);
    g.drawImage(fxCvsB, 0, 0);
    drawFxIsolated(fxCtxB, fxCvs, fxCtx, 0, 0, 255);
    g.drawImage(fxCvsB, -ddx, -ddy);
    g.globalCompositeOperation = saveC; g.globalAlpha = saveA;
  }
  function fxShockline(g, src) {
    // reference SHOCKLINE: displacement field k*sin(dis*waves - time)*strength along a line
    var w = fx.slThick <= 0.001 ? 0.0002 : fx.slThick * 0.2;
    var fadeIn = fx.slFadeIn * w, fadeOut = fx.slFadeOut * w;
    var t = fx.slTime + fx.slTimeOff * 0.1;
    if (fx.slFlip) t = (fx.slDual ? 0.5 : 1) * (fadeOut + w + fadeIn) - t;
    var outer = t - fadeIn;
    var inner = Math.min(outer, outer - w);
    var end = Math.min(inner, inner - fadeOut);
    var waves = 22 / Math.max(0.001, fx.slWidth);
    var t1 = fadeIn + outer + 0.001, t2 = outer, t3 = inner + 0.001, t4 = end;
    var str = fx.slStrength * 0.01;
    var center = 0.5 + fx.slOff * 0.5;
    var aspect = fxH / fxW;
    var maxDist = fx.slMaxDist !== 0 ? 1 / (fx.slMaxDist * 0.5) : 0;
    var strips = FX_SL, sh = fxH / strips, i;
    var y0, dis, k, a, dxPx, dyPx;
    g.drawImage(src, 0, 0);              // clamp-to-edge base under the displaced strips
    for (i = 0; i < strips; i++) {
      y0 = Math.floor(i * sh);
      dis = fx.slAxis ? (((1 - (y0 + sh * 0.5) / fxH) - center) * aspect) : ((y0 + sh * 0.5) / fxW - center);
      if (maxDist !== 0) k = Math.max(0, Math.min(1, 1 + (dis < 0 ? 1 : -1) * dis * maxDist)); else k = 1;
      if (fx.slDual) dis = dis < 0 ? -dis : dis;
      if (fx.slDir) dis = 1 - dis;
      k *= Math.max(0, Math.min(1, fxSmoothstep(t1, t2, dis) - fxSmoothstep(t3, t4, dis)));
      if (k <= 0.0001) continue;
      a = k * Math.sin(dis * waves - t) * str;
      dxPx = a * fxW; dyPx = a * fxW;      // uv offset (1, 1/aspect) is equal in px on both axes
      g.drawImage(src, 0, y0, fxW, sh, dxPx, y0 + dyPx, fxW, sh);
    }
  }
  function fxShockwave(g, src) {
    // reference SHOCKWAVE: radial ripple k*(p/dis)*sin(dis*waves - time)*strength around a centre
    var w = fx.swThick <= 0.001 ? 0.0002 : fx.swThick * 0.2;
    var fadeIn = fx.swFadeIn * w;
    var t = fx.swTime + fx.swTimeOff * 0.1;
    var outer = t * (fx.swInvert ? 1 : t) - fadeIn;
    var inner = Math.min(outer, outer - w);
    var end = Math.min(inner, inner - fx.swFadeOut * w);
    var waves = 22 / Math.max(0.001, fx.swWidth);
    var t1 = fadeIn + outer + 0.001, t2 = outer, t3 = inner + 0.001, t4 = end;
    var str = fx.swStrength * 0.1;
    var maxDist = fx.swMaxDist !== 0 ? 1 / (fx.swMaxDist * 0.5) : 0;
    var minSize = fx.swMin * 0.5, maxSize = fx.swMax;
    var pos = fxTargetPos(fx.swTarget);
    var cx = pos ? pos[0] : 0.5 + fx.swOffX * 0.5, cy = pos ? pos[1] : 0.5 + fx.swOffY * 0.5;
    var aspect = fxH / fxW;
    var nx = FX_CELLS_X, ny = FX_CELLS_Y, cw = fxW / nx, ch = fxH / ny, ix, iy;
    var x0, y0, mx, my, dis, k, ox, oy;
    g.drawImage(src, 0, 0);              // clamp-to-edge base under the displaced cells
    for (iy = 0; iy < ny; iy++) {
      for (ix = 0; ix < nx; ix++) {
        x0 = Math.floor(ix * cw); y0 = Math.floor(iy * ch);
        mx = (x0 + cw * 0.5) / fxW - cx;
        my = ((1 - (y0 + ch * 0.5) / fxH) - cy) * aspect;
        dis = Math.sqrt(mx * mx + my * my);
        if (dis < 0.0001) dis = 0.0001;
        if (maxDist !== 0) k = Math.max(0, Math.min(1, 1 - dis * maxDist)); else k = 1;
        if (fx.swInvert) dis = maxSize - Math.max(dis, minSize);
        k *= Math.max(0, Math.min(1, fxSmoothstep(t1, t2, dis) - fxSmoothstep(t3, t4, dis)));
        if (k <= 0.0001) continue;
        ox = (mx / dis) * Math.sin(dis * waves - t) * str * k * fxW;
        oy = (my / dis) * Math.sin(dis * waves - t) * str * k * fxW;
        g.drawImage(src, x0, y0, cw, ch, x0 + ox, y0 - oy, cw, ch);
      }
    }
  }
  function fxBulge(g, src) {
    // reference BULGE: screen radius r samples the source at tan(r*value)*value2
    if (fx.bulge <= 0 || fx.bulgeRadius <= 0) return;
    var pos = fxTargetPos(fx.bulgeTarget);
    var cx = (pos ? pos[0] : 0.5 + fx.bulgeOffX * 0.5) * fxW;
    var cy = (1 - (pos ? pos[1] : 0.5 + fx.bulgeOffY * 0.5)) * fxH;
    var radius = fx.bulgeRadius * fxW;      // uv radius along x; screen radius in px
    var rings = FX_RINGS, i, r0, r1, srcR0, srcR1, sc;
    for (i = 0; i < rings; i++) {
      r0 = radius * i / rings; r1 = radius * (i + 1) / rings;
      // sample scale per ring: screen r shows source tan(r*v)*v2  =>  scale = r / srcR
      srcR0 = Math.tan(r0 * fx.bulge) * fx.bulgeValue2;
      srcR1 = Math.tan(r1 * fx.bulge) * fx.bulgeValue2;
      sc = (r1 <= 0.01 || srcR1 <= 0.001) ? 1 : r1 / srcR1;
      if (sc <= 0 || !isFinite(sc)) sc = 1;
      g.save();
      g.beginPath();
      g.arc(cx, cy, r1, 0, Math.PI * 2);
      if (r0 > 0) g.arc(cx, cy, r0, 0, Math.PI * 2, true);
      g.clip();
      g.translate(cx, cy);
      g.scale(sc, sc);
      g.translate(-cx, -cy);
      g.drawImage(src, 0, 0);
      g.restore();
    }
    // outside the radius the frame is unchanged
    g.save();
    g.beginPath();
    g.rect(0, 0, fxW, fxH);
    g.arc(cx, cy, radius, 0, Math.PI * 2, true);
    g.clip();
    g.drawImage(src, 0, 0);
    g.restore();
  }
  function fxRadial(g, src) {
    // reference RADIALBLUR: samples pulled toward the centre (zoom-copy approximation)
    if (fx.radial === 0) return;
    var pos = fxTargetPos(fx.radialTarget);
    var cx = (pos ? pos[0] : 0.5 + fx.radialOffX * 0.5) * fxW;
    var cy = (1 - (pos ? pos[1] : 0.5 + fx.radialOffY * 0.5)) * fxH;
    var amp = fx.radial / 9 * 0.2;
    var saveA = g.globalAlpha;
    var i, s, e = FX_RAD_COPIES;
    for (i = 1; i <= e; i++) {
      s = 1 + amp * (i / e - 0.5) * 2;
      if (s <= 0.01 || Math.abs(s - 1) < 0.004) continue;
      g.save();
      g.globalAlpha = saveA * 0.34;
      g.translate(cx, cy); g.scale(s, s); g.translate(-cx, -cy);
      g.drawImage(src, 0, 0);
      g.restore();
    }
    g.globalAlpha = saveA;
  }
  function fxLens(g) {
    // reference LENSCIRCLE: a tinted circle fading in from lensStart to lensEnd around an origin
    if (fx.lensStrength <= 0) return;
    var aspect = fxH / fxW;
    var pos = fxTargetPos(fx.lensTarget);
    var ox = pos ? pos[0] : 0.5 + fx.lensOffX * 0.5;
    var oy = (pos ? pos[1] : 0.5 + fx.lensOffY * 0.5) * aspect;
    var size = isFinite(fx.lensSize) ? fx.lensSize : 0, fade = isFinite(fx.lensFade) ? Math.max(0, fx.lensFade) : 0;
    var end = Math.max(0, size), start = Math.max(0, size - fade);
    if (!(end > start) || !isFinite(end) || !isFinite(start)) return;
    var tint = fx.lensChannel > 0 ? channelColor(fx.lensChannel) : '#000000';
    var rgb = parseRGB(tint || '#000000');
    var grad = g.createRadialGradient(ox * fxW, oy * fxH, 0, ox * fxW, oy * fxH, Math.max(1, end * fxW));
    var col = function (rgbv, a) {
      return 'rgba(' + Math.round(rgbv.r * 255) + ',' + Math.round(rgbv.g * 255) + ',' + Math.round(rgbv.b * 255) + ',' + a + ')';
    };
    grad.addColorStop(0, col(rgb, 0));
    grad.addColorStop(Math.max(0.001, start / end), col(rgb, 0));
    grad.addColorStop(1, col(rgb, fx.lensStrength));
    var saveC = g.globalCompositeOperation;
    if (fx.lensAdd) g.globalCompositeOperation = 'lighter';
    g.fillStyle = grad;
    g.fillRect(0, 0, fxW, fxH);
    g.globalCompositeOperation = saveC;
  }
  function fxCrt(g, src, srcCtx) {
    // reference CHROMATICGLITCH: per-scanline noise displacement + RGB offset + scanline dimming
    var slices = FX_CG_SLICES, sh = fxH / slices, i, y0, cVal, disp, dxPx;
    var yOff = fx.cgFollow ? -(playCamY || 0) / fxH : 0;
    for (i = 0; i < slices; i++) {
      y0 = Math.floor(i * sh);
      cVal = ((y0 + sh * 0.5) / fxH + yOff) * 50 * fx.cgHeight;
      disp = (fxNoise(fx.cgTime, cVal) - fxNoise(0, cVal)) * fx.cgStrength;
      dxPx = disp * fxW;
      g.drawImage(src, 0, y0, fxW, sh, dxPx, y0, fxW, sh);
    }
    if (fx.cgRGB !== 0) {
      var off = fx.cgRGB * 2;
      var saveC = g.globalCompositeOperation;
      drawFxIsolated(fxCtxB, fxCvs, fxCtx, 255, 0, 0);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(fxCvsB, -Math.round(off), 0);
      drawFxIsolated(fxCtxB, fxCvs, fxCtx, 0, 0, 255);
      g.drawImage(fxCvsB, Math.round(off), 0);
      g.globalCompositeOperation = saveC;
    }
    if (fx.cgLineThick > 0) {
      // color -= smoothstep(thick-0.01, thick+0.01, sin(y*300*height)) * lineStrength
      var lt = Math.max(0.001, 1 - 0.2 * fx.cgLineFade);
      var saveA = g.globalAlpha;
      g.fillStyle = '#000';
      for (i = 0; i < slices; i++) {
        y0 = Math.floor(i * sh);
        var sv = Math.sin(((y0 + sh * 0.5) / fxH + yOff) * 300 * fx.cgHeight);
        var sst = fxSmoothstep(lt - 0.01, lt + 0.01, sv);
        if (sst <= 0.001) continue;
        g.globalAlpha = saveA * sst * fx.cgLineThick * 0.05;
        g.fillRect(0, y0, fxW, sh);
      }
      g.globalAlpha = saveA;
    }
  }
  function applyPostFX(g, toSFn) {
    if (!fx.active || MONO) return;
    var c = g.canvas;
    if (!c || !c.width) return;
    fxEnsure(c.width, c.height);
    fxToS = toSFn;
    // 1. snapshot the composed frame
    fxCtx.clearRect(0, 0, fxW, fxH);
    fxCtx.drawImage(c, 0, 0, fxW, fxH);
    // 2. geometry passes paint the snapshot back through distortion strips/cells
    g.clearRect(0, 0, fxW, fxH);
    var displaced = false;
    if (fx.swActive && fx.swStrength > 0) { fxShockwave(g, fxCvs); displaced = true; }
    else if (fx.slActive && fx.slStrength > 0) { fxShockline(g, fxCvs); displaced = true; }
    if (fx.bulge > 0) { fxBulge(g, fxCvs); displaced = true; }
    // 3. chromatic needs the displaced frame as a bitmap: re-snapshot, then split channels
    if ((fx.chromX !== 0 || fx.chromY !== 0) && displaced) {
      fxCtx.clearRect(0, 0, fxW, fxH);
      fxCtx.drawImage(c, 0, 0, fxW, fxH);
      g.clearRect(0, 0, fxW, fxH);
    }
    if (fx.chromX !== 0 || fx.chromY !== 0) fxChromatic(g, fxCvs);
    if (fx.radial !== 0) fxRadial(g, fxCvs);
    if (fxFilterOK) {
      var parts = '';
      if (fx.gray > 0) parts += 'grayscale(' + Math.min(1, fx.gray).toFixed(3) + ') ';
      if (fx.sepia > 0) parts += 'sepia(' + Math.min(1, fx.sepia).toFixed(3) + ') ';
      if (fx.invert > 0) {
        var iv = fx.invertClamp ? Math.min(1, fx.invert) : fx.invert;
        parts += 'invert(' + Math.max(0, Math.min(1, iv)).toFixed(3) + ') ';
      }
      if (fx.hue !== 0) parts += 'hue-rotate(' + fx.hue.toFixed(2) + 'deg) ';
      if (parts) g.filter = parts;
    }
    // color change (2923): multiply tint + additive term
    if (fx.colorR !== 1 || fx.colorG !== 1 || fx.colorB !== 1) {
      var mr = Math.max(0, Math.min(1, fx.colorR)), mg = Math.max(0, Math.min(1, fx.colorG)), mb = Math.max(0, Math.min(1, fx.colorB));
      var saveC = g.globalCompositeOperation;
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = 'rgb(' + Math.round(mr * 255) + ',' + Math.round(mg * 255) + ',' + Math.round(mb * 255) + ')';
      g.fillRect(0, 0, fxW, fxH);
      if (fx.colorR > 1 || fx.colorG > 1 || fx.colorB > 1) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = Math.min(0.5, (fx.colorR - 1) * 0.5);
        g.drawImage(fxCvs, 0, 0);
        g.globalAlpha = 1;
      }
      g.globalCompositeOperation = saveC;
    }
    if (fxFilterOK) g.filter = 'none';
    if (fx.addR !== 0 || fx.addG !== 0 || fx.addB !== 0) {
      var saveC2 = g.globalCompositeOperation;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgb(' + Math.round(fx.addR * 255) + ',' + Math.round(fx.addG * 255) + ',' + Math.round(fx.addB * 255) + ')';
      g.fillRect(0, 0, fxW, fxH);
      g.globalCompositeOperation = saveC2;
    }
    if (fx.lensStrength > 0) fxLens(g);
    if (fx.cgEnabled) fxCrt(g, fxCvs, fxCtx);
  }
  function renderPlay() {
    ctx.save();
    if (sidewaysNow()) reflectAbout(ctx, CW / 2, CH / 2);
    if (camAngle) { ctx.translate(CW / 2, CH / 2); ctx.rotate(camAngle * Math.PI / 180); ctx.translate(-CW / 2, -CH / 2); }
    renderPlayInner();
    ctx.restore();
  }
  function renderPlayInner() {
    var drewTex = false;
    if (!MONO && LEVEL.bgId) {
      var m = bgMirrorCanvas(bgFileOf(LEVEL));
      if (m) {
        // reference _updateBackground: parallax 0.1x horizontally, 0.1x vertically, wrapped over the mirror pair.
        // Phaser tileSprite shows texture row (tilePosition + screenRow): the pattern anchor is the NEGATED tilePosition
        var tx = 0.1 * bgScrollPx, ty = (1024 - CH - REF_O) - 0.1 * playCamY;
        drewTex = drawTintedTiled(ctx, m, bgColor(), 0, 0, CW, CH, -tx, -ty);
      }
    }
    if (!drewTex) { ctx.fillStyle = bgColor(); ctx.fillRect(0, 0, CW, CH); }
    drawWorld(ctx, playToS, 2, true);
    drawPlayerView(ctx, playToS, 2, p, false);
    if (p2) drawPlayerView(ctx, playToS, 2, p2, true);
    if (showHitboxes) drawHitboxes(LEVEL.sim());
    applyPostFX(ctx, playToS);
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
    if (showNoclip) { ctx.textAlign = 'left'; ctx.fillText('NOCLIP', 12, 42); }
    if (showPercent) {
      ctx.textAlign = 'center'; ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText(Math.floor(prog * 100) + '%', CW / 2, 22);
      ctx.font = '15px Arial, sans-serif';
    }
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
    { label: 'Move right', id: 901, p: { dx: 60, dy: 0, dur: 1 } }, { label: 'Stop', id: 1616, p: { dur: 1 } }, { label: 'Spawn', id: 1268, p: { delay: 0 } }, { label: 'Zoom 2x', id: 1913, p: { zoom: 2, dur: 1 } }, { label: 'Zoom 1x', id: 1913, p: { zoom: 1, dur: 1 } }, { label: 'Cam up', id: 1916, p: { dx: 0, dy: 60, dur: 1, axis: 0 } }, { label: 'Cam down', id: 1916, p: { dx: 0, dy: -60, dur: 1, axis: 0 } }, { label: 'Static cam', id: 1914, p: { target: 0, exit: false, dur: 0 } }, { label: 'Static exit', id: 1914, p: { target: 0, exit: true, dur: 0 } }, { label: 'Rot flip', id: 2900, p: { ground: 4, move: 4, touch: true } }, { label: 'Rot reverse', id: 2900, p: { ground: 2, move: 2, touch: true } }, { label: 'Rot normal', id: 2900, p: { ground: 2, move: 4, touch: true } }, { label: 'Rot sideways', id: 2900, p: { ground: 3, move: 4, touch: true } }, { label: 'Cam rot 90', id: 2015, p: { degrees: 90, add: false, dur: 1 } },
    { label: 'Reverse', id: 1917, p: {} }, { label: 'Gravity 1.5x', id: 2066, p: { gravity: 1.5 } },
    { label: 'Stop jump', id: 1932, p: { stopJump: true } }, { label: 'Timewarp 1.5x', id: 1935, p: { timeMod: 1.5 } },
    { label: 'Teleport to Group 1', id: 3022, p: { target: 1, gravityMode: 0 } }, { label: 'End level', id: 3600, p: {} }
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
    LEVEL.revision = (LEVEL.revision || 0) + 1;
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
    LEVEL.revision = (LEVEL.revision || 0) + 1;
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
    LEVEL.revision = (LEVEL.revision || 0) + 1;
    LEVEL.dirty = true;
    dirty = true;
  }

  function renderEdit() {
    if (!ectx) return;
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
      var kind = kindFast(o), fp = footFast(o);
      var a = editToS(o.gx * CELL, (o.gy + fp.h) * CELL), b = editToS((o.gx + fp.w) * CELL, o.gy * CELL);
      if (kind === 'trigger') {
        var t = o.p || {};
        var triggerLabels = { 1913: 'ZOOM', 1914: 'STATIC', 1916: 'OFFSET', 1917: 'REV', 1932: 'CTRL', 1935: 'TIME', 2015: 'CAM R', 2062: 'EDGE', 2066: 'GRAV', 2900: 'ROT', 2925: 'MODE', 3022: 'TP', 3600: 'END', 3604: 'EVENT' };
        var lbl = o.id === 1049 ? (t.activate ? 'S' : 'H') : o.id === 1007 ? 'A' : o.id === 901 ? 'M' : (triggerLabels[o.id] || 'X');
        ectx.fillStyle = '#fff'; ectx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ectx.strokeStyle = '#000'; ectx.lineWidth = 2; ectx.strokeRect(a.x + 2, a.y + 2, b.x - a.x - 4, b.y - a.y - 4);
        ectx.fillStyle = '#000'; ectx.font = 'bold 11px Arial, sans-serif'; ectx.textAlign = 'center'; ectx.textBaseline = 'middle';
        var detail = o.id === 2062 ? (t.edge || '') : o.id === 3604 ? (t.events && t.events.length ? t.events.join('.') : '') : (t.target || '');
        ectx.fillText(lbl + (t.touch ? '*' : '') + (detail ? ' ' + detail : ''), (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else if (o.id === 2016) {
        // Camera Guide is an editor preview only. The orange outline represents the
        // current aspect ratio; the green inset is the minimum 4:3 safe frame.
        var gp = o.p || {}, guideZoom = Math.max(0.4, Math.min(3, Number(gp.zoom) || 1));
        var guideCx = o.gx * CELL + fp.w * CELL / 2 + (Number(gp.dx) || 0);
        var guideCy = o.gy * CELL + fp.h * CELL / 2 + (Number(gp.dy) || 0);
        var halfH = CH / (4 * guideZoom), halfW = CW / (4 * guideZoom);
        var ga = editToS(guideCx - halfW, guideCy + halfH), gb = editToS(guideCx + halfW, guideCy - halfH);
        var minHalfW = halfH * 4 / 3;
        var g4a = editToS(guideCx - minHalfW, guideCy + halfH), g4b = editToS(guideCx + minHalfW, guideCy - halfH);
        ectx.save(); ectx.globalAlpha = gp.previewOpacity === undefined ? 0.85 : Math.max(0, Math.min(1, Number(gp.previewOpacity)));
        ectx.setLineDash([8, 5]); ectx.lineWidth = 2; ectx.strokeStyle = '#d88a20';
        ectx.strokeRect(ga.x, ga.y, gb.x - ga.x, gb.y - ga.y);
        ectx.setLineDash([4, 4]); ectx.strokeStyle = '#299b55';
        ectx.strokeRect(g4a.x, g4a.y, g4b.x - g4a.x, g4b.y - g4a.y);
        var gc = editToS(guideCx, guideCy); ectx.setLineDash([]); ectx.strokeStyle = '#d6a400';
        ectx.beginPath(); ectx.moveTo(gc.x - 7, gc.y); ectx.lineTo(gc.x + 7, gc.y); ectx.moveTo(gc.x, gc.y - 7); ectx.lineTo(gc.x, gc.y + 7); ectx.stroke();
        ectx.fillStyle = '#6b4b00'; ectx.font = 'bold 11px Arial, sans-serif'; ectx.textAlign = 'left'; ectx.textBaseline = 'bottom';
        ectx.fillText('CAMERA GUIDE  x' + guideZoom.toFixed(2), ga.x + 3, ga.y - 3); ectx.restore();
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
      var fp = footFast(o);
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
      syncPlatformerUI();
      clearSelection(); undoStack = []; redoStack = [];
      var skippedIds = Object.keys(res.skipped);
      flash('Loaded ' + res.level.objs.length + ' objects' + (res.name ? ' from "' + res.name + '"' : '') + (res.converted ? ' (' + res.converted + ' decorations became blocks)' : '') +
        (skippedIds.length ? '. Skipped unsupported ids: ' + skippedIds.join(', ') : '') + '. ' + inertCount() + ' inert triggers (not simulated).');
      dirty = true;
    } catch (e) {
      flash('Import failed: ' + e.message);
    }
  }

  // ================= tabs =================
  // the editor only holds its bitmap while its tab is open: a 1138x640 backing store plus the
  // sprite canvases it draws are released on leaving the tab, so playing never keeps them alive
  var EDITOR_W = 1138, EDITOR_H = 640;
  function setEditorBitmap(on) {
    var ed = document.getElementById('editor');
    if (!ed) return;
    if (on) {
      if (ed.width !== EDITOR_W) ed.width = EDITOR_W;
      if (ed.height !== EDITOR_H) ed.height = EDITOR_H;
      ectx = ed.getContext('2d');
    } else {
      ed.width = 0; ed.height = 0;
      ectx = null;
      clearCanvasCache();
    }
  }
  function setTab(name) {
    var wasEdit = activeTab === 'edit';
    activeTab = name;
    if (name === 'edit' && !wasEdit) setEditorBitmap(true);
    if (wasEdit && name !== 'edit') setEditorBitmap(false);
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
    try {
      while (acc >= FRAME_MS && frames < 4 && !frozen) { acc -= FRAME_MS; frames++; advanceFrame(); }
      if (activeTab === 'edit') { panEditor(frames > 0 ? frames : 0.5); renderEdit(); }
      else if (dirty || status === 'play') { renderPlay(); dirty = false; }
    } catch (err) {
      // log each distinct failure once and keep the loop alive (the next frame re-renders)
      if (!loop._seen) loop._seen = {};
      var key = String(err && err.message);
      if (!loop._seen[key]) { loop._seen[key] = 1; if (window.console) console.error('frame error:', err); }
      dirty = true;
    }
    window.requestAnimationFrame(loop);
  }

  // ================= input =================
  var KEY_PAN = { 37: 'left', 65: 'left', 39: 'right', 68: 'right', 38: 'up', 87: 'up', 40: 'down', 83: 'down' };
  document.onkeydown = function (e) {
    var k = e.keyCode;
    var mod = e.ctrlKey || e.metaKey;
    if (k === 32 && activeTab === 'play') { e.preventDefault(); if (!e.repeat) pressJump(); return; }
    if (activeTab === 'play' && LEVEL.platformer && (k === 37 || k === 65 || k === 39 || k === 68)) { e.preventDefault(); if (k === 37 || k === 65) leftHeld = true; else rightHeld = true; return; }
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
    if (k === 37 || k === 65) leftHeld = false;
    if (k === 39 || k === 68) rightHeld = false;
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

  function syncPlatformerUI() {
    var enabled = !!(LEVEL && LEVEL.platformer);
    var toggle = document.getElementById('btn-platformer');
    var controls = document.getElementById('platformer-controls');
    if (toggle) { toggle.textContent = 'PLATFORMER: ' + (enabled ? 'ON' : 'OFF'); toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false'); }
    if (controls) controls.style.display = enabled ? 'flex' : 'none';
  }

  function init() {
    ctx = document.getElementById('game').getContext('2d');
    // the editor's bitmap is allocated only when its tab opens (setEditorBitmap)
    var edInit = document.getElementById('editor');
    if (edInit) { edInit.width = 0; edInit.height = 0; }
    ectx = null;
    io = document.getElementById('io');

    var game = document.getElementById('game');
    game.onmousedown = function () { if (activeTab === 'play') pressJump(); };
    game.onmouseup = releaseJump;
    game.addEventListener('touchstart', function (e) { e.preventDefault(); if (activeTab === 'play') pressJump(); }, { passive: false });
    game.addEventListener('touchend', function (e) { e.preventDefault(); releaseJump(); }, { passive: false });
    bind('hold', pressJump, releaseJump);
    bind('move-left', function () { leftHeld = true; }, function () { leftHeld = false; });
    bind('move-right', function () { rightHeld = true; }, function () { rightHeld = false; });

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
    click('btn-platformer', function () { LEVEL.platformer = !LEVEL.platformer; LEVEL.touch(); demoActive = false; syncPlatformerUI(); resetRun(); status = 'ready'; dirty = true; flash('Platformer Mode ' + (LEVEL.platformer ? 'enabled' : 'disabled') + '.'); });
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
    click('set-noclip', function () { showNoclip = !showNoclip; syncSettings(); });
    click('set-hitboxes', function () { showHitboxes = !showHitboxes; syncSettings(); });
    click('set-clear-assets', function () { clearAssetCaches(); syncSettings(); });
    // graphics tier: switching reloads the page, because the atlas table is read at startup
    var qb = document.getElementById('set-quality');
    if (qb) {
      var tierLabel = { sd: 'LOW', hd: 'HIGH', none: 'NONE AT ALL' };
      qb.textContent = 'GRAPHICS: ' + (tierLabel[window.RR_TIER] || 'LOW');
      qb.onclick = function () {
        var cycle = { sd: 'hd', hd: 'none', none: 'sd' };
        var next = cycle[window.RR_TIER] || 'sd';
        try { localStorage.setItem('rr_tier', next); } catch (e) { flash('Graphics setting could not be saved.'); return; }
        location.reload();
      };
    }
    click('set-percent', function () { showPercent = !showPercent; syncSettings(); });
    syncSettings();
    syncPlatformerUI();

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
    window.RRDebug = {
      advanceFrame: advanceFrame, startDemo: startDemo, resetRun: resetRun, clearAssets: clearAssetCaches,
      startPlay: function () { resetRun(); status = 'ready'; }, pressJump: pressJump, releaseJump: releaseJump,
      getStatus: function () { return status; }, getPlayer: function () { return p; }, getPlayer2: function () { return p2; },
      groupInfo: function (g) { return groupInfo([g]); }, getGroupState: function () { return groupState; },
      getVisibleCount: function () { return visibleObjs(p ? p.x : 0).length; },
      camState: function () { return { zoom: camZoom, offX: camOffX, offY: camOffY, locked: camLocked, camX: camWorldX, camY: playCamY, angle: camAngle, edge: Object.assign({}, cameraEdges), freeMode: freeCameraMode, dirSign: playerNow() ? playerNow().dirSign : 1 }; },
      fxState: function () { return Object.assign({}, fx, { tweens: fxTweens.length }); },
      emitGameplayEvent: emitGameplayEvent, getCheckpoint: function () { return checkpointState ? Object.assign({}, checkpointState) : null; },
      getLevel: function () { return LEVEL; }, setLevel: function (l) { LEVEL = l; levelIsDefault = false; snapshotPalette(); },
      // test hook: read/park the play camera Y (screen px, reference _cameraY semantics)
      getCamY: function () { return playCamY; }, setCamY: function (v) { playCamY = v; dirty = true; },
      // test hook: mirror flip progress and fly band state (reference _mirrorP / _groundTargetValue)
      getMirrorP: function () { return mirrorProgress(); },
      getFlyBand: function () { return { on: flyBand.on, value: flyBand.value, spanPx: flyBand.spanPx }; },
      toggleMirror: function (on) { toggleMirror(on); },
      endX: endX, setTab: setTab, doImport: doImport, loadLevel: loadLevel, levels: LEVELS,
      setTool: function (i) { toolIndex = i; }, tools: TOOLS, selection: function () { return selection; },
      selectRect: selectRect, deleteSelection: deleteSelection, copySelection: copySelection, pasteAt: pasteAt,
      undo: undo, redo: redo, coinsGot: function () { return coinsGot; },
      // test hook: park the simulation and look at any spot of the level. Triggers are
      // fast-forwarded to the parked x so colour / move states match a real run there.
      freezeAt: function (x, y, flip) {
        // Rebuild trigger state by walking from the beginning. The previous helper set
        // p.x to the requested destination before entering this loop, so its p.x >= x
        // guard exited immediately and never replayed move/rotate/toggle/spawn triggers.
        frozen = true; status = 'play'; holding = false; pressQueued = false;
        restorePalette();                       // colour triggers must replay from the header palette
        if (p) { p.x = 0; p.y = y; p.vy = 0; p.rot = 0; p.flip = !!flip; p.mode = 'cube'; p.dead = false; p2 = null; }
        startTriggers();
        if (p) {
          var guard = 0;
          while (guard++ < 20000) {
            // sweep across the step so crossing triggers (move/colour/shader) fire like a live run
            var nx = Math.min(x, p.x + p.speed * 0.9);
            triggerSweep = { from: p.x, to: nx, y: p.y, dir: p.dirSign || 1 };
            p.x = nx;
            frameNo++;
            processTriggers(); processColourTriggers(); tickTweens(); tickCamera(); stepShaders(1 / 60);
            if (!p || p.dead || p.x >= x) break;
          }
          if (p) p.x = x;
          GameSim.refreshDyn(LEVEL.sim(), groupInfo);
          lastDynLevel = LEVEL.sim(); dynDirty = false;
        }
        // parked-camera hook: sync the camera-delta accumulators so the background phase matches
        // a real run that travelled to this x (no mirror assumed while parking)
        bgScrollPx = 2 * (p ? p.x : 0); prevCamPx = bgScrollPx;
        mirAnim.animating = false; mirAnim.p = mirAnim.to;
        updatePlayCamera(true); dirty = true;
      },
      setFrozen: function (v) { frozen = !!v; },
      // parked run: teleport to (x0,y0) mid-attempt WITHOUT resetting accumulated visual state
      // (mirror progress, bg scroll, ground shift), then noclip-walk to x1 — for A/B captures
      runFrom: function (x0, y0, x1) {
        GameSim.setNoclip(true);
        frozen = false; holding = false; pressQueued = false;
        if (status !== 'play') status = 'play';
        if (p) { p.x = x0; p.y = y0; p.vy = 0; p.rot = 0; p.dead = false; }
        var guard = 0;
        while (guard++ < 80000 && p && p.x < x1) {
          advanceFrame();
          if (status === 'dead' && p) {
            p.dead = false; p.vy = 0; p.y = Math.min(Math.max(p.y, 120), 900); status = 'play';
          }
          if (status === 'won') break;
        }
        frozen = true;
        GameSim.setNoclip(false);
        updatePlayCamera(true); dirty = true;
        return { x: p && p.x, y: p && p.y, mode: p && p.mode, flip: p && p.flip };
      },
      // test hooks: force the camera-delta accumulators (pattern phase alignment for A/B shots)
      setBgScroll: function (px) { bgScrollPx = px; prevCamPx = 2 * (p ? p.x : 0); },
      setGroundShift: function (px) { groundShiftPx = px; dirty = true; },
      // real-run parking: noclip walk from the level start, one real sim frame at a time,
      // so colour tweens / move / spawn triggers progress exactly like an actual attempt.
      // opt.record: return the per-frame (x2px, y2px, mode, flip) trajectory for A/B tracing
      setNoclip: function (v) { GameSim.setNoclip(!!v); },
      runTo: function (x, opt) {
        var rec = [];
        GameSim.setNoclip(true);
        frozen = false; holding = false; pressQueued = false;
        resetRun(); status = 'play';
        var guard = 0;
        while (guard++ < 80000 && p && p.x < x) {
          advanceFrame();
          if (opt && opt.record) rec.push([+(p.x * 2).toFixed(2), +(p.y * 2).toFixed(2), p.mode, p.flip ? 1 : 0]);
          if (status === 'dead' && p) {         // noclip only skips collisions; out-of-bounds still resets
            p.dead = false; p.vy = 0; p.y = Math.min(Math.max(p.y, 120), 900); status = 'play';
          }
          if (status === 'won') break;
        }
        frozen = true;
        GameSim.setNoclip(false);
        updatePlayCamera(true); dirty = true;
        return { x: p && p.x, y: p && p.y, mode: p && p.mode, flip: p && p.flip, traj: rec };
      },
      triggerColour: startTriggers
    };

    setTab('play');
    dirty = true;
    window.requestAnimationFrame(function (t) { lastNow = t; loop(t); });
  }

  init();
})();
