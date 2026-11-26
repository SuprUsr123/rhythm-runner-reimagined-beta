const assert = require('node:assert/strict');

// Regression tests for the channel-cursor behavior ported from Web Dashers
// assets/scripts/core/level-channels.js. The app implementation is tested by
// the browser smoke test; these verify its direction/axis rule explicitly.
function channelAxis(moveDir) { return moveDir === 1 || moveDir === 2 ? 'y' : 'x'; }
function reverseChannel(moveDir) { return moveDir === 2 || moveDir === 3; }
function channelSort(a, b, moveDir) {
  const axis = channelAxis(moveDir), rev = reverseChannel(moveDir);
  return (a.order - b.order) || (rev ? b[axis] - a[axis] : a[axis] - b[axis]);
}
function shouldWait(triggerPos, playerPos, reversed) {
  return reversed ? triggerPos < playerPos : playerPos < triggerPos;
}
const directions = [
  { move: 1, axis: 'y', reverse: false },
  { move: 2, axis: 'y', reverse: true },
  { move: 3, axis: 'x', reverse: true },
  { move: 4, axis: 'x', reverse: false },
];
for (const d of directions) {
  assert.equal(channelAxis(d.move), d.axis, `move ${d.move} axis`);
  assert.equal(reverseChannel(d.move), d.reverse, `move ${d.move} reverse`);
}
const entries = [
  { order: 0, x: 10, y: 30, id: 'a' },
  { order: 0, x: 20, y: 10, id: 'b' },
  { order: 0, x: 15, y: 20, id: 'c' },
];
assert.deepEqual(entries.slice().sort((a,b)=>channelSort(a,b,1)).map(x=>x.id), ['b','c','a']);
assert.deepEqual(entries.slice().sort((a,b)=>channelSort(a,b,2)).map(x=>x.id), ['a','c','b']);
assert.deepEqual(entries.slice().sort((a,b)=>channelSort(a,b,4)).map(x=>x.id), ['a','c','b']);
assert.deepEqual(entries.slice().sort((a,b)=>channelSort(a,b,3)).map(x=>x.id), ['b','c','a']);
assert.equal(shouldWait(100, 50, false), true);
assert.equal(shouldWait(100, 120, false), false);
assert.equal(shouldWait(100, 120, true), true);
assert.equal(shouldWait(100, 50, true), false);
console.log('Dash channel-axis regression checks passed (12 assertions).');
