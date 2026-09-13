'use strict';
// Fast, deterministic gesture checks. No browser, global input hook or game API is used.
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const { createRequire } = require('node:module'), { loadFrontend } = require('./frontend-loader.cjs');
const root = path.resolve(__dirname, '..'), req = createRequire(path.join(root, 'frontend/package.json'));
const React = req('react'), { renderToStaticMarkup } = req('react-dom/server');
let count = 0;
const check = (condition, message) => { assert.ok(condition, message); count++; };

function scenario(callback) {
  const previous = Object.fromEntries(['window', 'document', 'performance', 'setInterval', 'clearInterval', 'Element'].map(name => [name, global[name]]));
  const handlers = new Map(), documentHandlers = new Map(), cells = [];
  let cursor = 0, effect, tick, now = 0, cleanup, paused = false, bellyStarts = 0;
  const hooks = { ...React,
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], next => { cells[index] = typeof next === 'function' ? next(cells[index]) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in cells)) cells[index] = { current: initial }; return cells[index]; },
    useCallback: callback => callback, useEffect: callback => { effect = callback; },
  };
  const { usePuppyInput } = loadFrontend('src/components/use-puppy-input.ts', { react: hooks });
  const stage = { current: { querySelector: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) } };
  const render = () => { cursor = 0; return usePuppyInput(stage, paused, () => { bellyStarts++; }); };
  try {
    global.window = { addEventListener: (name, handler) => handlers.set(name, handler), removeEventListener: name => handlers.delete(name) };
    global.document = { hidden: false, addEventListener: (name, handler) => documentHandlers.set(name, handler), removeEventListener: name => documentHandlers.delete(name) };
    global.Element = class {
      constructor(kind) { this.kind = kind; }
      closest(selector) {
        if (/room-puppy|garden-dog/.test(selector)) return this.kind === 'dog' ? this : null;
        return this.kind === 'control' || this.kind === 'dog' ? this : null;
      }
    };
    global.performance = { now: () => now };
    global.setInterval = callback => { tick = callback; return 1; }; global.clearInterval = () => {};
    render(); cleanup = effect();
    callback({
      at(time) { now = time; },
      click(time, button = 0, kind = 'background') { now = time; handlers.get('pointerdown')?.({ button, isPrimary: true, pointerType: 'mouse', target: new global.Element(kind) }); },
      key(time) { now = time; handlers.get('keydown')?.({}); },
      scroll(time) { now = time; handlers.get('wheel')?.({}); },
      move(time) { now = time; handlers.get('pointermove')?.({ clientX: 500, clientY: 500 }); },
      cancel() { render().cancelReaction(); },
      pause() { cleanup?.(); paused = true; render(); cleanup = effect(); },
      resume() { cleanup?.(); paused = false; render(); cleanup = effect(); },
      blur() { handlers.get('blur')?.(); },
      tick(time) { now = time; tick(); },
      mood() { return render().reaction?.mood ?? 'idle'; },
      started() { return render().reaction?.at; },
      active() { return render().isBellyActive(); },
      starts() { return bellyStarts; },
    });
  } finally {
    cleanup?.();
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete global[name]; else global[name] = value; }
  }
}

scenario(p => {
  for (const time of [1000, 1300, 1600, 1900]) { p.click(time); check(p.mood() === 'play', 'First four primary clicks keep the ordinary hop'); }
  p.click(2200); check(p.mood() === 'belly' && p.active(), 'Five primary clicks at the inclusive 1200ms boundary trigger belly');
  check(p.starts() === 1, 'Fifth click synchronously clears prior manual petting through its start callback');
  check(p.started() === 2200, 'Belly starts exactly on the fifth click');
  p.key(2500); p.scroll(2600); p.move(2700);
  check(p.mood() === 'belly', 'Keyboard, wheel and mouse movement do not clobber belly');
  for (let time = 2800; time < 4300; time += 30) p.click(time, 0, 'dog');
  check(p.mood() === 'belly' && p.started() === 2200, 'Further dog clicks do not restart or extend the protected reaction');
  check(p.starts() === 1, 'Protected clicks cannot invoke the manual-reset callback again');
  p.tick(4599); check(p.mood() === 'belly', 'Belly remains active until its full 2400ms duration ends');
  p.tick(4600); check(p.mood() === 'idle' && !p.active(), 'Belly ends at 2400ms and returns to idle');
  p.click(4700); check(p.mood() === 'play', 'After finishing, a new click begins a fresh ordinary sequence');
});
scenario(p => { for (const time of [1000, 1301, 1602, 1903, 2204]) p.click(time); check(p.mood() !== 'belly', 'Five clicks outside a rolling 1200ms window do not trigger belly'); });
scenario(p => {
  for (const time of [1000, 1100, 1200, 1300, 1400]) p.click(time, 2);
  check(p.mood() !== 'belly', 'Five right clicks cannot trigger belly');
  for (const time of [1500, 1600, 1700, 1800]) p.click(time, 0);
  check(p.mood() !== 'belly', 'Right clicks do not contribute to the primary click count');
});
scenario(p => {
  for (const time of [1000, 1100, 1200, 1300, 1400]) p.click(time, 0, 'control');
  check(p.mood() !== 'belly', 'Explicit care/form controls cannot accidentally trigger belly');
  for (const time of [1500, 1600, 1700, 1800, 1900]) p.click(time, 0, 'dog');
  check(p.mood() === 'belly' && p.active(), 'The actual puppy button participates in the five-click gesture');
});
scenario(p => {
  for (const time of [1000, 1100, 1200, 1300]) p.click(time);
  p.cancel(); p.click(1400); check(p.mood() === 'play', 'Explicit action or drag cancellation clears the partial burst');
  for (const time of [1500, 1600, 1700, 1800]) p.click(time);
  check(p.mood() === 'belly', 'A fresh burst works after explicit cancellation');
  p.cancel(); check(p.mood() === 'idle' && !p.active(), 'Explicit action or drag cancellation immediately clears belly');
});
scenario(p => {
  for (const time of [1000, 1100, 1200, 1300]) p.click(time);
  p.pause(); p.resume(); p.click(1400);
  check(p.mood() === 'play', 'Pause/resume clears the partial click burst');
  for (const time of [1500, 1600, 1700, 1800]) p.click(time);
  p.pause(); check(p.mood() === 'idle' && !p.active(), 'Pause cancels an active belly reaction');
});
scenario(p => {
  for (const time of [1000, 1100, 1200, 1300, 1400]) p.click(time);
  p.blur(); check(p.mood() === 'idle' && !p.active(), 'Leaving the page cancels belly and resets its gesture');
});

const { PixelDog } = loadFrontend('src/components/pixel-dog.tsx');
for (const styleId of ['classic', 'art-16-scenes', 'art-16']) {
  const svg = renderToStaticMarkup(React.createElement(PixelDog, { styleId, breed: 'pomeranian', mood: 'belly', groundShadow: false }));
  check(svg.includes('<svg') && !/NaN|Infinity|undefined\.png|belly\.png/.test(svg), `${styleId} can render belly without requiring a nonexistent image asset`);
  check(/class="[^"]*\bbelly\b/.test(svg) || svg.includes('data-dog-reaction="belly"'), `${styleId} receives the one-time belly motion`);
  const paused = renderToStaticMarkup(React.createElement(PixelDog, { styleId, breed: 'pomeranian', mood: 'belly', paused: true }));
  check(!/class="[^"]*\bbelly\b/.test(paused) && !paused.includes('data-dog-reaction="belly"'), `${styleId} pause removes belly motion`);
}
const css = fs.readFileSync(path.join(root, 'frontend/src/components/puppy-belly-reaction.module.css'), 'utf8');
check(/animation:\s*belly\s+2400ms\s+ease-in-out\s+1\s+both/.test(css) && !/infinite/.test(css), 'Belly runs once for 2400ms and does not spin indefinitely');
check(/0%,\s*100%\s*\{\s*transform:\s*rotate\(0deg\)/.test(css) && /rotate\(180deg\)/.test(css) && !/rotate\(360deg\)/.test(css), 'Belly starts upright, stays on its back and returns upright');
check(css.includes('motion-paused') && css.includes('prefers-reduced-motion: reduce'), 'Pause and reduced-motion preferences stop belly animation');
const { PuppyClickBurst } = loadFrontend('src/lib/puppy-click-burst.ts');
const invalidClock = new PuppyClickBurst();
for (const time of [1000, 1100, 1200, 1300]) invalidClock.register(time);
check(!invalidClock.register(NaN) && !invalidClock.register(Infinity), 'Invalid event times cannot add a gesture click');
check(invalidClock.register(1400), 'Ignoring invalid event times retains the valid click sequence');
const backwardClock = new PuppyClickBurst();
for (const time of [1000, 1100, 1200, 1300]) backwardClock.register(time);
check(!backwardClock.register(500) && !backwardClock.register(600), 'A backward clock resets a partial click sequence');
const activeBackwardClock = new PuppyClickBurst();
for (const time of [1000, 1100, 1200, 1300, 1400]) activeBackwardClock.register(time);
activeBackwardClock.register(500);
check(!activeBackwardClock.active(500), 'A backward clock cannot leave an old belly animation protected');
console.log(`PASS ${count} fast-five-click belly checks.`);
