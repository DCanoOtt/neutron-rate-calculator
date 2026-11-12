const test = require('node:test'), assert = require('node:assert/strict');
const { Store } = require('../dist/core.js');
// Store.view registers globally, so each test uses its own keys
test('a view runs once for several changes of its keys, in the same flush', () => {
  const S = Store.create({ a: 1, b: 2, c: 3 }); let n = 0;
  Store.view('t1', ['a1', 'b1'], () => { n++; });
  S.a = 5; Store.touch('a1'); Store.touch('b1'); Store.flush();
  assert.equal(n, 1);
  Store.flush(); assert.equal(n, 1);                         // nothing changed: nothing runs
});
test('assigning a property marks its key; same value does not', () => {
  const S = Store.create({ x: 1 }); let n = 0;
  Store.view('t2', ['x'], () => { n++; });
  S.x = 1; Store.flush(); assert.equal(n, 0);
  S.x = 2; Store.flush(); assert.equal(n, 1);
});
test('reactive arrays: push and reassignment notify, elements are not wrapped', () => {
  const S = Store.create({ comps: [] }); let n = 0;
  Store.view('t3', ['comps'], () => { n++; });
  const c = { label: 'Fe-56' };
  S.comps.push(c); Store.flush(); assert.equal(n, 1);
  assert.equal(S.comps.indexOf(c), 0); assert.ok(S.comps[0] === c);
  S.comps = S.comps.filter(() => false); Store.flush(); assert.equal(n, 2); assert.equal(S.comps.length, 0);
  assert.ok(Array.isArray(S.comps));
});
test('deep objects: nested assignment notifies', () => {
  const S = Store.create({ layOn: { front: false }, lay: { front: { mass: 1 } } }); let a = 0, b = 0;
  Store.view('t4', ['layOn'], () => { a++; }); Store.view('t5', ['lay'], () => { b++; });
  S.layOn.front = true; S.lay.front.mass = 3; Store.flush();
  assert.equal(a, 1); assert.equal(b, 1); assert.equal(S.lay.front.mass, 3);
  S.layOn = { front: false }; Store.flush(); assert.equal(a, 2);
});
test('a view that changes state again settles within a few rounds', () => {
  const S = Store.create({ sel: 'front', layOn: { front: false } }); const log = [];
  Store.view('t6', ['layOn', 'sel'], () => { if (!S.layOn.front && S.sel === 'front') S.sel = 'sample'; log.push(S.sel); });
  S.layOn = { front: false }; Store.flush();
  assert.equal(S.sel, 'sample'); assert.ok(log.length >= 1 && log.length <= 3);
});
test('a failing view does not stop the others', () => {
  const S = Store.create({ q: 0 }); let ok = 0; const err = console.error; console.error = () => { };
  Store.view('t7', ['q'], () => { throw new Error('x'); }); Store.view('t8', ['q'], () => { ok++; });
  S.q = 1; Store.flush(); console.error = err; assert.equal(ok, 1);
});
test('microtask flush happens without an explicit call', async () => {
  const S = Store.create({ m: 0 }); let n = 0; Store.view('t9', ['m'], () => { n++; });
  S.m = 1; assert.equal(n, 0); await Promise.resolve(); await Promise.resolve(); assert.equal(n, 1);
});
