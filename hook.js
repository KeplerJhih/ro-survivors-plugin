// RO Survivors Bot — hook (MAIN world, document_start). Runs once per page load and is never hot-reloaded.
// The bundle's class-field helper ends up calling Object.defineProperty(this, key, …) in each constructor,
// so we capture objects by unique field names:  replayMoves → run (combat),  talkTo → lobby.
(() => {
  if (window.__roHook) return;
  const H = (window.__roHook = { run: null, lobby: null, runs: 0, runSeq: 0, drops: 0, stuck: 0 });
  const WATCH = { replayMoves: 'run', talkTo: 'lobby' };
  const odp = Object.defineProperty;
  const capture = (o, k) => {
    const slot = WATCH[k];
    if (slot === 'run' && H.run !== o) { H.runs++; H.runSeq++; H.runStartedAt = Date.now(); }
    H[slot] = o;
    console.log('%c[roBot]', 'color:#5b8def', `captured ${slot}`);
  };
  Object.defineProperty = function (o, k, d) {
    if (o && typeof o === 'object' && WATCH[k]) capture(o, k);
    return odp.call(Object, o, k, d);
  };
  for (const k of Object.keys(WATCH)) {
    odp(Object.prototype, k, {
      configurable: true,
      get() { return undefined; },
      set(v) { odp(this, k, { value: v, writable: true, enumerable: true, configurable: true }); capture(this, k); },
    });
  }
})();
