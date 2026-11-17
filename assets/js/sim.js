// Cube Dash physics v5. Units: GD 1x (cell = 30). Frame = 1/60 s, 4 substeps per frame.
// Ported from web-dashers (player.js, level.js, game-scene.js). Triggers are not ported.
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
  // Reference _gdSpeedConsts (2x) halved
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
    var keys = ['spikes', 'portals', 'speeds', 'pads', 'orbs', 'coins', 'slopes', 'solids'];
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
  // Grouped objects are re-placed every frame: info(groups) gives the summed offset and visibility.
  function wrap(b, dx, dy) {
    var w = {}, k;
    for (k in b) w[k] = b[k];
    if (w.x0 !== undefined) { w.x0 += dx; w.x1 += dx; w.y0 += dy; w.y1 += dy; }
    if (w.cx !== undefined) { w.cx += dx; w.cy += dy; }
    if (w.target !== undefined) w.target += dy;
    w._s = 0;
    return w;
  }
  function refreshDyn(lv, info) {
    var keys = ['solids', 'spikes', 'portals', 'speeds', 'pads', 'orbs', 'slopes', 'coins'];
    var base = lv.dynBase || {}, dyn = {}, k, i;
    for (k = 0; k < keys.length; k++) {
      var src = base[keys[k]] || [], arr = [];
      for (i = 0; i < src.length; i++) {
        var b = src[i], inf = info(b.groups || []);
        b._aff = !!(inf.hidden || inf.dx !== 0 || inf.dy !== 0);
        if (b._aff && !inf.hidden) arr.push(wrap(b, inf.dx, inf.dy));
      }
      dyn[keys[k]] = arr;
    }
    lv.dyn = dyn;
  }
  var NO_DYN = { solids: [], spikes: [], portals: [], speeds: [], pads: [], orbs: [], slopes: [], coins: [] };
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
      x: x, y: y, lastY: y, lastX: x, vy: 0,
      rot: 0, mode: mode, flip: false, mirrored: false,
      speed: SPEED.ONE, grav: sc.grav, yStart: sc.yStart,
      onGround: false, canJump: true, isJumping: false, onSlope: false,
      rotActive: false, rotStart: 0, rotTotal: 0, rotTime: 0,
      gdAccel: false,
      portalIdx: -1, portalSet: null, speedIdx: -1, padIdx: -1, orbIdx: -1, orbHoldUsed: false,
      portalFired: {}, tpIgnore: true,          // portals fire once per attempt; teleports ignored until clear (reference reset)
      ballOpp: false, ballNormal: 1, ballHitPad: false, tickN: 0, lastBluePad: -1e9,
      dashing: false, dashVy: 0,
      half: C.HALF, inner: C.INNER, isMini: false,
      robotAccel: 0, robotHold: false,
      dead: false
    };
  }

  function setSpeed(p, v) { var sc = speedConsts(v); p.speed = v; p.grav = sc.grav; p.yStart = sc.yStart; }

  // mini portals: shrink (101) / grow (99). Hitbox half 9 instead of 15.
  function setMini(p, on) {
    if (p.isMini === on) return;
    var old = p.half;
    p.isMini = on;
    p.half = on ? 9 : C.HALF;
    p.inner = 0.3 * p.half;
    if (p.onGround) p.y += p.half - old;
  }
  function setMirror(p, on) { p.mirrored = on; }

  function flipMod(p) { return p.flip ? -1 : 1; }
  function falling(p) { return p.flip ? p.vy > 0 : p.vy < 0; }
  function fallingPastThreshold(p) { return p.flip ? p.vy > 0.5 : p.vy < -0.5; }

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
      p.vy = gdTrunc(p.vy - p.grav * dt * flip);
      if (falling(p)) { p.isJumping = false; p.onGround = false; }
    } else {
      if (falling(p)) p.canJump = false;
      p.vy = gdTrunc(p.vy - p.grav * dt * flip);
      if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
      if (fallingPastThreshold(p) && !p.rotActive) startRotate(p, 1);
    }
  }

  function shipFly(p, dt, hold) {
    var flip = flipMod(p);
    var up = p.vy * flip;
    if (p.gdAccel && ((up >= 0 && up < 8) || (up <= 0 && up > -6.4))) p.gdAccel = false;
    var below = up < 2 * p.grav;
    var mult, k;
    if (!hold) {
      mult = p.gdAccel ? (up >= 0 ? 0.8 : -1) : 0.8;
      if (!below) mult = 1.2;
      k = 0.4;
    } else {
      mult = p.gdAccel ? (up >= 0 ? 0.8 : -1) : -1;
      k = below ? 0.5 : 0.4;
      p.onGround = false;
    }
    p.vy = gdTrunc(p.vy - flip * k * mult * p.grav * dt);
    if (!p.gdAccel) {
      var upNow = Math.max(-6.4, Math.min(8, p.vy * flip));
      p.vy = gdTrunc(upNow * flip);
    }
  }

  function ufoJump(p, dt, hold) {
    var flip = flipMod(p);
    var mult = (p.vy * flip >= 2 * p.grav) ? 1.2 : 0.8;
    p.vy = gdTrunc(p.vy - flip * mult * p.grav * dt * 0.5);
    var upNow = Math.max(-6.4, Math.min(8, p.vy * flip));
    p.vy = gdTrunc(upNow * flip);
    if (hold) p.onGround = false;
  }

  function ballJump(p, dt) {
    var flip = flipMod(p);
    if (falling(p)) p.canJump = false;
    p.vy = gdTrunc(p.vy - 0.6 * p.grav * dt * flip);
    if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
  }

  // spider: gravity at 0.6x, movement comes from teleports on press
  function spiderFall(p, dt) {
    var flip = flipMod(p);
    if (falling(p)) p.canJump = false;
    p.vy = gdTrunc(p.vy - 0.6 * p.grav * dt * flip);
    if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
    if (fallingPastThreshold(p)) p.onGround = false;
  }

  // robot: press to jump, hold to extend while robotAccel < 1.5
  function robotJump(p, dt, hold, pressed) {
    var flip = flipMod(p);
    var grav = 0.9 * p.grav;
    if (pressed && p.canJump) {
      p.isJumping = true; p.onGround = false; p.canJump = false;
      p.robotAccel = 0;
      p.vy = gdTrunc(flip * p.yStart * 0.5 * (p.isMini ? 0.8 : 1));
      p.robotHold = true;
      return;
    }
    if (p.isJumping) {
      var holding = hold && (p.robotAccel || 0) < 1.5;
      if (holding) {
        p.robotAccel = (p.robotAccel || 0) + dt * 0.1;
        p.vy += flip * grav * dt;
      } else {
        p.robotHold = false;
      }
      p.vy = gdTrunc(p.vy - flip * grav * dt);
      if (falling(p)) { p.isJumping = false; p.robotHold = false; }
    } else {
      p.vy = gdTrunc(p.vy - flip * grav * dt);
      if (p.flip) p.vy = Math.min(p.vy, 15); else p.vy = Math.max(p.vy, -15);
    }
  }

  // Swing (ported from the Lollipop mod, _updateSwingJump). A press flips gravity and skips the
  // gravity update of that substep; otherwise gravity is 0.4*grav with the velocity capped at 6.5 (13 at 2x).
  function swingMove(p, dt) {
    var flip = flipMod(p);
    if (p.swingSkip) { p.swingSkip = false; return; }
    if (falling(p)) p.canJump = false;
    p.vy = p.vy - 0.4 * p.grav * dt * flip;
    if (p.isJumping) {
      if (falling(p)) { p.isJumping = false; p.onGround = false; }
    } else {
      if (p.flip) p.vy = Math.min(p.vy, 6.5); else p.vy = Math.max(p.vy, -6.5);
    }
  }

  function waveMove(p, hold) {
    var flip = flipMod(p);
    p.vy = (hold ? 1 : -1) * flip * p.speed;
    p.canJump = false;
    p.isJumping = false;
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
    if (p.mode === 'ufo') {
      if (p.vy * flip < p.yStart * 0.625) p.vy = gdTrunc(p.yStart * 0.625 * flip);
      p.onGround = false; p.canJump = false; p.isJumping = true;
    } else if (p.mode === 'ball') {
      if (p.canJump && p.onGround) {
        p.vy = gdTrunc(flip * p.yStart);
        flipGravity(p, !p.flip, 0.5);
        p.onGround = false; p.canJump = false;
        p.vy *= 0.6;
      } else {
        flipGravity(p, !p.flip, 0.5);
      }
    } else if (p.mode === 'spider') {
      if (p.canJump || p.onGround) spiderTeleport(p, lv, out);
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
      else if (id === 84) { p.vy = gdTrunc(fm * sb * 0.4); flipGravity(p, !p.flip, 1.0); }
      else if (id === 1022) { p.vy = gdTrunc(fm * (-yS * 0.7)); flipGravity(p, !p.flip, 1.0); }
      else { p.vy = gdTrunc(fm * sb); }
      p.onGround = false; p.canJump = false; p.isJumping = true;
      return;
    }
    if (p.mode === 'wave') {
      if (id === 84 || id === 1022) flipGravity(p, !p.flip, 1.0);
      return;
    }
    var vel;
    if (id === 1330) {
      vel = isShip ? -14 : isUfo ? -11.2 : isSpider ? -16.5 : -15;
      p.gdAccel = true;
      p.vy = gdTrunc(fm * vel);
    } else if (id === 141) {
      var b1 = isShip ? 0.37 : isUfo ? 0.42 : isBall ? 0.77 : 0.72;
      vel = yS * b1 * (isBall || isSpider ? 0.7 : 1) * mini;
      p.vy = gdTrunc(fm * vel);
    } else if (id === 1333) {
      var b2 = isShip ? (p.isMini ? 1.4 : 1) : isUfo ? (p.isMini ? 1.36 : 1.02) : isBall ? 1.34 : isRobot ? 1.28 : isSpider ? 1.34 : 1.38;
      vel = yS * b2 * (isBall || isSpider ? 0.7 : 1) * mini;
      p.gdAccel = true;
      p.vy = gdTrunc(fm * vel);
    } else if (id === 84) {
      vel = yS * 0.8 * (isBall || isSpider ? 0.7 : 1) * mini;
      p.vy = gdTrunc(fm * vel);
      flipGravity(p, !p.flip, 1.0);
    } else if (id === 1022) {
      var b3 = isShip ? 0.7 : 1;
      vel = yS * b3 * (isBall || isSpider ? 0.7 : 1) * mini;
      flipGravity(p, !p.flip, 1.0);
      p.vy = gdTrunc(flipMod(p) * vel);
    } else {                       // 36 yellow orb
      vel = yS * (isBall || isSpider ? 0.7 : isRobot ? 0.9 : 1) * mini;
      p.vy = gdTrunc(fm * vel);
    }
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
    var bump = 1, flipAfter = false;
    if (id === 140) bump = p.mode === 'ship' ? 0.35 : p.mode === 'ufo' ? 0.4 : BS ? 0.7 : 0.65;
    else if (id === 1332) bump = p.mode === 'ship' ? (p.isMini ? 0.95 : 0.63) : p.mode === 'ufo' ? (p.isMini ? 0.98 : 0.6) : 1.25;
    else if (id === 67) { bump = 0.8; flipAfter = true; }
    p.gdAccel = id === 1332;
    if (p.mode === 'ball') {      // roll flags are set before the gravity pad flips, as in the reference
      var gd = p.flip ? -1 : 1;
      p.ballNormal = p.mirrored ? -gd : gd;
      p.ballOpp = p.flip;
      p.ballHitPad = true;
    }
    p.vy = gdTrunc(fm * 16 * bump * mini * (BS ? 0.6 : 1));
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
    } else if (p.mode === 'ship' || p.mode === 'ufo') {
      var dy = -(p.y - p.lastY);
      var dx = sub * p.speed * C.D;
      p.rot = slerp2D(p.rot, Math.atan2(dy, dx), Math.min(sub, 0.15 * sub));
    } else if (p.mode === 'wave') {
      var wt = p.vy === 0 ? 0 : (p.vy > 0 ? -Math.PI / 4 : Math.PI / 4);
      p.rot = slerp2D(p.rot, wt, Math.min(1, 0.55 * dt));
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
  function collide(p, lv, out, input) {
    var flip = flipMod(p), H = p.half, IN = p.inner;
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

    // hazards. GD tests hazards against the player's small INNER hitbox (the 30x30 box is for
    // solids only). Boxes use their reference hitbox; circular hazards (sawblades) kill when the
    // player CENTRE is within radius + inner (reference _hMinDist = hitbox_radius + playerSize).
    for (i = 0; i < aSpikes.length; i++) {
      var hz = aSpikes[i];
      if (hz.r !== undefined) {
        var hdx = p.x - hz.cx, hdy = p.y - hz.cy;
        var hmin = hz.r + IN;
        if (hdx * hdx + hdy * hdy <= hmin * hmin && !NOCLIP) { out.died = true; return; }
      } else if (hz.rot && (hz.cx !== undefined)) {
        if (!NOCLIP && rotOverlap(hz.cx, hz.cy, hz.w, hz.h, hz.rot, p.x, p.y, IN)) { out.died = true; return; }
      } else if (!NOCLIP && overlaps(p.x - IN, p.x + IN, p.y - IN, p.y + IN, hz)) { out.died = true; return; }
    }

    // portals: entry-triggered but ONCE PER ATTEMPT (reference latches _activatedByPlayer until
    // the run restarts, so re-crossing a gravity portal never re-flips). Rotated portals use an
    // oriented-box test plus a sweep from the previous substep position; teleport portals keep
    // their entry hitbox shifted 15 units along the portal's facing axis (baked at build time).
    var PH = p.mode === 'wave' ? (p.isMini ? 3 : 4.5) : p.half;
    var newPortals = [];
    var touchingTP = false;
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

    // orbs: a fresh press, or a held press buffered from earlier (ground modes only), activates one.
    // orbHoldUsed makes one press / hold activate at most one orb; ship / ufo always need a fresh press.
    if (input.pressed) p.orbHoldUsed = false;
    if (!input.hold) p.orbIdx = -1;
    var buffered = p.mode !== 'ship' && p.mode !== 'ufo' && input.hold && !input.pressed && !p.orbHoldUsed;
    if ((input.pressed || buffered) && p.orbIdx < 0) {
      for (i = 0; i < aOrbs.length; i++) {
        var o = aOrbs[i], OR = o.R !== undefined ? o.R : C.ORB_R;
        if (overlaps(L, R, B, T, { x0: o.cx - OR, x1: o.cx + OR, y0: o.cy - OR, y1: o.cy + OR })) {
          p.orbIdx = o._id; p.orbHoldUsed = true; applyOrb(p, o.id, o.rot); break;
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

    var wasOnGround = p.onGround;
    p.onGround = false;
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

    // breakable blocks: contact breaks them and they do not block
    var aBreak = lv.breakables || [];
    for (i = 0; i < aBreak.length; i++) {
      if (overlaps(L, R, B, T, aBreak[i])) out.breaks.push(aBreak[i].ref);
    }

    // solid blocks. The wave lands on tops / ceilings like the other modes (the reference
    // lands a wave touching a surface); only a real side / head hit into the inner box kills it.
    if (p.mode === 'wave') {
      for (i = 0; i < aSolids.length; i++) {
        s = aSolids[i];
        if (!(R > s.x0 && L < s.x1)) continue;
        if (!(T > s.y0 && B < s.y1)) continue;
        var wLanded = false;
        if (flip > 0) {
          wLanded = p.vy <= 0 && p.lastY - H >= s.y1 - C.EPS && B < s.y1;
          if (wLanded) p.y = s.y1 + H;
        } else {
          wLanded = p.vy >= 0 && p.lastY + H <= s.y0 + C.EPS && T > s.y0;
          if (wLanded) p.y = s.y0 - H;
        }
        if (wLanded) { p.vy = 0; p.onGround = true; }
        else if (!NOCLIP && overlaps(p.x - IN, p.x + IN, p.y - IN, p.y + IN, s)) { out.died = true; return; }
        B = p.y - H; T = p.y + H;
      }
      return;
    }
    for (i = 0; i < aSolids.length; i++) {
      s = aSolids[i];
      if (!(R > s.x0 && L < s.x1)) continue;
      if (!(T > s.y0 && B < s.y1)) continue;
      var landed = false;
      if (flip > 0) {
        landed = p.vy <= 0 && p.lastY - H >= s.y1 - C.EPS && B < s.y1;
        if (landed) p.y = s.y1 + H;
      } else {
        landed = p.vy >= 0 && p.lastY + H <= s.y0 + C.EPS && T > s.y0;
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
        if (!NOCLIP && overlaps(p.x - IN, p.x + IN, p.y - IN, p.y + IN, s)) { out.died = true; return; }
        if (flip > 0 && p.vy > 0 && p.lastY + H <= s.y0 + C.EPS && T > s.y0) { p.y = s.y0 - H; p.vy = 0; }
        else if (flip < 0 && p.vy < 0 && p.lastY - H >= s.y1 - C.EPS && B < s.y1) { p.y = s.y1 + H; p.vy = 0; }
      }
      B = p.y - H; T = p.y + H;
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
    if (!lv.g) buildGrids(lv);
    var out = { died: false, portal: null, speed: null, teleportY: null, coins: [], breaks: [] };
    var dt = sub * C.D;
    p.tickN++;
    p.lastY = p.y;
    p.lastX = p.x;
    // dash orb: the dash ends on release or on landing; presses are inert while dashing
    if (p.dashing && (!input.hold || p.onGround)) { p.dashing = false; p.dashVy = 0; }
    if (p.dashing) {
      p.vy = p.dashVy;
    } else {
      if (input.pressed) onPress(p, lv, out);
      if (out.died) { p.dead = true; return out; }
      switch (p.mode) {
        case 'cube': cubeJump(p, dt, input.hold); break;
        case 'ship': shipFly(p, dt, input.hold); break;
        case 'ball': ballJump(p, dt); break;
        case 'ufo': ufoJump(p, dt, input.hold); break;
        case 'wave': waveMove(p, input.hold); break;
        case 'robot': robotJump(p, dt, input.hold, input.pressed); break;
        case 'spider': spiderFall(p, dt); break;
        case 'swing': swingMove(p, dt); break;
      }
    }
    if (p.dead) return out;
    p.x += sub * p.speed * C.D;
    p.y += p.vy * dt;
    // reference cap: the player dies above the level top (7560 in 2x units)
    if (p.y > 3780 || p.y < -3780) { out.died = true; }
    collide(p, lv, out, input);
    if (out.died) p.dead = true;
    // reference clamp: getCeilingY() snapping covers ship/ufo/wave/spider AND ball (the ball
    // rolls on the fly-band ceiling when gravity is flipped); cube and robot are exempt ('iscube')
    if (!p.dead && p.flyCeil !== null && p.flyCeil !== undefined && p.mode !== 'cube' && p.mode !== 'robot') {
      if (p.y + p.half >= p.flyCeil) {
        // reference hitGround + onCeiling: the spider can teleport from a pinned ceiling
        p.y = p.flyCeil - p.half; p.vy = 0; p.onGround = true; p.canJump = true; p.isJumping = false;
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

  function setMode(p, mode) {
    p.dashing = false; p.dashVy = 0;
    if (FLY_MODES[mode] !== undefined) setFlyBounds(p, p.y, FLY_MODES[mode]);
    else { p.flyFloor = null; p.flyCeil = null; }
    p.mode = mode;
    p.isJumping = false;
    p.rotActive = false;
    p.gdAccel = false;
    if (mode === 'ship' || mode === 'ufo' || mode === 'wave' || mode === 'robot') p.rot = 0;
    if (mode === 'robot') { p.robotAccel = 1.5; p.robotHold = false; }
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
// Level model (grid-based), GD object ids, GMD import/export, conversion to physics arrays.
