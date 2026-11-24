const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Load the browser globals in the same order as index.html, then use the real importer/sim.
global.fflate = require('../assets/js/lib/fflate.js');
for (const file of [
  '../assets/js/data/objdefs.js',
  '../assets/js/data/object-meta.js',
  '../assets/js/data/children.js',
  '../assets/js/data/wd-colliders.js',
  '../assets/js/data/sheets.js',
  '../assets/js/data/glow.js',
  '../assets/js/data/skeletons.js',
  '../assets/js/data/zdefaults.js'
]) {
  vm.runInThisContext(fs.readFileSync(require.resolve(file), 'utf8'), { filename: file });
}
global.GameSim = require('../assets/js/sim.js');
vm.runInThisContext(fs.readFileSync(require.resolve('../assets/js/level-model.js'), 'utf8'), { filename: 'level-model.js' });

const C = GameSim.C;
function makeLevel(blocks) {
  const lv = {
    solids: [], spikes: [], portals: [], speeds: [], pads: [], orbs: [], coins: [],
    slopes: [], breakables: [], forceBlocks: blocks, checkpoints: []
  };
  GameSim.buildGrids(lv);
  return lv;
}
function activateBlock(block, x, y, playerOpts = {}) {
  const lv = makeLevel([block]);
  const p = GameSim.newPlayer(x, y, playerOpts.mode || 'cube');
  if (playerOpts.flip) p.flip = true;
  if (playerOpts.mini) GameSim.setMini(p, true);
  if (playerOpts.onGround) { p.onGround = true; p.canJump = true; }
  const result = GameSim.step(p, 0.25, { hold: false, pressed: false, platformer: true }, lv);
  return { p, lv, result };
}

let count = 0;
function test(name, fn) {
  fn(); count++;
  process.stdout.write(`ok ${count} - ${name}\n`);
}

const source = fs.readFileSync(require.resolve('../assets/levels/dash.txt'), 'utf8').trim();
const imported = LevelModel.importText(source);
const official = imported.level;
const officialSim = official.sim();

// 1. Both Force Block object IDs are recognized, not reported as unsupported.
test('imports both Force Block IDs from the bundled Dash level', () => {
  assert.equal(imported.skipped[2069], undefined);
  assert.equal(imported.skipped[3645], undefined);
  assert.equal(official.objs.filter(o => o.id === 2069).length, 13);
  assert.equal(official.objs.filter(o => o.id === 3645).length, 1);
  assert.equal(officialSim.forceBlocks.length, 14);
});

// 2. The seven-block hidden launch run survives import as live colliders.
test('keeps all seven hidden 2069 colliders active at x=4665..4845', () => {
  const run = officialSim.forceBlocks.filter(b => b.cx >= 4665 && b.cx <= 4845);
  assert.deepEqual(run.map(b => b.cx).sort((a, b) => a - b), [4665, 4695, 4725, 4755, 4785, 4815, 4845]);
  assert.ok(run.every(b => b.force === 1.2));
  assert.ok(run.every(b => b.w === 30 && b.h === 30));
});

// 3. The specific 3645 transition block's geometry and raw settings are preserved.
const transition = officialSim.forceBlocks.find(b => b.id === 3645);
test('preserves the exact 3645 transition block settings', () => {
  assert.ok(transition);
  assert.equal(transition.cx, 2587);
  assert.equal(transition.cy, 145);
  assert.equal(transition.rot, 180);
  assert.equal(transition.w, 30 * 1.78);
  assert.equal(transition.h, 30 * 1.78);
  assert.equal(transition.force, 4);
  assert.equal(transition.forceMin, 0);
  assert.equal(transition.forceMax, 2);
  assert.equal(transition.forceRange, true);
  assert.equal(transition.forceRadial, false);
});

// 4. Default rotation applies upward force in standard gravity.
test('rotation 0 applies upward force', () => {
  const { p } = activateBlock({ cx: 0, cy: 15, w: 30, h: 30, rot: 0, force: 1.2, forceFlipY: false }, 0, 15);
  assert.ok(p.forceAccumY > 1.19 && p.forceAccumY < 1.21);
  assert.equal(p.forceTicks, 2);
});

// 5. The actual 3645-style down vector opposes inverted gravity in the Ball mode.
test('3645 rotated force pushes away from inverted-gravity ceiling', () => {
  const { p } = activateBlock({
    id: 3645, cx: 0, cy: 145, w: 53.4, h: 53.4, rot: 180,
    force: 4, forceMin: 0, forceMax: 2, forceRange: true,
    forceRadial: false, forceId: 0, forceFlipY: false, radius: 26.7
  }, 0, 165, { mode: 'ball', flip: true });
  assert.ok(p.forceAccumY < -1.5 && p.forceAccumY > -1.9, `expected downward force, got ${p.forceAccumY}`);
  const before = p.vy;
  GameSim.step(p, 0.25, { hold: false, pressed: false, platformer: true }, makeLevel([{
    id: 3645, cx: 0, cy: 145, w: 53.4, h: 53.4, rot: 180,
    force: 4, forceMin: 0, forceMax: 2, forceRange: true,
    forceRadial: false, forceId: 0, forceFlipY: false, radius: 26.7
  }]));
  assert.ok(p.vy < before, `force should reduce inverted-gravity upward velocity: ${before} -> ${p.vy}`);
});

// 6. Range interpolation is position-dependent, and the top side reaches max force.
test('directional force range interpolates from min to max', () => {
  const mid = activateBlock({ cx: 0, cy: 15, w: 30, h: 30, rot: 0, force: 0, forceMin: 0, forceMax: 2, forceRange: true, radius: 15 }, 0, 15);
  const top = activateBlock({ cx: 0, cy: 15, w: 30, h: 30, rot: 0, force: 0, forceMin: 0, forceMax: 2, forceRange: true, radius: 15 }, 0, 0);
  assert.ok(Math.abs(mid.p.forceAccumY - 1) < 0.02, `midpoint force=${mid.p.forceAccumY}`);
  assert.ok(top.p.forceAccumY > 1.95, `top force=${top.p.forceAccumY}`);
});

// 7. Flip-Y reverses the force direction.
test('flip-Y reverses a fixed force vector', () => {
  const { p } = activateBlock({ cx: 0, cy: 15, w: 30, h: 30, rot: 0, force: 1, forceFlipY: true }, 0, 15);
  assert.ok(p.forceAccumY < -0.99);
});

// 8. Radial mode points away from the block when flip-Y is false.
test('radial force points away from its centre', () => {
  const { p } = activateBlock({ cx: 0, cy: 0, w: 30, h: 30, rot: 0, force: 1, forceRadial: true, forceFlipY: false }, 20, 0);
  assert.ok(p.forceAccumX > 0.99);
  assert.ok(Math.abs(p.forceAccumY) < 0.01);
});

// 9. Matching Force IDs are applied once per collision pass.
test('deduplicates overlapping Force Blocks with the same Force ID', () => {
  const b = { cx: 0, cy: 15, w: 30, h: 30, rot: 0, force: 1, forceId: 17, forceFlipY: false };
  const { p } = activateBlock(b, 0, 15);
  const lv = makeLevel([b, { ...b }]);
  const q = GameSim.newPlayer(0, 15, 'cube');
  GameSim.step(q, 0.25, { hold: false, pressed: false, platformer: true }, lv);
  assert.ok(Math.abs(q.forceAccumY - 1) < 1e-6, `expected one force, got ${q.forceAccumY}`);
  assert.ok(p.forceAccumY > 0);
});

// 10. Group translations move force colliders with the group.
test('group translation moves dynamic Force Block colliders', () => {
  const model = new LevelModel.Level([]);
  model.objs.push({ id: 2069, gx: 10, gy: 2, flipX: false, flipY: false, groups: [9], rawProps: { k149: '1.2' } });
  model.touch();
  const lv = model.sim();
  GameSim.refreshDyn(lv, groups => groups.includes(9) ? { dx: 90, dy: 30, rotation: 0, hidden: false } : { dx: 0, dy: 0, rotation: 0, hidden: false });
  assert.equal(lv.dyn.forceBlocks.length, 1);
  assert.equal(lv.dyn.forceBlocks[0].cx, 10 * 30 + 15 + 90);
  assert.equal(lv.dyn.forceBlocks[0].cy, 2 * 30 + 15 + 30);
});

// 11. Sideways transposition transforms the force vector, not just the rectangle.
test('sideways gameplay transposes the force direction', () => {
  const lv = makeLevel([{ id: 2069, cx: 0, cy: 15, w: 30, h: 30, rot: 0, force: 1, forceRadial: false, forceFlipY: false }]);
  const transposed = LevelModel.transposeSim(lv);
  const b = transposed.forceBlocks[0];
  assert.ok(Number.isFinite(b.forceAngle));
  assert.ok(Math.abs(b.forceAngle) < 1e-6, `expected rightward angle, got ${b.forceAngle}`);
  assert.equal(b.cx, 15);
  assert.equal(b.cy, 0);
});

// 12. Round-trip export preserves the hidden collider and all force parameters.
test('GMD export/import preserves both hidden Force Block configurations', () => {
  const roundTrip = LevelModel.importText(LevelModel.exportLevelString(official)).level;
  const objs = roundTrip.objs.filter(o => o.id === 2069 || o.id === 3645);
  assert.equal(objs.length, 14);
  const b = objs.find(o => o.id === 3645);
  assert.equal(b.rawProps.k149, '4');
  assert.equal(b.rawProps.k527, '2');
  assert.equal(b.rawProps.k529, '1');
  assert.equal(b.rawProps.k128, '1.78');
  assert.equal(b.rawProps.k129, '1.78');
  assert.equal(b.rawProps.k6, '180');
  assert.equal(objs.filter(o => o.id === 2069 && o.hidden).length, 8);
});

// 13. No-Touch disables the collider while retaining the object data.
test('No-Touch disables Force Block collision', () => {
  const model = new LevelModel.Level([]);
  model.objs.push({ id: 2069, gx: 0, gy: 0, flipX: false, flipY: false, noTouch: true, rawProps: { k121: '1', k149: '3' } });
  model.touch();
  const lv = model.sim();
  assert.equal(lv.forceBlocks.length, 0);
  assert.equal(model.objs[0].rawProps.k149, '3');
});


// 14. Run the actual bundled Dash transition state with and without its imported block.
test('bundled Dash transition impulse changes the Ball player trajectory', () => {
  function run(forceEnabled) {
    const level = { ...officialSim, forceBlocks: forceEnabled ? officialSim.forceBlocks : [] };
    GameSim.buildGrids(level);
    const p = GameSim.newPlayer(2587, 165, 'ball');
    GameSim.setMode(p, 'ball');
    p.flip = true;
    for (let i = 0; i < 12; i++) {
      const out = GameSim.step(p, 0.25, { hold: false, pressed: false }, level);
      assert.equal(out.died, false, 'transition probe should remain alive during the short test window');
    }
    return { y: p.y, vy: p.vy };
  }
  const withForce = run(true);
  const withoutForce = run(false);
  assert.ok(withForce.vy < 0, `Force Block should reverse the initial inverted-gravity rise: ${withForce.vy}`);
  assert.ok(withoutForce.vy > 0, `control case should keep rising without the block: ${withoutForce.vy}`);
  assert.ok(withForce.y < withoutForce.y, `block should lower the trajectory into the corridor: ${withForce.y} vs ${withoutForce.y}`);
});

console.log(`\n${count} Force Block compatibility tests passed.`);
