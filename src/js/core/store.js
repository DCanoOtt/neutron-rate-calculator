// ---------- Observable page state ----------
// Store.create(raw) returns the state object S. Assigning a property of S (S.layOn = ..., S.tgtSel = 'front') or changing the
// arrays and small objects that are registered as reactive (comps, layOn, lay, stash) marks that key as changed. The views, which
// are registered with Store.view(name, deps, fn), are then run once, in registration order, for the keys that changed: on the next
// microtask, or at once with Store.flush(). Large data (tables, results) are plain properties and are never wrapped.
// Components and other objects inside the reactive arrays are returned as they are (not wrapped), so indexOf and === keep working.
const Store = (() => {
  const views = []; let dirty = new Set(), queued = false, running = false;
  const touch = (...keys) => { for (const k of keys) dirty.add(k); if (!queued && !running) { queued = true; queueMicrotask(flush); } };
  function flush() {
    queued = false;
    if (running) return;
    running = true;
    try {
      for (let round = 0; dirty.size && round < 5; round++) {          // a view may change state again: a few rounds settle it
        const d = dirty; dirty = new Set();
        for (const v of views) if (v.deps.some(k => d.has(k))) { try { v.fn(); } catch (e) { if (typeof console !== 'undefined') console.error('view ' + v.name + ':', e); } }
      }
      dirty.clear();
    } finally { running = false; }
  }
  const view = (name, deps, fn) => { views.push({ name, deps, fn }); };
  const isPlain = v => v && typeof v === 'object' && !ArrayBuffer.isView(v) && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype);
  // shallow: the container reports its own changes, the values inside are returned unwrapped
  const shallow = (obj, key) => new Proxy(obj, {
    set(t, p, v) { if (t[p] !== v) { t[p] = v; touch(key); } return true; },
    deleteProperty(t, p) { if (p in t) { delete t[p]; touch(key); } return true; }
  });
  // deep: nested plain objects report too (for small structures of numbers and flags)
  const deep = (obj, key) => new Proxy(obj, {
    get(t, p) { const v = t[p]; return isPlain(v) ? deep(v, key) : v; },
    set(t, p, v) { if (t[p] !== v) { t[p] = v; touch(key); } return true; },
    deleteProperty(t, p) { if (p in t) { delete t[p]; touch(key); } return true; }
  });
  const unwrap = v => v;
  const KINDS = { comps: shallow, stash: shallow, layOn: deep, lay: deep };
  function create(raw) {
    const store = {};
    for (const k of Object.keys(raw)) store[k] = KINDS[k] && isPlain(raw[k]) ? KINDS[k](raw[k], k) : raw[k];
    return new Proxy(store, {
      set(t, k, v) {
        const w = KINDS[k] && isPlain(v) ? KINDS[k](v, k) : v;
        if (t[k] !== w) { const changed = t[k] !== v; t[k] = w; if (changed || KINDS[k]) touch(k); }
        return true;
      }
    });
  }
  return { create, view, touch, flush };
})();
