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
  // Reference _gdSpeedConsts (player.js): gravity and the jump impulse vary with the
  // speed portal. 2x reference values: HALF 1.880398/21.240064, ONE 1.916398/22.360064,
  // TWO 1.914398/22.840064, THREE and FOUR 1.922398/22.460064; halved to 1x units here.
  function speedConsts(v) {
    if (v === SPEED.HALF) return { grav: 0.940199, yStart: 10.620032 };
    if (v === SPEED.TWO) return { grav: 0.957199, yStart: 11.420032 };
    if (v === SPEED.THREE || v === SPEED.FOUR) return { grav: 0.961199, yStart: 11.230032 };
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
    var keys = ['spikes', 'portals', 'speeds', 'pads', 'orbs', 'coins', 'slopes', 'solids', 'breakables', 'forceBlocks'];
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
    var keys = ['solids', 'spikes', 'portals', 'speeds', 'pads', 'orbs', 'slopes', 'coins', 'breakables', 'forceBlocks'];
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
  var NO_DYN = { solids: [], spikes: [], portals: [], speeds: [], pads: [], orbs: [], slopes: [], coins: [], breakables: [], forceBlocks: [] };
  // candidate lists are refilled into shared scratch arrays (collide and the spider search use them
  // only within the same call, so reuse is safe and avoids one allocation per list per substep)
  var SC = { spikes: [], portals: [], speeds: [], pads: [], orbs: [], coins: [], slopes: [], solids: [], forceBlocks: [] };
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
      forceTicks: 0, forceAccumX: 0, forceAccumY: 0,
      half: C.HALF, inner: C.INNER, isMini: false,
      robotAccel: 0, robotTouchedPad: false,
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
  // reference falling-past-threshold test (player.js) uses p*2 in 2x units: 1.916398 here
  function fallingPastThreshold(p) { return p.flip ? p.vy > FALL_THRESHOLD * 2 : p.vy < -(FALL_THRESHOLD * 2); }

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

  // Reference _isTouchingAvailableOrbForInput: ball / spider / ufo presses give the ORB
  // priority over the jump / teleport — a press while touching an unactivated orb fires
  // the orb instead of the mode action. Same AABB and per-attempt activation rules as the
  // orb loop in collide().
  function touchingAvailableOrb(p, lv) {
    if (!lv) return false;
    if (!lv.g) buildGrids(lv);
    var H = p.half;
    var L = p.x - H, R = p.x + H, B = p.y - H, T = p.y + H;
    var G = lv.g, D = lv.dyn || NO_DYN;
    var aOrbs = dynInto(gridInto(clr(SC.orbs), G.orbs, L, R), D.orbs, L, R);
    if (!p.orbUsed) p.orbUsed = {};
    for (var i = 0; i < aOrbs.length; i++) {
      var o = aOrbs[i], OR = o.R !== undefined ? o.R : C.ORB_R;
      if (!p.orbUsed[o._id] && overlaps(L, R, B, T, { x0: o.cx - OR, x1: o.cx + OR, y0: o.cy - OR, y1: o.cy + OR })) return true;
    }
    return false;
  }

  function cubeJump(p, dt, hold) {
    var flip = flipMod(p);
    if (p.canJump && hold) {
      p.vy = gdTrunc(flip * p.yStart * (p.isMini ? 0.8 : 1));
      p.onGround = false; p.canJump = false; p.isJumping = true;
      p.orbHoldUsed = true;                     // the press is consumed: no orb buffering after a jump
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

  // Reference _updateFlyJump: the below threshold is 2*c.grav (speed-dependent), the
  // acceleration uses the CONSTANT p grav (0.958199 at 1x), and gdAccel (from the
  // 1330/1333 orbs and 1332 pads) replaces the thrust table and lifts the velocity cap.
  function shipFly(p, dt, hold) {
    var flip = flipMod(p);
    var f23 = p.isMini ? 0.85 : 1;
    var gscale = p.gravityScale === undefined ? 1 : p.gravityScale;
    var up = p.vy * flip;
    if (p.gdAccel && ((up >= 0 && up < 8 / f23) || (up <= 0 && up > -6.4 / f23))) p.gdAccel = false;
    var below = up < 2 * p.grav * gscale;
    var k, mult;
    if (!hold) {
      mult = p.gdAccel ? (up >= 0 ? 0.8 : -1) : 0.8;
      if (!below) mult = 1.2;
      k = 0.4;
    } else {
      mult = p.gdAccel ? (up >= 0 ? 0.8 : -1) : -1;
      k = below ? 0.5 : 0.4;
    }
    p.vy = gdTrunc(p.vy - flip * k * mult * 0.958199 * gscale * dt / f23);
    if (hold) p.onGround = false;
    if (!p.gdAccel) {
      var upNow = Math.max(-6.4 / f23, Math.min(8 / f23, p.vy * flip));
      p.vy = gdTrunc(upNow * flip);
    }
  }

  // Reference _updateUfoJump: the press first lifts the velocity to 14/13.6 (2x) only when
  // lower; gravity is ufoMult*p*0.5 (ufoMult 1.2 above 2*c.grav, else 0.8); cap [-12.8, 16]
  // (2x) in the gravity frame, lifted while gdAccel is active.
  function ufoJump(p, dt, pressed, hold, lv) {
    var flip = flipMod(p);
    var f23 = p.isMini ? 0.85 : 1;
    var gscale = p.gravityScale === undefined ? 1 : p.gravityScale;
    var up = p.vy * flip;
    if (p.gdAccel && ((up >= 0 && up < 8 / f23) || (up <= 0 && up > -6.4 / f23))) p.gdAccel = false;
    if (pressed && !touchingAvailableOrb(p, lv)) {
      var jump = p.isMini ? 6.8 : 7;
      if (up < jump) p.vy = gdTrunc(jump * flip);
      p.onGround = false; p.canJump = false; p.isJumping = true;
    }
    var mult = p.vy * flip >= 2 * p.grav * gscale ? 1.2 : 0.8;
    p.vy = gdTrunc(p.vy - flip * mult * 0.958199 * gscale * dt / f23);
    if (!p.gdAccel) {
      var upNow = Math.max(-6.4 / f23, Math.min(8 / f23, p.vy * flip));
      p.vy = gdTrunc(upNow * flip);
    }
    if (hold) p.onGround = false;
    if (p.isJumping && falling(p)) p.isJumping = false;
  }

  function ballJump(p, dt, pressed, lv) {
    var flip = flipMod(p);
    if (pressed && p.canJump && !touchingAvailableOrb(p, lv)) {
      p.vy = gdTrunc(flip * p.yStart * (p.isMini ? 0.8 : 1));
      flipGravity(p, !p.flip, 0.5);
      p.onGround = false; p.canJump = false;
      p.vy *= 0.6;
      p.orbHoldUsed = true;                     // the press is consumed: no orb buffering after a ball jump
      return;
    }
    if (falling(p)) p.canJump = false;
    // reference ball gravity uses the CONSTANT p*0.6, not the speed-dependent c.grav
    p.vy = gdTrunc(p.vy - 0.6 * 0.958199 * (p.gravityScale === undefined ? 1 : p.gravityScale) * dt * flip);
    if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
  }

  // spider: gravity at a CONSTANT p*0.6 (speed-independent, no mini factor), movement
  // comes from teleports on press
  function spiderFall(p, dt) {
    var flip = flipMod(p);
    if (falling(p)) p.canJump = false;
    p.vy = gdTrunc(p.vy - 0.6 * 0.958199 * (p.gravityScale === undefined ? 1 : p.gravityScale) * dt * flip);
    if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
    if (fallingPastThreshold(p)) p.onGround = false;
  }

  // Reference _updateRobotJump: jump impulse is yStart*0.5 (mini x0.8); while held the
  // robot cancels gravity (robotAccel accumulates dt*0.1 up to 1.5); gravity is 0.9*c.grav
  // (speed-dependent); the velocity cap applies only outside the jump; a release latches
  // robotTouchedPad so re-holding never resumes the cancel.
  function robotJump(p, dt, hold, pressed) {
    var flip = flipMod(p);
    var gscale = p.gravityScale === undefined ? 1 : p.gravityScale;
    var grav = 0.9 * p.grav * gscale;
    if (pressed && p.canJump) {
      p.isJumping = true; p.onGround = false; p.canJump = false;
      p.vy = gdTrunc(flip * p.yStart * 0.5 * (p.isMini ? 0.8 : 1));
      p.robotAccel = 0; p.robotTouchedPad = false;
      p.orbHoldUsed = true;                     // the press is consumed: no orb buffering after a robot jump
      return;
    }
    if (p.isJumping) {
      var holding = hold && !p.robotTouchedPad && (p.robotAccel || 0) < 1.5;
      if (holding) {
        p.robotAccel = (p.robotAccel || 0) + dt * 0.1;
        p.vy += flip * grav * dt;
      }
      p.vy = gdTrunc(p.vy - flip * grav * dt);
      if (falling(p)) p.isJumping = false;
    } else {
      p.vy = gdTrunc(p.vy - flip * grav * dt);
      if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
    }
    if (!hold) p.robotTouchedPad = true;        // reference _releaseButton latches robotTouchedPad
    if (falling(p)) p.canJump = false;
  }

  // Reference _updateSwingJump: a press flips gravity keeping the velocity (x0.8, then
  // truncated); the swing accelerates at k*p (k = mini ? 0.6 : 0.4, constant p grav) with
  // the velocity clamped to +/-8 (16 at 2x) every substep.
  function swingMove(p, dt) {
    var flip = flipMod(p);
    var gscale = p.gravityScale === undefined ? 1 : p.gravityScale;
    var k = p.isMini ? 0.6 : 0.4;
    p.vy = gdTrunc(p.vy - flip * k * 0.958199 * gscale * dt);
    p.vy = gdTrunc(Math.max(-8, Math.min(8, p.vy)));
    p.canJump = false;
    p.isJumping = false;
  }

  function waveMove(p, hold) {
    // reference _updateWaveJump: wave velocity equals the current horizontal speed
    // (mini doubles it), so the wave always travels at 45 degrees (steeper when mini)
    var vel = (hold ? 1 : -1) * flipMod(p) * p.speed * (p.isMini ? 2 : 1);
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
        if (!NOCLIP) { p.dead = true; out.died = true; try { if (typeof window !== 'undefined') window.__killer = { k: 'site' + 1 }; } catch (e) { } return; }
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
      p.orbHoldUsed = true;                     // reference clears the press buffer on every spider press
      if ((p.canJump || p.onGround || p.onCeiling) && !touchingAvailableOrb(p, lv)) spiderTeleport(p, lv, out);
    } else if (p.mode === 'swing') {
      // reference swing press: flipGravity(..., 0.8) then truncate the velocity; no step skip
      flipGravity(p, !p.flip, 0.8);
      p.vy = gdTrunc(p.vy);
      p.onGround = false; p.canJump = false; p.isJumping = false;
      p.orbHoldUsed = true;
    }
  }

  // Dash orb (reference 1704 / 1751 branch): the orb's rotation property picks the dash angle.
  // Speed 18 in the 2x reference units, so 9 here; the vertical part is clamped to sin(70 deg).
  // The reference dash velocity is WORLD-SPACE (no gravity-frame rescale) and is not truncated.
  function applyDashOrb(p, id, rot) {
    var rad = (rot || 0) * Math.PI / 180;
    var sin = -Math.sin(rad);
    var maxSin = Math.sin(70 * Math.PI / 180);
    if (sin > maxSin) sin = maxSin; else if (sin < -maxSin) sin = -maxSin;
    var velY = sin * 9;
    if (id === 1751) flipGravity(p, !p.flip);  // blue dash orb flips gravity (reference default 0.5)
    p.dashing = true;
    p.dashVy = velY;
    p.vy = velY;
    p.onGround = false; p.canJump = false; p.isJumping = false;
    p.rotActive = false;                       // reference stopRotation()
  }

  function applyOrb(p, id, rot) {
    // The custom green ring (1594) only reverses gravity; it does not add an orb impulse.
    if (id === 1594) { flipGravity(p, !p.flip); return; }
    if (id === 1704 || id === 1751) { applyDashOrb(p, id, rot); return; }
    var fm = flipMod(p), yS = p.yStart;
    var mini = p.isMini ? 0.8 : 1;
    if (p.mode === 'wave') {
      if (id === 84 || id === 1022) flipGravity(p, !p.flip);   // reference default (0.5); wave overwrites vy each tick
      return;
    }
    // Reference orb table (player.js jump_ring branch). Every base is scaled by the mini
    // factor; ball/spider additionally x0.7. The 1330/1333 orbs set gdAccel (ship/ufo glide).
    // 84 (blue) launches in the OLD gravity frame at base 0.8, then the flip halves vy;
    // 1022 (green) flips FIRST and launches upward in the NEW gravity frame.
    var vel = 0, flipBefore = false, flipAfter = false;
    if (p.mode === 'ship') {
      if (id === 36) vel = yS * mini;
      else if (id === 141) vel = yS * 0.37 * mini;
      else if (id === 1333) { vel = yS * (p.isMini ? 1.12 : 1); p.gdAccel = true; }
      else if (id === 84) { vel = yS * 0.8 * mini; flipAfter = true; }
      else if (id === 1022) { vel = yS * 0.7 * mini; flipBefore = true; }
      else if (id === 1330) { vel = -14; p.gdAccel = true; }
    } else if (p.mode === 'ufo') {
      if (id === 36) vel = yS * mini;
      else if (id === 141) vel = yS * 0.42 * mini;
      else if (id === 1333) { vel = yS * (p.isMini ? 1.088 : 1.02); p.gdAccel = true; }
      else if (id === 84) { vel = yS * 0.8 * mini; flipAfter = true; }
      else if (id === 1022) { vel = yS * mini; flipBefore = true; }
      else if (id === 1330) { vel = -11.2; p.gdAccel = true; }
    } else if (p.mode === 'ball' || p.mode === 'spider') {
      if (id === 36) vel = yS * 0.7 * mini;
      else if (id === 141) vel = yS * 0.77 * mini * 0.7;
      else if (id === 1333) { vel = yS * 1.34 * mini * 0.7; p.gdAccel = true; }
      else if (id === 84) { vel = yS * 0.8 * mini * 0.7; flipAfter = true; }
      else if (id === 1022) { vel = yS * 0.7 * mini; flipBefore = true; }
      else if (id === 1330) { vel = p.mode === 'spider' ? -16.5 : -15; p.gdAccel = true; }
    } else if (p.mode === 'robot') {
      if (id === 36) vel = yS * 0.9 * mini;
      else if (id === 141) vel = yS * 0.72 * mini;
      else if (id === 1333) { vel = yS * 1.28 * mini; p.gdAccel = true; }
      else if (id === 84) { vel = yS * 0.8 * mini; flipAfter = true; }
      else if (id === 1022) { vel = yS * mini; flipBefore = true; }
      else if (id === 1330) { vel = -15; p.gdAccel = true; }
    } else {
      // cube and swing share the cube table in the reference
      if (id === 36) vel = yS * mini;
      else if (id === 141) vel = yS * 0.72 * mini;
      else if (id === 1333) { vel = yS * 1.38 * mini; p.gdAccel = true; }
      else if (id === 84) { vel = yS * 0.8 * mini; flipAfter = true; }
      else if (id === 1022) { vel = yS * mini; flipBefore = true; }
      else if (id === 1330) { vel = -15; p.gdAccel = true; }
    }
    if (flipBefore) flipGravity(p, !p.flip, 1.0);
    p.vy = gdTrunc((flipBefore ? flipMod(p) : fm) * vel);
    if (flipAfter) flipGravity(p, !p.flip);     // reference flipGravity default 0.5: blue orbs launch at half strength
    p.onGround = false; p.canJump = false; p.isJumping = true;
  }

  // Reference jump-pad branch (player.js): _padVel = 16 * bump * mini * (ball/spider ? 0.6 : 1)
  // in 1x units (_grav = 2 folded in). Bumps: 140 -> flying 0.35 / ufo 0.4 / ball+spider 0.7 /
  // else 0.65; 1332 -> flying (mini 0.95 : 0.63) / ufo (mini 0.98 : 0.6) / else 1.25;
  // 67 -> 0.8 with the gravity flip AFTER the launch. 1332 sets gdAccel; 3005 runs a full
  // spider teleport to the nearest surface.
  function applyPad(p, id, lv, out) {
    var fm = flipMod(p), mini = p.isMini ? 0.8 : 1;
    var BS = p.mode === 'ball' || p.mode === 'spider';
    if (id === 3005) {
      spiderTeleport(p, lv, out);
      if (p.mode === 'ball') { var gdS = p.flip ? -1 : 1; p.ballNormal = p.mirrored ? -gdS : gdS; p.ballOpp = p.flip; p.ballHitPad = true; }
      p.isJumping = false;
      return;
    }
    var vel, flipAfter = id === 67;
    if (id === 35) vel = 16;
    else if (id === 140) vel = p.mode === 'ship' ? 5.6 : p.mode === 'ufo' ? 6.4 : BS ? 11.2 : 10.4;
    else if (id === 1332) vel = p.mode === 'ship' ? (p.isMini ? 15.2 : 10.08) : p.mode === 'ufo' ? (p.isMini ? 15.68 : 9.6) : 20;
    else vel = 12.8;                            // 67 blue pad
    vel *= BS ? 0.6 : 1;
    vel *= mini;
    p.gdAccel = id === 1332;
    if (p.mode === 'ball') {      // roll flags are set before the gravity pad flips, as in the reference
      var gd = p.flip ? -1 : 1;
      p.ballNormal = p.mirrored ? -gd : gd;
      p.ballOpp = p.flip;
      p.ballHitPad = true;
    }
    p.vy = gdTrunc(fm * vel);
    p.isJumping = true; p.onGround = false; p.canJump = false;
    if (flipAfter) flipGravity(p, !p.flip);     // launch uses the pre-flip direction, then gravity flips
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
    } else { wa = 1 - t; wb = t; }
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
    if (!NOCLIP && Math.abs(u) < hw + IN && Math.abs(v) < hh + IN) { out.died = true; try { if (typeof window !== 'undefined') window.__killer = { k: 'site' + 2 }; } catch (e) { } return 1; }
    return 0;
  }
  // Reference player.js _forceModeFactor: mode/mini dependent response to Force Blocks.
  function forceModeFactor(p) {
    if (p.mode === 'ship') return p.isMini ? 0.5875 : 0.47;
    if (p.mode === 'ufo') return p.isMini ? 0.725 : 0.58;
    if (p.mode === 'swing') return p.isMini ? 0.6154 : 0.4;
    if (p.mode === 'ball' || p.mode === 'spider') return p.isMini ? 0.725 : 0.6;
    if (p.mode === 'robot') return p.isMini ? 0.725 : 0.9;
    return p.isMini ? 0.725 : 1;
  }
  function addForceBlock(p, block) {
    var ang;
    if (block.forceRadial) {
      ang = Math.atan2(block.cy - p.y, block.cx - p.x) + (block.forceFlipY ? 0 : Math.PI);
    } else if (Number.isFinite(block.forceAngle)) {
      ang = block.forceAngle;
    } else {
      ang = (90 - (block.rot || 0) + (block.forceFlipY ? 180 : 0)) * Math.PI / 180;
    }
    var force = block.force || 0;
    if (block.forceRange) {
      var radius = block.radius > 0 ? block.radius : Math.max(block.w || 0, block.h || 0) / 2;
      var t = 0;
      if (radius > 0) {
        if (block.forceRadial) {
          var dist = Math.hypot(block.cx - p.x, block.cy - p.y);
          t = dist < radius ? 1 - dist / radius : 0;
        } else {
          t = ((radius + (block.cx - p.x) * Math.cos(ang) + (block.cy - p.y) * Math.sin(ang)) / radius) * 0.5;
        }
      }
      t = Math.max(0, Math.min(1, t));
      force = (block.forceMin || 0) + t * ((block.forceMax || 0) - (block.forceMin || 0));
    }
    var fx = p.forceAccumX + force * Math.cos(ang);
    var fy = p.forceAccumY + force * Math.sin(ang);
    var len = Math.hypot(fx, fy);
    if (len > 10000) { fx *= 10000 / len; fy *= 10000 / len; }
    p.forceAccumX = fx; p.forceAccumY = fy; p.forceTicks = 2;
  }
  function stepForce(p, dt) {
    if (p.forceTicks > 0) {
      p.forceTicks--;
      var fy = p.forceAccumY || 0;
      if (fy !== 0) {
        p.vy += 2 * 0.9 * forceModeFactor(p) * dt * fy;
        if (p.flip ? fy < 0 : fy > 0) p.onGround = false;
      }
    }
    p.forceAccumX = 0; p.forceAccumY = 0;
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
    var aForceBlocks = dynInto(gridInto(clr(SC.forceBlocks), G.forceBlocks, L, R), D.forceBlocks, L, R);
    // Force Blocks are hidden, non-solid colliders. Match the reference's per-collision
    // forceId de-duplication so adjacent blocks sharing an id do not multiply the impulse.
    var seenForceIds = {};
    for (i = 0; i < aForceBlocks.length; i++) {
      var fb = aForceBlocks[i];
      if (fb.forceId > 0 && seenForceIds[fb.forceId]) continue;
      if (!rotOverlap(fb.cx, fb.cy, fb.w, fb.h, fb.rot || 0, p.x, p.y, H)) continue;
      if (fb.forceId > 0) seenForceIds[fb.forceId] = true;
      addForceBlock(p, fb);
    }
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
        if (hdx * hdx + hdy * hdy <= hmin * hmin && !NOCLIP) { try { if (typeof window !== 'undefined') window.__killer = { k: 'spikeCircle', x: hz.cx, y: hz.cy, r: hz.r, id: hz.id }; } catch (e) { } out.died = true; return; }
      } else if (hz.rot && (hz.cx !== undefined)) {
        var hrad = hz.rot * Math.PI / 180, hc = Math.abs(Math.cos(hrad)), hs = Math.abs(Math.sin(hrad));
        var ehx = hz.w / 2 * hc + hz.h / 2 * hs, ehy = hz.w / 2 * hs + hz.h / 2 * hc;
        if (!NOCLIP && p.x + PH > hz.cx - ehx && p.x - PH < hz.cx + ehx &&
            p.y + PH > hz.cy - ehy && p.y - PH < hz.cy + ehy) { try { if (typeof window !== 'undefined') window.__killer = { k: 'spikeRot', x: hz.cx, y: hz.cy, w: hz.w, h: hz.h, rot: hz.rot, id: hz.id }; } catch (e) { } out.died = true; return; }
      } else if (!NOCLIP && overlaps(p.x - PH, p.x + PH, p.y - PH, p.y + PH, hz)) { try { if (typeof window !== 'undefined') window.__killer = { k: 'spikeBox', x0: hz.x0, x1: hz.x1, y0: hz.y0, y1: hz.y1, id: hz.id }; } catch (e) { } out.died = true; return; }
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
      if (pid !== 67 || p.tickN - p.lastBluePad >= 5) { if (pid === 67) p.lastBluePad = p.tickN; applyPad(p, pid, lv, out); }
    }
    else if (hit < 0) { p.padIdx = -1; }

    // orbs (reference player.js checkCollisions + _consumeOrbActivationInput):
    //   - a fresh press, or a hold buffered from the press (ground modes only), activates one orb
    //   - orbHoldUsed is the per-press consume flag: one orb per press, re-armed at the
    //     start of step() on a fresh press (ship / ufo always need that fresh press)
    //   - an activated orb stays used for the rest of the attempt (per-object activation), so a
    //     second press can fire the NEXT orb but never re-fire a spent one
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
        if (inBox(s, p, IN) && wExt !== null && (s.above ? p.y + IN > wExt : p.y - IN < wExt) && !NOCLIP) { out.died = true; try { if (typeof window !== 'undefined') window.__killer = { k: 'site' + 6 }; } catch (e) { } return; }
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
      if (inBox(s, p, IN) && iExt !== null && (s.above ? p.y + IN > iExt : p.y - IN < iExt) && !NOCLIP) { out.died = true; try { if (typeof window !== 'undefined') window.__killer = { k: 'site' + 7 }; } catch (e) { } return; }
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
          else { try { if (typeof window !== 'undefined') window.__killer = { k: 'solidWave', x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1 }; } catch (e) { } out.died = true; return; }
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
          else { try { if (typeof window !== 'undefined') window.__killer = { k: 'solid', x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1 }; } catch (e) { } out.died = true; return; }
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
  function stepInner(p, sub, input, lv) {
    if (!lv.portals) lv.portals = [];
    if (!lv.speeds) lv.speeds = [];
    if (!lv.pads) lv.pads = [];
    if (!lv.orbs) lv.orbs = [];
    if (!lv.slopes) lv.slopes = [];
    if (!lv.coins) lv.coins = [];
    if (!lv.forceBlocks) lv.forceBlocks = [];
    if (!lv.checkpoints) lv.checkpoints = [];
    if (!lv.g) buildGrids(lv);
    var out = { died: false, portal: null, speed: null, teleportY: null, coins: [], breaks: [], checkpoint: null };
    var dt = sub * C.D;
    var stepInput = input;
    p.tickN++;
    // a fresh press re-arms the orb hold buffer BEFORE the mode physics: the reference
    // sets queuedHold on the press and clears it again inside a jump / teleport / flip
    if (stepInput.pressed) p.orbHoldUsed = false;
    if (!stepInput.hold) p.orbHoldUsed = true;    // reference _releaseButton clears the buffer
    p.lastY = p.y;
    p.lastX = p.x;
    if (p.pendingVelocity !== null && p.pendingVelocity !== undefined) {
      p.vy = p.pendingVelocity;
      p.pendingVelocity = null;
    }
    stepForce(p, dt);
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
        case 'ball': ballJump(p, dt, stepInput.pressed, lv); break;
        case 'ufo': ufoJump(p, dt, stepInput.pressed, stepInput.hold, lv); break;
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
    // reference cap: the player dies above the level top (7560 in 2x units)
    if (p.y > 3780 || p.y < -3780) { out.died = true; try { if (typeof window !== 'undefined') window.__killer = { k: 'site' + 10 }; } catch (e) { } }
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
          out.died = true; try { if (typeof window !== 'undefined') window.__killer = { k: 'site' + 11 }; } catch (e) { } p.dead = true;
        }
      }
    }
    if (!p.dead && !p.freeModeCamera && !stepInput.freeModeCamera && p.flyCeil !== null && p.flyCeil !== undefined && !flyCubeM) {
      if (p.y + flySize >= p.flyCeil) {
        // reference hitGround + onCeiling: the spider can teleport from a pinned ceiling
        p.y = p.flyCeil - flySize; p.vy = 0; p.onGround = false; p.onCeiling = true; p.canJump = true; p.isJumping = false;
      }
    }
    // reference hitGround() clears the hold buffer on every landing: a held press that
    // already jumped (or landed) cannot activate orbs without a fresh press
    if (p.onGround || p.onCeiling) p.orbHoldUsed = true;
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
    if (mode === 'robot') { p.robotAccel = 0; p.robotTouchedPad = false; }
    if (mode === 'spider' || mode === 'swing') p.rot = 0;
    if (mode === 'ball') { p.ballOpp = false; p.ballHitPad = false; p.ballNormal = (p.flip ? -1 : 1) * (p.mirrored ? -1 : 1); }
    if (mode === 'swing') { p.onGround = false; p.canJump = false; p.isJumping = false; p.swingSkip = false; }
  }

  return {
    C: C, SPEED: SPEED, speedConsts: speedConsts, gdTrunc: gdTrunc,
    newPlayer: newPlayer, step: function (p, sub, input, lv) { var wasDead = !!p.dead; var r = stepInner(p, sub, input, lv); if (r && r.died && !wasDead && !p.__deathLogged && typeof window !== 'undefined' && window.__onDeath) { p.__deathLogged = true; try { window.__onDeath(p, r, lv); } catch (e) { } } return r; }, setMode: setMode, setSpeed: setSpeed,
    setMini: setMini, setMirror: setMirror, flipGravity: flipGravity,
    setNoclip: setNoclip,
    slerp2D: slerp2D, slopeY: slopeY, gravityPortal: gravityPortal, buildGrids: buildGrids, refreshDyn: refreshDyn
  };
})();
if (typeof module !== 'undefined') module.exports = GameSim;
// Level model (grid-based), GD object ids, GMD import/export, conversion to physics arrays.
