// Rhythm Runner physics v5. Units: GD 1x (cell = 30). Frame = 1/60 s, 4 substeps per frame.
// Ported from web-dashers (player.js, level.js, game-scene.js). Canvas-friendly 2.2 gameplay triggers are applied by game.js.
var GameSim = (function () {
  // debug noclip: hazards / deadly solid sides / deadly slopes stop killing (landings still work)
  var NOCLIP = false;
  function setNoclip(v) { NOCLIP = !!v; }
  var C = {
    CELL: 30, HALF: 15, INNER: 4.5,
    SPIKE_HW: 3, SPIKE_HH: 6,
    D: 0.9,                 // reference `d`: vertical and horizontal time scale
    ROT_DUR: 0.39 / 0.9,    // seconds for the 180 deg spin
    SNAP: 10,               // step-up / slope snap distance
    PAD_H: 6,               // pad height
    ORB_R: 20,              // orb activation half-size
    COIN_R: 12,             // coin pickup half-size
    PORTAL_H: 90,           // portals are 3 cells tall
    EPS: 1e-6
  };

  // Speed portal values (1x; reference SpeedPortal / 2)
  var SPEED = { HALF: 4.6511127, ONE: 5.770002, TWO: 7.17444693, THREE: 8.66666967, FOUR: 10.66667036 };
  // Web Dashers changes horizontal speed at a speed portal, but gravity and jump
  // impulses remain constant. These are reference 2x values expressed in this
  // prototype's 1x physics units.
  function speedConsts(v) {
    return { grav: 0.958199, yStart: 11.180032 };
  }

  function gdTrunc(v) {
    var i = Math.trunc(v);
    return i + Math.trunc((v - i) * 1000) / 1000;
  }
  function overlaps(l, r, b, t, o) { return r > o.x0 && l < o.x1 && t > o.y0 && b < o.y1; }

  // ---- oriented/rotated colliders (reference _rotatedRectanglesOverlap + sweep clip) ----
  // An axis-aligned player box (half PH) vs a rotated box (centre cx,cy, full w,h, degrees).
  function rotOverlap(cx, cy, w, h, rotDeg, px, py, PH) {
    var rad = rotDeg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    var dx = px - cx, dy = py - cy;
    var eu = w / 2 + PH * (Math.abs(c) + Math.abs(s));
    var ev = h / 2 + PH * (Math.abs(c) + Math.abs(s));
    return Math.abs(dx * c - dy * s) <= eu && Math.abs(dx * s + dy * c) <= ev;
  }
  // sweep: player box moving from (px0,py0) to (px1,py1) through the rotated box
  function rotSweep(cx, cy, w, h, rotDeg, px0, py0, px1, py1, PH) {
    var rad = rotDeg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    var eu = w / 2 + PH * (Math.abs(c) + Math.abs(s));
    var ev = h / 2 + PH * (Math.abs(c) + Math.abs(s));
    var su = (px0 - cx) * c - (py0 - cy) * s, sv = (px0 - cx) * s + (py0 - cy) * c;
    var eu1 = (px1 - cx) * c - (py1 - cy) * s, ev1 = (px1 - cx) * s + (py1 - cy) * c;
    var du = eu1 - su, dv = ev1 - sv;
    var t0 = 0, t1 = 1;
    var ax = Math.abs(du) < 1e-9, ay = Math.abs(dv) < 1e-9;
    if (ax) { if (su < -eu || su > eu) return false; }
    else {
      var ta = (-eu - su) / du, tb = (eu - su) / du;
      if (ta > tb) { var tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    if (ay) { if (sv < -ev || sv > ev) return false; }
    else {
      var tc = (-ev - sv) / dv, td = (ev - sv) / dv;
      if (tc > td) { var tmp2 = tc; tc = td; td = tmp2; }
      if (tc > t0) t0 = tc; if (td < t1) t1 = td;
      if (t0 > t1) return false;
    }
    return true;
  }

  // Column index: each object is listed in every 30-unit column its x-range covers.
  // Collision then only looks at the player's columns instead of the whole level.
  function bbox(o) {
    if (o.x0 !== undefined) return { x0: o.x0, x1: o.x1 };
    if (o.w !== undefined) return { x0: o.cx - o.w / 2, x1: o.cx + o.w / 2 };
    var r = o.r !== undefined ? o.r : (o.R !== undefined ? o.R : 20);
    return { x0: o.cx - r, x1: o.cx + r };
  }
  function buildGrids(lv) {
    var keys = ['spikes', 'portals', 'speeds', 'pads', 'orbs', 'coins', 'slopes', 'solids', 'breakables'];
    var g = {}, k, i, j;
    for (k = 0; k < keys.length; k++) {
      var arr = lv[keys[k]] || [];
      var grid = { cols: {}, stamp: 0 }, ground = [];
      for (i = 0; i < arr.length; i++) {
        var o = arr[i];
        o._id = i; o._s = 0;
        var b = bbox(o);
        if (b.x0 < -1e8) { ground.push(o); continue; }
        var c0 = Math.floor(b.x0 / 30), c1 = Math.floor((b.x1 - 1e-6) / 30);
        for (j = c0; j <= c1; j++) {
          if (!grid.cols[j]) grid.cols[j] = [];
          grid.cols[j].push(o);
        }
      }
      grid.ground = ground;
      g[keys[k]] = grid;
    }
    g.ground = g.solids.ground;
    lv.g = g;
    return g;
  }
  // Grouped objects are re-placed every frame. Translation first (group offset), then the
  // centre-group orbit (rigid move of the whole object about the pivot), like the renderer.
  // Plain solids and slopes are axis-aligned rectangles / lines in the narrow phase, so they
  // are only ever moved rigidly: their shape is never changed by a group rotation (a rotated
  // rectangle has no exact axis-aligned form, and the old envelope wrongly grew platforms,
  // sealed corridors and dropped ground). Centred shapes (spikes, portals, orbs) keep their
  // oriented test and get a conservative envelope for broad-phase only.
  function orbitCentre(cx, cy, inf) {
    var ox = cx - inf.pivot.x, oy = cy - inf.pivot.y;
    var c = Math.cos(inf.rotation), sn = Math.sin(inf.rotation);
    return { x: inf.pivot.x + ox * c + oy * sn, y: inf.pivot.y - ox * sn + oy * c };
  }
  function wrap(b, inf) {
    var w = {}, k;
    for (k in b) w[k] = b[k];
    var dx = inf.dx || 0, dy = inf.dy || 0;
    var angle = inf.rotation || 0;
    var pivotOn = !!(angle && inf.centerGroup > 0 && inf.pivot);
    var rectOnly = w.x0 !== undefined && w.x1 !== undefined && w.y0 !== undefined && w.y1 !== undefined &&
      w.cx === undefined && w.w === undefined;
    if (rectOnly) {
      var ocx = (b.x0 + b.x1) / 2, ocy = (b.y0 + b.y1) / 2;
      var ncx = ocx + dx, ncy = ocy + dy;
      if (pivotOn) { var oc = orbitCentre(ncx, ncy, inf); ncx = oc.x; ncy = oc.y; }
      var ddx = ncx - ocx, ddy = ncy - ocy;
      w.x0 = b.x0 + ddx; w.x1 = b.x1 + ddx; w.y0 = b.y0 + ddy; w.y1 = b.y1 + ddy;
    } else {
      var rect = w.x0 !== undefined && w.x1 !== undefined && w.y0 !== undefined && w.y1 !== undefined;
      var rw, rh, cx, cy;
      if (rect) { rw = w.x1 - w.x0; rh = w.y1 - w.y0; }
      if (w.cx !== undefined && w.cy !== undefined) { cx = w.cx + dx; cy = w.cy + dy; }
      else if (rect) { cx = (w.x0 + w.x1) / 2 + dx; cy = (w.y0 + w.y1) / 2 + dy; }
      if (cx !== undefined && pivotOn) { var o2 = orbitCentre(cx, cy, inf); cx = o2.x; cy = o2.y; }
      // local orientation (hazards, portals, direction-sensitive orbs) turns with the group unless locked
      var localRotation = angle && (!inf.centerGroup || (inf.pivot && !inf.lockRotation)) ? angle : 0;
      if (w.rot !== undefined && localRotation) w.rot += localRotation * 180 / Math.PI;
      if (cx !== undefined) {
        w.cx = cx; w.cy = cy;
        if (rect || (w.w !== undefined && w.h !== undefined)) {
          var baseW = w.w !== undefined ? w.w : rw, baseH = w.h !== undefined ? w.h : rh;
          var a = w.rot !== undefined ? w.rot * Math.PI / 180 : localRotation;
          var ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
          var ex = (baseW * ca + baseH * sa) / 2, ey = (baseW * sa + baseH * ca) / 2;
          w.x0 = cx - ex; w.x1 = cx + ex; w.y0 = cy - ey; w.y1 = cy + ey;
        }
      }
    }
    if (w.target !== undefined) w.target += dy;
    w._s = 0;
    return w;
  }
  function refreshDyn(lv, info) {
    var keys = ['solids', 'spikes', 'portals', 'speeds', 'pads', 'orbs', 'slopes', 'coins', 'breakables'];
    var base = lv.dynBase || {}, dyn = {}, k, i;
    for (k = 0; k < keys.length; k++) {
      var src = base[keys[k]] || [], arr = [];
      for (i = 0; i < src.length; i++) {
        var b = src[i], inf = info(b.groups || []) || {};
        var changed = !!(inf.hidden || inf.dx || inf.dy || inf.rotation);
        b._aff = changed;
        if (changed && !inf.hidden) arr.push(wrap(b, inf));
      }
      dyn[keys[k]] = arr;
    }
    lv.dyn = dyn;
  }
  var NO_DYN = { solids: [], spikes: [], portals: [], speeds: [], pads: [], orbs: [], slopes: [], coins: [], breakables: [] };
  // candidate lists are refilled into shared scratch arrays (collide and the spider search use them
  // only within the same call, so reuse is safe and avoids one allocation per list per substep)
  var SC = { spikes: [], portals: [], speeds: [], pads: [], orbs: [], coins: [], slopes: [], solids: [] };
  function clr(arr) { arr.length = 0; return arr; }
  function gridInto(out, grid, a, b) {
    var c0 = Math.floor(a / 30), c1 = Math.floor(b / 30), c, arr, j, o;
    grid.stamp++;
    for (c = c0; c <= c1; c++) {
      arr = grid.cols[c];
      if (!arr) continue;
      for (j = 0; j < arr.length; j++) {
        o = arr[j];
        if (o._s !== grid.stamp) { o._s = grid.stamp; if (!o._aff) out.push(o); }
      }
    }
    return out;
  }
  function dynInto(out, list, a, b) {
    if (!list) return out;
    var i, o, x0, x1;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (o.x0 !== undefined) { x0 = o.x0; x1 = o.x1; }
      else if (o.w !== undefined) { x0 = o.cx - o.w / 2; x1 = o.cx + o.w / 2; }
      else { var r = o.r !== undefined ? o.r : (o.R !== undefined ? o.R : 20); x0 = o.cx - r; x1 = o.cx + r; }
      if (x1 > a && x0 < b) out.push(o);
    }
    return out;
  }
  function dynF(list, a, b) {
    var out = [], i, o, bb;
    if (!list) return out;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      bb = bbox(o);
      if (bb.x1 > a && bb.x0 < b) out.push(o);
    }
    return out;
  }

  function cand(grid, a, b) {
    var out = [], c0 = Math.floor(a / 30), c1 = Math.floor(b / 30), c, arr, j, o;
    grid.stamp++;
    for (c = c0; c <= c1; c++) {
      arr = grid.cols[c];
      if (!arr) continue;
      for (j = 0; j < arr.length; j++) {
        o = arr[j];
        if (o._s !== grid.stamp) { o._s = grid.stamp; if (!o._aff) out.push(o); }
      }
    }
    return out;
  }

  function newPlayer(x, y, mode) {
    var sc = speedConsts(SPEED.ONE);
    return {
      x: x, y: y, lastY: y, lastX: x, vx: 0, vy: 0,
      rot: 0, mode: mode, flip: false, mirrored: false,
      speed: SPEED.ONE, grav: sc.grav, gravityScale: 1, yStart: sc.yStart,
      onGround: false, canJump: true, isJumping: false, onSlope: false,
      rotActive: false, rotStart: 0, rotTotal: 0, rotTime: 0,
      gdAccel: false,
      stopMoveUntilRelease: false, freeModeCamera: false,
      portalIdx: -1, portalSet: null, speedIdx: -1, padIdx: -1, orbIdx: -1, orbHoldUsed: false, orbUsed: null,
      portalFired: {}, tpIgnore: true,          // portals fire once per attempt; teleports ignored until clear (reference reset)
      ballOpp: false, ballNormal: 1, ballHitPad: false, tickN: 0, lastBluePad: -1e9,
      dashing: false, dashVy: 0, pendingVelocity: null, dirSign: 1,
      half: C.HALF, inner: C.INNER, isMini: false,
      robotAccel: 0, robotHold: false, robotHoldTimer: 0,
      onCeiling: false,
      dead: false
    };
  }

  function gravityStrength(p) { return p.grav * (p.gravityScale === undefined ? 1 : p.gravityScale); }
  function setSpeed(p, v) { var sc = speedConsts(v); p.speed = v; p.grav = sc.grav; p.yStart = sc.yStart; }

  // mini portals: shrink (101) / grow (99). Hitbox half 9 instead of 15.
  function setMini(p, on) {
    if (p.isMini === on) return;
    var old = p.half;
    p.isMini = on;
    p.half = on ? 9 : C.HALF;
    // The reference keeps the solid-side inner collision radius fixed when mini.
    p.inner = C.INNER;
    if (p.onGround) p.y += p.half - old;
    else if (p.onCeiling) p.y -= p.half - old;
  }
  function setMirror(p, on) { p.mirrored = on; }

  function flipMod(p) { return p.flip ? -1 : 1; }
  // Web Dashers playerIsFalling() is yVelocity < p (or > p when flipped),
  // with p = 1.916398. This engine stores velocity in 1x reference units.
  var FALL_THRESHOLD = 0.958199;
  function falling(p) { return p.flip ? p.vy > FALL_THRESHOLD : p.vy < FALL_THRESHOLD; }
  function fallingPastThreshold(p) { return falling(p); }

  function startRotate(p, dir) {
    p.rotActive = true; p.rotTime = 0; p.rotStart = p.rot;
    p.rotTotal = Math.PI * flipMod(p) * dir;
  }

  // gravity portals (reference portal_gravity_*): a ball rolls the opposite way until it lands
  function gravityPortal(p, flipped, mult) {
    if (p.mode === 'ball') p.ballOpp = true;
    flipGravity(p, flipped, mult);
  }
  function flipGravity(p, flipped, mult) {
    if (p.flip === flipped) return;
    p.flip = flipped;
    p.vy *= (mult === undefined ? 0.5 : mult);
    p.onGround = false;
    p.onCeiling = false;
    p.canJump = false;
  }

  // ---- mode physics (once per substep, dt = sub * D) ----

  function cubeJump(p, dt, hold) {
    var flip = flipMod(p);
    if (p.canJump && hold) {
      p.vy = gdTrunc(flip * p.yStart * (p.isMini ? 0.8 : 1));
      p.onGround = false; p.canJump = false; p.isJumping = true;
      startRotate(p, 1);
      return;
    }
    if (p.isJumping) {
      p.vy = gdTrunc(p.vy - gravityStrength(p) * dt * flip);
      if (falling(p)) { p.isJumping = false; p.onGround = false; }
    } else {
      if (falling(p)) p.canJump = false;
      p.vy = gdTrunc(p.vy - gravityStrength(p) * dt * flip);
      if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
      if (fallingPastThreshold(p) && !p.rotActive) startRotate(p, 1);
    }
  }

  function shipFly(p, dt, hold) {
    var flip = flipMod(p);
    var miniScale = p.isMini ? 1.176470588 : 1;
    var mult = hold ? -1 : (falling(p) ? 0.8 : 1.2);
    var factor = hold && falling(p) ? 0.5 : 0.4;
    p.vy -= gravityStrength(p) * dt * flip * mult * factor * miniScale;
    if (hold) p.onGround = false;
    if (!p.wasBoosted) {
      if (p.flip) {
        p.vy = Math.max(p.vy, -8 * miniScale);
        p.vy = Math.min(p.vy, 6.4 * miniScale);
      } else {
        p.vy = Math.max(p.vy, -6.4 * miniScale);
        p.vy = Math.min(p.vy, 8 * miniScale);
      }
    }
  }

  function ufoJump(p, dt, pressed, hold) {
    var flip = flipMod(p);
    var mini = p.isMini;
    var jump = mini ? 6.648 : 6.871;
    var upVel = p.vy * flip;
    var grav = upVel > 1.916398 ? (mini ? 0.634524 : 0.540121) : (mini ? 0.421624 : 0.359973);
    p.vy -= gravityStrength(p) * grav * dt * flip;
    if (pressed) {
      p.vy = jump * flip;
      p.onGround = false; p.canJump = false; p.isJumping = true;
    }
    if (!p.wasBoosted) {
      var maxUp = (mini ? 18.824 : 16) / 2;
      var maxFall = (mini ? 15.058 : 12.8) / 2;
      if (p.flip) {
        p.vy = Math.max(p.vy, -maxUp);
        p.vy = Math.min(p.vy, maxFall);
      } else {
        p.vy = Math.max(p.vy, -maxFall);
        p.vy = Math.min(p.vy, maxUp);
      }
    }
    if (hold) p.onGround = false;
    if (falling(p)) p.isJumping = false;
  }

  function ballJump(p, dt, pressed) {
    var flip = flipMod(p);
    if (pressed && p.canJump) {
      p.vy = gdTrunc(flip * p.yStart * (p.isMini ? 0.8 : 1));
      flipGravity(p, !p.flip, 0.5);
      p.onGround = false; p.canJump = false;
      p.vy *= 0.6;
      return;
    }
    if (falling(p)) p.canJump = false;
    p.vy = gdTrunc(p.vy - 0.6 * gravityStrength(p) * dt * flip);
    if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
  }

  // spider: gravity at 0.6x, movement comes from teleports on press
  function spiderFall(p, dt) {
    var flip = flipMod(p);
    if (falling(p)) p.canJump = false;
    p.vy = gdTrunc(p.vy - 0.6 * gravityStrength(p) * dt * flip * (p.isMini ? 1.4 : 1));
    if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
    if (fallingPastThreshold(p)) p.onGround = false;
  }

  // Robot jump/hold timings and gravity multipliers from Web Dashers.
  function robotJump(p, dt, hold, pressed) {
    var flip = flipMod(p);
    var miniScale = p.isMini ? 1 / 1.2 : 1;
    var jumpInit = 5.125 * miniScale;
    var holdMax = 15.8;
    var holdForce = gravityStrength(p) * 0.2 * miniScale;
    var gravityHold = gravityStrength(p) * 0.15;
    var gravityFall = gravityStrength(p) * 0.81;
    var maxFall = 14;
    var maxRise = 15 * miniScale;
    if (pressed && p.canJump) {
      p.isJumping = true; p.onGround = false; p.canJump = false;
      p.vy = gdTrunc(flip * jumpInit);
      p.robotHold = true; p.robotHoldTimer = 0;
      return;
    }
    if (p.isJumping) {
      if (p.robotHold) {
        p.robotHoldTimer += dt;
        if (p.robotHoldTimer >= holdMax || !hold) {
          p.robotHold = false;
          var goingUp = p.flip ? p.vy < 0 : p.vy > 0;
          if (goingUp) p.vy *= 0.9;
        } else {
          p.vy += flip * holdForce * dt;
        }
      }
      p.vy -= (p.robotHold ? gravityHold : gravityFall) * dt * flip;
      if (falling(p)) { p.isJumping = false; p.robotHold = false; }
    } else {
      p.vy -= gravityFall * dt * flip;
    }
    if (p.flip) { p.vy = Math.min(p.vy, maxRise); p.vy = Math.max(p.vy, -maxFall); }
    else { p.vy = Math.max(p.vy, -maxRise); p.vy = Math.min(p.vy, maxFall); }
    if (falling(p)) p.canJump = false;
  }

  // Swing (ported from the Lollipop mod, _updateSwingJump). A press flips gravity and skips the
  // gravity update of that substep; otherwise gravity is 0.4*grav with the velocity capped at 6.5 (13 at 2x).
  function swingMove(p, dt) {
    var flip = flipMod(p);
    if (p.swingSkip) { p.swingSkip = false; return; }
    if (falling(p)) p.canJump = false;
    p.vy = p.vy - 0.4 * gravityStrength(p) * dt * flip;
    if (p.isJumping) {
      if (falling(p)) { p.isJumping = false; p.onGround = false; }
    } else {
      if (p.flip) p.vy = Math.min(p.vy, 6.5); else p.vy = Math.max(p.vy, -6.5);
    }
  }

  function waveMove(p, hold) {
    var baseSpeed = p.isMini ? 11.3860036 : 5.6930018;
    var speedMod = p.speed / SPEED.ONE;
    var vel = (hold ? 1 : -1) * flipMod(p) * baseSpeed * speedMod;
    if (p.onGround || p.onCeiling) {
      var awayFromCeiling = p.onCeiling && !hold;
      var awayFromFloor = p.onGround && hold;
      if (awayFromCeiling || awayFromFloor) {
        p.onGround = false;
        p.onCeiling = false;
      } else {
        vel = 0;
      }
    }
    p.vy = vel;
    p.canJump = false;
    p.isJumping = false;
    var angle = p.isMini ? Math.atan(0.5) : Math.PI / 4;
    p.rot = vel === 0 ? 0 : (vel > 0 ? -angle : angle);
  }

  // ---- press-edge actions ----

  // spider teleport (reference _findSpiderTeleportSurface): nearest solid in the gravity direction,
  // with the fly bounds ceiling / floor as the fallback surface
  function spiderTeleport(p, lv, out) {
    var goingUp = !p.flip;
    var xPad = Math.max(4.5, p.half - 2.5);
    var startY = p.y, best = null, i, s;
    var D = lv.dyn || NO_DYN;
    var aS = lv.g.ground.concat(cand(lv.g.solids, p.x - xPad, p.x + xPad), dynF(D.solids, p.x - xPad, p.x + xPad));
    var aSp = cand(lv.g.spikes, p.x - xPad, p.x + xPad).concat(dynF(D.spikes, p.x - xPad, p.x + xPad));
    if (goingUp) {
      if (p.flyCeil !== null && p.flyCeil !== undefined && p.flyCeil > startY + 0.5) best = p.flyCeil;
    } else {
      if (p.flyFloor !== null && p.flyFloor !== undefined && p.flyFloor < startY - 0.5) best = p.flyFloor;
    }
    for (i = 0; i < aS.length; i++) {
      s = aS[i];
      if (!(p.x + xPad > s.x0 && p.x - xPad < s.x1)) continue;
      if (goingUp) {
        if (s.y0 > startY + 0.5 && (best === null || s.y0 < best)) best = s.y0;
      } else {
        if (s.y1 < startY - 0.5 && (best === null || s.y1 > best)) best = s.y1;
      }
    }
    if (best !== null) {
      var landY = goingUp ? best - p.half : best + p.half;
      var lo = Math.min(startY, landY) - xPad, hi = Math.max(startY, landY) + xPad;
      for (i = 0; i < aSp.length; i++) {
        s = aSp[i];
        if (p.x + xPad <= s.x0 || p.x - xPad >= s.x1) continue;
        if (s.y1 < lo || s.y0 > hi) continue;
        if (!NOCLIP) { p.dead = true; out.died = true; return; }
      }
      p.y = landY; p.lastY = landY;
      p.flip = goingUp;
      p.vy = 0; p.onGround = true; p.canJump = true; p.isJumping = false;
      startRotate(p, 1);
    } else {
      p.flip = goingUp;
      p.vy = 0; p.onGround = false; p.canJump = false; p.isJumping = false;
      startRotate(p, 1);
    }
  }

  function onPress(p, lv, out) {
    var flip = flipMod(p);
    if (p.mode === 'spider') {
      if (p.canJump || p.onGround || p.onCeiling) spiderTeleport(p, lv, out);
    } else if (p.mode === 'swing') {
      flipGravity(p, !p.flip, 1.0);
      p.onGround = false; p.canJump = false; p.isJumping = false;
      p.swingSkip = true;
    }
  }

  // Dash orb (reference 1704 / 1751 branch): the orb's rotation property picks the dash angle.
  // Speed 18 in the 2x reference units, so 9 here; the vertical part is clamped to sin(70 deg).
  function applyDashOrb(p, id, rot) {
    var rad = (rot || 0) * Math.PI / 180;
    var sin = -Math.sin(rad);
    var maxSin = Math.sin(70 * Math.PI / 180);
    if (sin > maxSin) sin = maxSin; else if (sin < -maxSin) sin = -maxSin;
    var velY = sin * 9 * flipMod(p);          // computed in the gravity frame BEFORE the flip
    if (id === 1751) flipGravity(p, !p.flip);  // blue dash orb flips gravity (reference default 0.5)
    p.dashing = true;
    p.dashVy = velY;
    p.vy = gdTrunc(velY);
    p.onGround = false; p.canJump = false; p.isJumping = false;
    if (p.mode === 'cube') startRotate(p, 1);
  }

  function applyOrb(p, id, rot) {
    // The custom green ring (1594) only reverses gravity; it does not add an orb impulse.
    if (id === 1594) { flipGravity(p, !p.flip); return; }
    if (id === 1704 || id === 1751) { applyDashOrb(p, id, rot); return; }
    var fm = flipMod(p), yS = p.yStart;
    var isShip = p.mode === 'ship', isUfo = p.mode === 'ufo', isBall = p.mode === 'ball';
    var isSpider = p.mode === 'spider', isRobot = p.mode === 'robot';
    var mini = p.isMini ? 0.8 : 1;
    if (p.mode === 'swing') {
      var sb = yS * 0.6;
      if (id === 1330) { p.vy = gdTrunc(-14); }
      else if (id === 141) { p.vy = gdTrunc(fm * sb * 0.72); }
      else if (id === 1333) { p.vy = gdTrunc(fm * sb * 1.38); }
      else if (id === 84) { p.vy = gdTrunc(fm * sb * 0.4); flipGravity(p, !p.flip); }   // reference flipGravity default halves vy
      else if (id === 1022) { p.vy = gdTrunc(fm * (-yS * 0.7)); flipGravity(p, !p.flip); }
      else { p.vy = gdTrunc(fm * sb); }
      p.onGround = false; p.canJump = false; p.isJumping = true;
      return;
    }
    if (p.mode === 'wave') {
      if (id === 84 || id === 1022) flipGravity(p, !p.flip);   // reference default (0.5); wave overwrites vy each tick
      return;
    }
    var vel = 0, flipBefore = false, flipAfter = false;
    if (isShip) {
      if (id === 36) vel = 8;
      else if (id === 141) vel = yS * 0.37;
      else if (id === 1333) vel = yS;
      else if (id === 84) { vel = yS * 0.4; flipAfter = true; }          // reference flying: cubeJump*0.4, flip halves vy (default 0.5)
      else if (id === 1022) { vel = -yS * 0.7; flipAfter = true; }
      else if (id === 1330) vel = -14;
    } else if (isUfo) {
      if (id === 36) vel = (p.isMini ? 17.888 : 22.36) / 2;
      else if (id === 141) vel = (p.isMini ? 7.674 : 9.592) / 2;
      else if (id === 1333) vel = yS * 1.02;
      else if (id === 84) { vel = -(p.isMini ? 7.155 : 8.944); flipAfter = true; }   // reference ufo: (mini?-7.155:-8.944)*2 @2x, flip halves
      else if (id === 1022) { vel = -(p.isMini ? 17.888 : 22.36); flipAfter = true; }
      else if (id === 1330) vel = -11.2;
    } else if (isBall || isSpider) {
      var ballBase = yS * 0.7 * mini;
      if (id === 36) vel = ballBase;
      else if (id === 141) vel = ballBase * 0.77;
      else if (id === 1333) vel = ballBase * 1.34;
      else if (id === 84) { vel = ballBase * 0.4; flipAfter = true; }   // reference: base*0.4, flip halves vy (default 0.5)
      else if (id === 1022) { vel = ballBase * -1.94; flipAfter = true; }
      else if (id === 1330) vel = -15;
    } else if (isRobot) {
      if (id === 36) vel = yS * 0.9;
      else if (id === 141) vel = yS * 0.72;
      else if (id === 1333) vel = yS * 1.28;
      else if (id === 84) { vel = yS * 0.4; flipAfter = true; }          // reference robot: cubeJump*0.4 (no mini), flip halves
      else if (id === 1022) { vel = yS * -1.94; flipAfter = true; }
      else if (id === 1330) vel = -15;
    } else {
      var cubeBase = yS * mini;
      if (id === 36) vel = cubeBase;
      else if (id === 141) vel = cubeBase * 0.72;
      else if (id === 1333) vel = cubeBase * 1.38;
      else if (id === 84) { vel = cubeBase; flipAfter = true; }          // reference cube: full cubeOrbJump, the flip's default 0.5 halves it
      else if (id === 1022) { vel = cubeBase; flipBefore = true; }
      else if (id === 1330) vel = -9;
    }
    if (flipBefore) flipGravity(p, !p.flip, 1.0);
    p.vy = gdTrunc((flipBefore ? flipMod(p) : fm) * vel);
    if (flipAfter) flipGravity(p, !p.flip);     // reference flipGravity default 0.5: blue/gravity orbs launch at half strength
    p.onGround = false; p.canJump = false; p.isJumping = true;
  }

  // Reference pad table (web-dashers jumpPad branch, _grav = 2 folded in, halved to 1x units).
  // The velocity sign uses the gravity frame BEFORE a blue-pad flip; the flip then halves vy.
  // Reference jump-pad branch (player.js). _grav = 2 at 2x units, so the 1x velocity is 16 * bump.
  // Pad 3005 is the spider pad: it snaps to the ceiling or floor and flips gravity without a velocity.
  function applyPad(p, id) {
    var fm = flipMod(p), mini = p.isMini ? 0.8 : 1;
    var BS = p.mode === 'ball' || p.mode === 'spider';
    if (id === 3005) {
      if (!p.flip) { if (p.flyCeil != null) p.y = p.flyCeil - p.half; }
      else if (p.flyFloor != null) p.y = p.flyFloor + p.half;
      flipGravity(p, !p.flip, 1.0);
      p.vy = 0; p.onGround = false; p.canJump = false; p.isJumping = false;
      if (p.mode === 'ball') { var gdS = p.flip ? -1 : 1; p.ballNormal = p.mirrored ? -gdS : gdS; p.ballOpp = p.flip; p.ballHitPad = true; }
      return;
    }
    var vel = 0, flipAfter = id === 67;
    if (p.mode === 'ship') {
      vel = id === 35 ? 16 : id === 140 ? 5.6 : id === 1332 ? 10.08 : 15;
    } else if (p.mode === 'ufo') {
      vel = id === 35 ? (p.isMini ? 12.8 : 8) : id === 140 ? (p.isMini ? 5.1185185 : 6.4) : id === 1332 ? (p.isMini ? 12.8 : 8) : (p.isMini ? 10.24 : 12.8);
    } else if (BS) {
      vel = id === 35 ? 9.6 : id === 140 ? 6.72 : id === 1332 ? 12 : 10;
      vel *= mini;
    } else {
      vel = id === 35 ? 16 : id === 140 ? 10.4 : id === 1332 ? 20 : 15;
      vel *= mini;
    }
    if (p.mode === 'ball') {      // roll flags are set before the gravity pad flips, as in the reference
      var gd = p.flip ? -1 : 1;
      p.ballNormal = p.mirrored ? -gd : gd;
      p.ballOpp = p.flip;
      p.ballHitPad = true;
    }
    p.vy = gdTrunc(fm * vel);
    p.isJumping = true; p.onGround = false; p.canJump = false;
    if (flipAfter) flipGravity(p, !p.flip);     // launch uses the pre-flip direction, then gravity flips
    if (p.mode === 'ship' && id === 35) p.pendingVelocity = fm * 8;
    if (p.mode === 'cube') startRotate(p, 1);
  }

  // ---- rotation ----
  function slerp2D(a, b, t) {
    var ha = a * 0.5, hb = b * 0.5;
    var ca = Math.cos(ha), sa = Math.sin(ha), cb = Math.cos(hb), sb = Math.sin(hb);
    var dot = ca * cb + sa * sb;
    var wa, wb;
    if (dot < 0) { dot = -dot; sb = -sb; cb = -cb; }
    if (1 - dot > 0.0001) {
      var th = Math.acos(dot), st = Math.sin(th);
      wa = Math.sin(th * (1 - t)) / st;
      wb = Math.sin(th * t) / st;
    }
    var out = Math.atan2(sa * wa + sb * wb, ca * wa + cb * wb);
    return out + out;
  }

  function updateRotation(p, sub, dt) {
    if (p.mode === 'cube' || p.mode === 'spider') {
      if (p.rotActive) {
        p.rotTime += sub / 60;
        if (p.rotTime >= C.ROT_DUR) { p.rotActive = false; p.rotTime = C.ROT_DUR; }
        var u = Math.min(p.rotTime / C.ROT_DUR, 1);
        p.rot = p.rotStart + p.rotTotal * u;
      } else if (p.onGround) {
        var target = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2);
        p.rot = slerp2D(p.rot, target, Math.min(sub, 0.9 * 0.525 * sub));
      }
    } else if (p.mode === 'ball') {
      var rollDir = p.ballOpp ? -p.ballNormal : p.ballNormal;
      var airF = p.ballOpp ? 0.27 : 0.35;
      if (p.ballHitPad) airF *= 1.25;
      p.rot += dt / 15 * rollDir * (p.onGround ? 0.48 : airF);
    } else if (p.mode === 'swing') {
      p.rot = slerp2D(p.rot, Math.atan2(-p.vy, p.speed * C.D), Math.min(dt, 0.15 * dt));
    } else if (p.mode === 'ship') {
      // Web Dashers updateShipRotation(): flight angle is based on the reference's
      // fixed horizontal reference speed, not the level's current scroll speed.
      var dy = -2 * (p.y - p.lastY); // simulation y is 1x; Web Dashers player.js uses 2x coordinates
      var dx = sub * 10.3860036;
      if (dx * dx + dy * dy >= sub * 0.6) {
        p.rot = slerp2D(p.rot, Math.atan2(dy, dx), Math.min(sub, 0.15 * sub));
      }
    } else if (p.mode === 'ufo') {
      // Web Dashers keeps the UFO's body upright; only its sprites get a tiny
      // velocity-based tilt in syncSprites(). The renderer applies that tilt.
      p.rot = 0;
    } else if (p.mode === 'wave') {
      // Wave direction is discrete in the reference, not eased toward its angle.
      var wa = p.isMini ? Math.atan(0.5) : Math.PI / 4;
      p.rot = p.vy === 0 ? 0 : (p.vy > 0 ? -wa : wa);
    }
  }

  // ---- slopes ----
  // A slope is a line from (x0, y0 or y1) to (x1, ...). dir 1 rises to the right, -1 to the left.
  // above = false: solid below the line (floor slope). above = true: solid above (ceiling slope).
  function slopeY(s, x) {
    var t = (x - s.x0) / (s.x1 - s.x0);
    return s.dir > 0 ? s.y0 + t * (s.y1 - s.y0) : s.y1 - t * (s.y1 - s.y0);
  }
  // highest (wantMin false) or lowest (wantMin true) line height over [a,b] clamped to the slope; null if none
  function slopeExt(s, a, b, wantMin) {
    var lo = Math.max(a, s.x0), hi = Math.min(b, s.x1);
    if (hi < lo) return null;
    var y1 = slopeY(s, lo), y2 = slopeY(s, hi);
    return wantMin ? Math.min(y1, y2) : Math.max(y1, y2);
  }
  function slopeSlope(s) { return s.dir * (s.y1 - s.y0) / (s.x1 - s.x0); }

  // the solid part of a slope only exists inside its bounding box
  function inBox(s, p, IN) { return p.y + IN > s.y0 && p.y - IN < s.y1; }

  // ---- collision ----
  // Rotated solid (reference rotated Collider): the player is tested in the box's frame. Death uses the inner box;
  // landing uses the face normal, pushed out along it. Returns 1 when the cube dies.
  function collideRotSolid(p, s, flip, H, IN, out) {
    var rad = s.rot * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad);
    var dx = p.x - s.cx, dy = p.y - s.cy;
    var u = dx * c - dy * sn, v = dx * sn + dy * c;
    var hw = s.w / 2, hh = s.h / 2;
    var eu = hw + H, ev = hh + H;
    if (Math.abs(u) >= eu || Math.abs(v) >= ev) return 0;
    var pu = eu - Math.abs(u), pv = ev - Math.abs(v);
    var nu = 0, nv = 0, pen;
    if (pv < pu) { nv = v >= 0 ? 1 : -1; pen = pv; } else { nu = u >= 0 ? 1 : -1; pen = pu; }
    var nx = nu * c + nv * sn, ny = -nu * sn + nv * c;
    var landed = (flip > 0 && ny > 0.7 && p.vy <= 0) || (flip < 0 && ny < -0.7 && p.vy >= 0);
    if (landed) {
      p.x += nx * pen; p.y += ny * pen;
      p.vy = 0; p.onGround = true; p.canJump = true; p.isJumping = false; p.rotActive = false;
      if (p.mode === 'ball') { p.ballOpp = false; p.ballHitPad = false; p.ballNormal = (p.flip ? -1 : 1) * (p.mirrored ? -1 : 1); }
      return 0;
    }
    if (!NOCLIP && Math.abs(u) < hw + IN && Math.abs(v) < hh + IN) { out.died = true; return 1; }
    return 0;
  }
  function collide(p, lv, out, input) {
    var flip = flipMod(p), H = p.half, IN = p.inner;
    var PH = p.mode === 'wave' ? (p.isMini ? 3 : 4.5) : H;
    var L = p.x - H, R = p.x + H, B = p.y - H, T = p.y + H;
    var i, s, hit;
    var G = lv.g, hid;
    var D = lv.dyn || NO_DYN;
    var aSpikes = dynInto(gridInto(clr(SC.spikes), G.spikes, L, R), D.spikes, L, R);
    var aPortals = dynInto(gridInto(clr(SC.portals), G.portals, L, R), D.portals, L, R);
    var aSpeeds = dynInto(gridInto(clr(SC.speeds), G.speeds, L, R), D.speeds, L, R);
    var aPads = dynInto(gridInto(clr(SC.pads), G.pads, L, R), D.pads, L, R);
    var aOrbs = dynInto(gridInto(clr(SC.orbs), G.orbs, L, R), D.orbs, L, R);
    var aCoins = dynInto(gridInto(clr(SC.coins), G.coins, L, R), D.coins, L, R);
    var aSlopes = dynInto(gridInto(clr(SC.slopes), G.slopes, L, R), D.slopes, L, R);
    // ground first, as before (the original list was G.ground.concat(...))
    var aSolids = clr(SC.solids);
    for (i = 0; i < G.ground.length; i++) aSolids.push(G.ground[i]);
    gridInto(aSolids, G.solids, L, R);
    dynInto(aSolids, D.solids, L, R);
    // Electroman's breakable blocks are still platforms: landing on the gravity-facing
    // side is solid, while hitting a side or the underside breaks the block.
    gridInto(aSolids, G.breakables, L, R);
    dynInto(aSolids, D.breakables, L, R);

    // Hazard tests use the full player-size hitbox; Wave has its smaller dedicated hitbox.
    // Solid-side penetration continues to use INNER below.
    // Reference hazard test (player.js checkCollisions): the broad phase compares the player
    // box against the ROTATED ENVELOPE (AABB of the rotated hazard box); circles use a
    // centre-distance test with the same player size. There is no exact-OBB narrow phase.
    for (i = 0; i < aSpikes.length; i++) {
      var hz = aSpikes[i];
      if (hz.r !== undefined) {
        var hdx = p.x - hz.cx, hdy = p.y - hz.cy;
        var hmin = hz.r + PH;
        if (hdx * hdx + hdy * hdy <= hmin * hmin && !NOCLIP) { out.died = true; return; }
      } else if (hz.rot && (hz.cx !== undefined)) {
        var hrad = hz.rot * Math.PI / 180, hc = Math.abs(Math.cos(hrad)), hs = Math.abs(Math.sin(hrad));
        var ehx = hz.w / 2 * hc + hz.h / 2 * hs, ehy = hz.w / 2 * hs + hz.h / 2 * hc;
        if (!NOCLIP && p.x + PH > hz.cx - ehx && p.x - PH < hz.cx + ehx &&
            p.y + PH > hz.cy - ehy && p.y - PH < hz.cy + ehy) { out.died = true; return; }
      } else if (!NOCLIP && overlaps(p.x - PH, p.x + PH, p.y - PH, p.y + PH, hz)) { out.died = true; return; }
    }

    // portals: entry-triggered but ONCE PER ATTEMPT (reference latches _activatedByPlayer until
    // the run restarts, so re-crossing a gravity portal never re-flips). Rotated portals use an
    // oriented-box test plus a sweep from the previous substep position; teleport portals keep
    // their entry hitbox shifted 15 units along the portal's facing axis (baked at build time).
    var newPortals = [];
    var touchingTP = false;
    var lastModePortalY;                        // reference portal.portalY: fly bounds centre on the PORTAL's y
    for (i = 0; i < aPortals.length; i++) {
      var pr = aPortals[i];
      var inPortal = rotOverlap(pr.cx, pr.cy, pr.w, pr.h, pr.rot || 0, p.x, p.y, PH) ||
        rotSweep(pr.cx, pr.cy, pr.w, pr.h, pr.rot || 0, p.lastX, p.lastY, p.x, p.y, PH);
      if (!inPortal) continue;
      if (pr.kind === 'teleport') {
        touchingTP = true;
        if (p.tpIgnore) { p.portalFired[pr._id] = 1; continue; }   // reference: touched teleports latch even while ignored
      }
      if (p.portalFired[pr._id]) continue;
      p.portalFired[pr._id] = 1;
      newPortals.push(pr);
      if (pr.kind !== 'teleport' && pr.kind !== 'gravUp' && pr.kind !== 'gravDown' && pr.kind !== 'gravToggle' &&
          pr.kind !== 'miniOn' && pr.kind !== 'miniOff' && pr.kind !== 'mirrorOn' && pr.kind !== 'mirrorOff' &&
          pr.kind !== 'dualOn' && pr.kind !== 'dualOff') lastModePortalY = pr.cy;
    }
    if (p.tpIgnore && !touchingTP) p.tpIgnore = false;
    if (newPortals.length === 1) {
      out.portal = newPortals[0].kind;
      if (newPortals[0].kind === 'teleport') out.teleportY = newPortals[0].target;
    } else if (newPortals.length > 1) {
      out.portal = [];
      for (i = 0; i < newPortals.length; i++) {
        out.portal.push(newPortals[i].kind);
        if (newPortals[i].kind === 'teleport') out.teleportY = newPortals[i].target;
      }
    }
    if (lastModePortalY !== undefined) out.portalY = lastModePortalY;

    // speed portals
    hit = -1;
    for (i = 0; i < aSpeeds.length; i++) if (overlaps(L, R, B, T, aSpeeds[i])) { hit = i; break; }
    hid = hit >= 0 ? aSpeeds[hit]._id : -1;
    if (hid !== p.speedIdx) { p.speedIdx = hid; if (hit >= 0) out.speed = aSpeeds[hit].value; }

    // pads (fire on contact, latched until left — reference fires regardless of direction)
    hit = -1;
    for (i = 0; i < aPads.length; i++) if (overlaps(L, R, B, T, aPads[i])) { hit = i; break; }
    hid = hit >= 0 ? aPads[hit]._id : -1;
    if (hit >= 0 && hid !== p.padIdx) {
      p.padIdx = hid;
      var pid = aPads[hit].id;
      if (pid !== 67 || p.tickN - p.lastBluePad >= 5) { if (pid === 67) p.lastBluePad = p.tickN; applyPad(p, pid); }
    }
    else if (hit < 0) { p.padIdx = -1; }

    // orbs (reference player.js checkCollisions + _consumeOrbActivationInput):
    //   - a fresh press, or a hold buffered from the press (ground modes only), activates one orb
    //   - orbHoldUsed is the per-press consume flag: one orb per press, re-armed on the next
    //     fresh press (ship / ufo always need that fresh press, never the buffer)
    //   - an activated orb stays used for the rest of the attempt (per-object activation), so a
    //     second press can fire the NEXT orb but never re-fire a spent one
    if (input.pressed) p.orbHoldUsed = false;
    var orbBuffered = p.mode !== 'ship' && p.mode !== 'ufo' && input.hold && !input.pressed && !p.orbHoldUsed;
    if (input.pressed || orbBuffered) {
      if (!p.orbUsed) p.orbUsed = {};
      for (i = 0; i < aOrbs.length; i++) {
        var o = aOrbs[i], OR = o.R !== undefined ? o.R : C.ORB_R;
        if (!p.orbUsed[o._id] && overlaps(L, R, B, T, { x0: o.cx - OR, x1: o.cx + OR, y0: o.cy - OR, y1: o.cy + OR })) {
          p.orbUsed[o._id] = 1;
          p.orbIdx = o._id;
          p.orbHoldUsed = true;
          applyOrb(p, o.id, o.rot);
          break;
        }
      }
    }

    // coins (reported every substep they are touched; the game keeps the set)
    for (i = 0; i < aCoins.length; i++) {
      var c = aCoins[i];
      var CR = c.R !== undefined ? c.R : C.COIN_R;
      if (overlaps(L, R, B, T, { x0: c.cx - CR, x1: c.cx + CR, y0: c.cy - CR, y1: c.cy + CR })) {
        out.coins.push(c._id);
      }
    }

    var wasOnGround = p.onGround, wasOnCeiling = p.onCeiling;
    p.onGround = false;
    p.onCeiling = false;
    var onSlopeNow = false;

    // slopes. A slope stands the player when it is on the side gravity pulls toward.
    for (i = 0; i < aSlopes.length; i++) {
      s = aSlopes[i];
      if (!(R > s.x0 && L < s.x1)) continue;
      if (p.mode === 'wave') {
        var wExt = slopeExt(s, p.x - IN, p.x + IN, s.above);
        if (inBox(s, p, IN) && wExt !== null && (s.above ? p.y + IN > wExt : p.y - IN < wExt) && !NOCLIP) { out.died = true; return; }
        continue;
      }
      var standable = s.above === p.flip;
      if (standable) {
        var ext = slopeExt(s, L, R, s.above);
        if (ext !== null) {
          // reference glues the player onto a continuing slope through crests/troughs
          // (bestSlopeCandidate): while riding, snap to a slope within SNAP above OR below,
          // instead of only touching it from the gravity side. Skipped while a jump is
          // in flight so slope take-offs are not re-stuck to the ground.
          var glue = p.onSlope && !p.isJumping;
          var stands = s.above
            ? (T > ext - 0.001 && T <= ext + C.SNAP && (p.vy >= 0 || p.onSlope)) ||
              (glue && T > ext - C.SNAP && T < ext + C.SNAP)
            : (B < ext + 0.001 && B >= ext - C.SNAP && (p.vy <= 0 || p.onSlope)) ||
              (glue && B < ext + C.SNAP && B >= ext - C.SNAP);
          if (stands) {
            p.y = s.above ? ext - H : ext + H;
            p.vy = p.speed * slopeSlope(s);     // carry the slope into the next substep (and the launch)
            p.onGround = true; p.canJump = true; p.isJumping = false; p.rotActive = false;
            onSlopeNow = true;
            B = p.y - H; T = p.y + H;
            continue;
          }
        }
      }
      // not standing on it: penetration past the inner box is a death
      var iExt = slopeExt(s, p.x - IN, p.x + IN, s.above);
      if (inBox(s, p, IN) && iExt !== null && (s.above ? p.y + IN > iExt : p.y - IN < iExt) && !NOCLIP) { out.died = true; return; }
    }
    p.onSlope = onSlopeNow;

    // solid blocks. The wave lands on tops / ceilings like the other modes (the reference
    // lands a wave touching a surface); only a real side / head hit into the inner box kills it.
    // Reference wave solid size: waveHitSize (4.5 world, mini 3) with gamemodeAddition 0 — the
    // wave rests its small hitbox on the surface, never the cube-size box (p.y = bottom + waveHitSize).
    if (p.mode === 'wave') {
      for (i = 0; i < aSolids.length; i++) {
        s = aSolids[i];
        if (s.ref && s.ref.broken) continue;
        if (!(R > s.x0 && L < s.x1)) continue;
        var wB = p.y - PH, wT = p.y + PH, wLB = p.lastY - PH, wLT = p.lastY + PH;
        var waveFloorRest = wasOnGround && p.vy === 0 && Math.abs(wB - s.y1) <= C.EPS;
        var waveCeilingRest = wasOnCeiling && p.vy === 0 && Math.abs(wT - s.y0) <= C.EPS;
        // A Wave that was already attached to a surface touches it exactly rather than
        // overlapping it. Keep that contact latched; otherwise the next substep forgets
        // onGround/onCeiling and the wave immediately starts moving through the surface.
        if (!(T > s.y0 && B < s.y1) && !waveFloorRest && !waveCeilingRest) continue;
        var wLanded = false, wCeiling = false;
        if (waveFloorRest) {
          wLanded = true;
          p.y = s.y1 + PH;
        } else if (waveCeilingRest) {
          wCeiling = true;
          p.y = s.y0 - PH;
        } else if (flip > 0) {
          wLanded = p.vy <= 0 && wLB >= s.y1 - C.EPS && wB < s.y1;
          wCeiling = p.vy > 0 && wLT <= s.y0 + C.EPS && wT > s.y0;
          if (wLanded) p.y = s.y1 + PH;
          else if (wCeiling) p.y = s.y0 - PH;
        } else {
          wLanded = p.vy < 0 && wLB >= s.y1 - C.EPS && wB < s.y1;
          wCeiling = p.vy >= 0 && wLT <= s.y0 + C.EPS && wT > s.y0;
          if (wLanded) p.y = s.y1 + PH;
          else if (wCeiling) p.y = s.y0 - PH;
        }
        if (wLanded || wCeiling) {
          p.vy = 0;
          if (wLanded) p.onGround = true;
          if (wCeiling) p.onCeiling = true;
        } else if (!NOCLIP && overlaps(p.x - PH, p.x + PH, p.y - PH, p.y + PH, s)) {
          if (s.ref) out.breaks.push(s.ref);
          else { out.died = true; return; }
        }
        B = p.y - H; T = p.y + H;
      }
      return;
    }
    for (i = 0; i < aSolids.length; i++) {
      s = aSolids[i];
      if (s.ref && s.ref.broken) continue;
      if (!(R > s.x0 && L < s.x1)) continue;
      if (!(T > s.y0 && B < s.y1)) continue;
      if (s.rotSolid) {
        if (collideRotSolid(p, s, flip, H, IN, out) === 1) return;
        B = p.y - H; T = p.y + H;
        continue;
      }
      // reference landing window: the player must overlap the block by >5 world units (2x)
      // on each covered edge, i.e. >2.5 here — a shallower corner clip is not a landing
      var landX = p.x + H - 2.5 > s.x0 && p.x - H + 2.5 < s.x1;
      var landed = false;
      if (flip > 0) {
        landed = landX && p.vy <= 0 && p.lastY - H >= s.y1 - C.EPS && B < s.y1;
        if (landed) p.y = s.y1 + H;
      } else {
        landed = landX && p.vy >= 0 && p.lastY + H <= s.y0 + C.EPS && T > s.y0;
        if (landed) p.y = s.y0 - H;
      }
      if (landed) {
        p.vy = 0; p.onGround = true; p.canJump = true; p.isJumping = false; p.rotActive = false;
        if (p.mode === 'ball') {
          if (!wasOnGround) p.rot = Math.round(p.rot / Math.PI) * Math.PI;
          p.ballOpp = false; p.ballHitPad = false;
          p.ballNormal = (p.flip ? -1 : 1) * (p.mirrored ? -1 : 1);
        }
      } else {
        if (!NOCLIP && (s.ref
          ? overlaps(L, R, B, T, s)
          : overlaps(p.x - IN, p.x + IN, p.y - IN, p.y + IN, s))) {
          if (s.ref) out.breaks.push(s.ref);
          else { out.died = true; return; }
        }
        // Reference: only flying modes snap to a ceiling/floor hit from the non-standing
        // side; cube/ball/robot/spider pass through and die when the inner box overlaps.
        if (!s.ref) {
          var flySnap = p.mode === 'ship' || p.mode === 'ufo';
          if (flip > 0 && p.vy > 0 && p.lastY + H <= s.y0 + C.EPS && T > s.y0) {
            if (flySnap) { p.y = s.y0 - H; p.vy = 0; p.onCeiling = true; }
          } else if (flip < 0 && p.vy < 0 && p.lastY - H >= s.y1 - C.EPS && B < s.y1) {
            if (flySnap) { p.y = s.y1 + H; p.vy = 0; p.onGround = true; }
          }
        }
      }
      B = p.y - H; T = p.y + H;
    }
  }

  // Platformer-only horizontal collision. Classic mode remains on its original auto-run path.
  var HORIZONTAL_SOLIDS = [];
  function collideHorizontal(p, lv, out) {
    var G = lv.g, D = lv.dyn || NO_DYN, H = p.half;
    var a = clr(HORIZONTAL_SOLIDS);
    gridInto(a, G.solids, p.x - H, p.x + H);
    dynInto(a, D.solids, p.x - H, p.x + H);
    gridInto(a, G.breakables, p.x - H, p.x + H);
    dynInto(a, D.breakables, p.x - H, p.x + H);
    for (var i = 0; i < a.length; i++) {
      var s = a[i];
      if (p.y + H <= s.y0 + C.EPS || p.y - H >= s.y1 - C.EPS) continue;
      if (s.ref) { if (out.breaks.indexOf(s) < 0) out.breaks.push(s); continue; }
      if (p.x + H <= s.x0 + C.EPS || p.x - H >= s.x1 - C.EPS) continue;
      if (p.vx > 0) p.x = s.x0 - H;
      else if (p.vx < 0) p.x = s.x1 + H;
      p.vx = 0;
    }
  }

  // One 240 Hz substep. sub = 0.25 frames.
  function step(p, sub, input, lv) {
    if (!lv.portals) lv.portals = [];
    if (!lv.speeds) lv.speeds = [];
    if (!lv.pads) lv.pads = [];
    if (!lv.orbs) lv.orbs = [];
    if (!lv.slopes) lv.slopes = [];
    if (!lv.coins) lv.coins = [];
    if (!lv.checkpoints) lv.checkpoints = [];
    if (!lv.g) buildGrids(lv);
    var out = { died: false, portal: null, speed: null, teleportY: null, coins: [], breaks: [], checkpoint: null };
    var dt = sub * C.D;
    var stepInput = input;
    p.tickN++;
    p.lastY = p.y;
    p.lastX = p.x;
    if (p.pendingVelocity !== null && p.pendingVelocity !== undefined) {
      p.vy = p.pendingVelocity;
      p.pendingVelocity = null;
    }
    // dash orb: the dash ends on release or on landing; presses are inert while dashing
    if (p.dashing && (!stepInput.hold || p.onGround)) { p.dashing = false; p.dashVy = 0; }
    if (p.dashing) {
      p.vy = p.dashVy;
    } else {
      if (stepInput.pressed) onPress(p, lv, out);
      if (out.died) { p.dead = true; return out; }
      switch (p.mode) {
        case 'cube': cubeJump(p, dt, stepInput.hold); break;
        case 'ship': shipFly(p, dt, stepInput.hold); break;
        case 'ball': ballJump(p, dt, stepInput.pressed); break;
        case 'ufo': ufoJump(p, dt, stepInput.pressed, stepInput.hold); break;
        case 'wave': waveMove(p, stepInput.hold); break;
        case 'robot': robotJump(p, dt, stepInput.hold, stepInput.pressed); break;
        case 'spider': spiderFall(p, dt); break;
        case 'swing': swingMove(p, dt); break;
      }
    }
    if (p.dead) return out;
    p.y += p.vy * dt;
    // Platformer controls use damped horizontal velocity and the same grid-based solid data.
    // A held direction accelerates toward the current speed-portal limit; neutral input applies
    // friction. Stop Move remains latched until all movement keys are released.
    if (stepInput.platformer) {
      var moveLeft = !!stepInput.left, moveRight = !!stepInput.right;
      if (p.stopMoveUntilRelease) {
        if (!moveLeft && !moveRight) p.stopMoveUntilRelease = false;
        p.vx = 0;
      } else {
        var moveDir = moveRight === moveLeft ? 0 : (moveRight ? 1 : -1);
        moveDir *= (p.dirSign || 1);
        if (moveDir) {
          var targetVX = moveDir * p.speed;
          p.vx += (targetVX - p.vx) * Math.min(1, dt * 3.5);
        } else {
          p.vx *= Math.pow(0.80, sub / 0.25);
          if (Math.abs(p.vx) < 0.015) p.vx = 0;
        }
      }
      p.x += p.vx * dt;
      collideHorizontal(p, lv, out);
    }
    // reference cap: the player dies above the level top (7560 in 2x units). The bound is on
    // the WORLD y — in sideways gameplay GS.step sees swapped axes, so p.y here is the world x
    // (which runs to the level end) and p.x carries the world y.
    var capY = p.sideways ? p.x : p.y;
    if (capY > 3780 || capY < -3780) { out.died = true; }
    collide(p, lv, out, stepInput);
    if (out.died) p.dead = true;
    if (!p.dead && !stepInput.platformer) p.x += sub * p.speed * C.D * (p.dirSign || 1);     // classic auto-run
    // Platformer checkpoint diamonds activate on contact and remain latched until another is touched.
    if (!p.dead && stepInput.platformer) {
      for (var ci = 0; ci < lv.checkpoints.length; ci++) {
        var cp = lv.checkpoints[ci];
        if (overlaps(p.x - p.half, p.x + p.half, p.y - p.half, p.y + p.half, cp)) { out.checkpoint = cp; break; }
      }
    }
    // reference getFloorY()/getCeilingY() post-collision clamps (player.js): while a fly
    // corridor is active its floor REPLACES the world ground — ships, ufo, wave, ball, spider
    // and the normal-gravity cube ride it, and the wave uses its small hitbox size. The
    // corridor ceiling snap covers ship/ufo/wave/spider AND ball (the ball rolls on the
    // fly-band ceiling when gravity is flipped); cube and robot are exempt ('iscube').
    var flySize = p.mode === 'wave' ? (p.isMini ? 3 : 4.5) : p.half;
    var flyCubeM = p.mode === 'cube' || p.mode === 'robot';
    if (!p.dead && !p.freeModeCamera && !stepInput.freeModeCamera && p.flyFloor !== null && p.flyFloor !== undefined) {
      if (p.y <= p.flyFloor + flySize && (p.vy <= 0 || p.onGround)) {
        if (!p.flip || !flyCubeM) {
          p.y = p.flyFloor + flySize; p.vy = 0;
          p.onGround = true; p.canJump = true; p.isJumping = false;
        } else if (p.vy < -0.5 && !NOCLIP) {
          out.died = true; p.dead = true;
        }
      }
    }
    if (!p.dead && !p.freeModeCamera && !stepInput.freeModeCamera && p.flyCeil !== null && p.flyCeil !== undefined && !flyCubeM) {
      if (p.y + flySize >= p.flyCeil) {
        // reference hitGround + onCeiling: the spider can teleport from a pinned ceiling
        p.y = p.flyCeil - flySize; p.vy = 0; p.onGround = false; p.onCeiling = true; p.canJump = true; p.isJumping = false;
      }
    }
    updateRotation(p, sub, dt);
    return out;
  }

  // Reference _computeFlyBounds: floor snaps to the 30 grid below the centre, ceiling = floor + height.
  function setFlyBounds(p, centerY, height) {
    var floorY = Math.max(0, Math.floor((centerY - height / 2) / 30) * 30);
    p.flyFloor = floorY;
    p.flyCeil = floorY + height;
  }
  // reference spans in world units: ship/ufo/wave f=600 (2x), ball f-a*2=480, spider 600-a=540
  var FLY_MODES = { ship: 300, ufo: 300, wave: 300, ball: 240, spider: 270, swing: 300 };

  function setMode(p, mode, portalY) {
    p.dashing = false; p.dashVy = 0;
    // reference player.js enter*Mode: fly bounds centre on the PORTAL's y (portal.portalY ??
    // portal.y), not the player's y at the crossing — off-centre entries shift the band and
    // with it the camera lock (flyCameraTarget)
    if (FLY_MODES[mode] !== undefined) setFlyBounds(p, portalY !== undefined ? portalY : p.y, FLY_MODES[mode]);
    else { p.flyFloor = null; p.flyCeil = null; }
    p.mode = mode;
    p.isJumping = false;
    p.rotActive = false;
    p.gdAccel = false;
    p.pendingVelocity = null;
    if (mode === 'ship' || mode === 'ufo' || mode === 'wave' || mode === 'robot') p.rot = 0;
    if (mode === 'robot') { p.robotAccel = 0; p.robotHold = false; p.robotHoldTimer = 0; }
    if (mode === 'spider' || mode === 'swing') p.rot = 0;
    if (mode === 'ball') { p.ballOpp = false; p.ballHitPad = false; p.ballNormal = (p.flip ? -1 : 1) * (p.mirrored ? -1 : 1); }
    if (mode === 'swing') { p.onGround = false; p.canJump = false; p.isJumping = false; p.swingSkip = false; }
  }

  return {
    C: C, SPEED: SPEED, speedConsts: speedConsts, gdTrunc: gdTrunc,
    newPlayer: newPlayer, step: step, setMode: setMode, setSpeed: setSpeed,
    setMini: setMini, setMirror: setMirror, flipGravity: flipGravity,
    setNoclip: setNoclip,
    slerp2D: slerp2D, slopeY: slopeY, gravityPortal: gravityPortal, buildGrids: buildGrids, refreshDyn: refreshDyn
  };
})();
if (typeof module !== 'undefined') module.exports = GameSim;
