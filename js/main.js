'use strict';

const LAYERS = [NUM_INPUTS, 10, 8, 2];
const STORAGE_KEY = 'neuroracer.champion';
const $ = id => document.getElementById(id);

const tracks = buildTracks();
let track = tracks[0];
const pop = new Population(60, LAYERS);

let cars = [];
let genSteps = 0, maxSteps = 0;
let paused = false;
let mode = 'train';          // 'train' | 'race' | 'draw'
let drawing = null;          // points while sketching a track
let race = null;
let bestLapAll = Infinity;
let customCount = 0;
let frameNo = 0;
let instantCam = true;

const settings = { speed: 5, turbo: false, follow: false, sensors: true };
const keys = {};

const renderer = new Renderer($('game'));
const brainView = new BrainView($('brain'));
const chart = new FitnessChart($('chart'));

// ---------- helpers ----------

function colorFor(i) {
  const tag = pop.tags[i];
  if (tag === 'elite') return COLORS.gold;
  if (tag === 'fresh') return '#ffffff';
  return `hsl(${(i * 137.508) % 360},90%,62%)`;
}

function fmtTime(steps) {
  return isFinite(steps) ? (steps / STEPS_PER_SEC).toFixed(2) + 's' : '--';
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function banner(html) {
  const el = $('banner');
  el.innerHTML = html || '';
  el.classList.toggle('show', !!html);
}

function leaderCar() {
  let best = null;
  for (const c of cars) if (c.alive && (!best || c.maxProgress > best.maxProgress)) best = c;
  if (best) return best;
  for (const c of cars) if (!best || c.maxProgress > best.maxProgress) best = c;
  return best;
}

// ---------- training ----------

function startGeneration() {
  cars = pop.brains.map((b, i) => new Car(track, b, colorFor(i)));
  genSteps = 0;
  maxSteps = Math.round((LAPS * track.n * SPACING) / 2.2) + 240;
}

function endGeneration() {
  const stats = pop.evolve(cars, track.n);
  chart.draw(pop.history);
  if (stats.finished && pop.history.filter(s => s.finished).length === 1) {
    toast(`Gen ${stats.gen}: first car finished ${LAPS} laps!`);
  }
  startGeneration();
}

function step() {
  let alive = 0;
  for (const c of cars) {
    if (!c.alive) continue;
    c.update();
    if (c.alive) alive++;
    if (c.bestLap < bestLapAll) {
      bestLapAll = c.bestLap;
      toast(`New lap record ${fmtTime(bestLapAll)} — gen ${pop.generation}`);
    }
  }
  genSteps++;
  if (alive === 0 || genSteps >= maxSteps) endGeneration();
}

// ---------- race mode ----------

function startRace() {
  const champ = pop.champion || leaderCar().brain;
  const ai = new Car(track, champ.copy(), COLORS.gold);
  const player = new Car(track, null, '#3cf0ff');
  ai.respawn = player.respawn = true;
  race = { ai, player, countdown: 180, winner: null };
  cars = [ai, player];
  mode = 'race';
  $('btnRace').textContent = 'Exit race';
  $('stage').classList.add('racing');
  instantCam = true;
}

function stopRace() {
  race = null;
  mode = 'train';
  banner('');
  $('btnRace').textContent = 'Race the AI';
  $('stage').classList.remove('racing');
  startGeneration();
}

function stepRace() {
  const { ai, player } = race;
  if (race.countdown > 0) {
    race.countdown--;
    const n = Math.ceil(race.countdown / 60);
    banner(n > 0 ? `<b class="big">${n}</b><span>Arrow keys / WASD to drive</span>` : '<b class="big">GO!</b>');
    return;
  }
  const up = keys.ArrowUp || keys.w, down = keys.ArrowDown || keys.s;
  const left = keys.ArrowLeft || keys.a, right = keys.ArrowRight || keys.d;
  player.control.throttle = up ? 1 : down ? -1 : 0;
  player.control.steer = (right ? 1 : 0) - (left ? 1 : 0);
  ai.update();
  player.update();

  if (!race.winner) {
    if (player.finished) race.winner = 'you';
    else if (ai.finished) race.winner = 'ai';
  }
  const lap = c => `${Math.min(LAPS, c.laps + 1)}/${LAPS}`;
  if (race.winner) {
    const msg = race.winner === 'you' ? 'YOU WIN! 🏆' : 'THE AI WINS 🤖';
    banner(`<b class="big">${msg}</b><span>Your best lap ${fmtTime(player.bestLap)} · AI best lap ${fmtTime(ai.bestLap)}</span><span>Press R for a rematch</span>`);
  } else if (race.countdown > -90) {
    race.countdown--;
    banner('<b class="big">GO!</b>');
  } else {
    banner(`<span>YOU lap ${lap(player)} &nbsp;·&nbsp; AI lap ${lap(ai)}</span>`);
  }
}

// ---------- draw-your-own-track ----------

function startDraw() {
  if (mode === 'race') stopRace();
  mode = 'draw';
  drawing = [];
  instantCam = true;
  $('stage').classList.add('drawing');
  $('btnDraw').textContent = 'Cancel';
  banner('<span>Draw a closed loop with your mouse or finger</span>');
}

function endDraw() {
  mode = 'train';
  drawing = null;
  $('stage').classList.remove('drawing');
  $('btnDraw').textContent = 'Draw track';
  banner('');
}

function finishSketch() {
  const pts = drawing;
  if (!pts || pts.length < 15 || polylineLength(pts, true) < 700) {
    toast('Too small — draw a bigger loop');
    drawing = [];
    return;
  }
  customCount++;
  const t = trackFromDrawing(`Custom ${customCount}`, pts);
  tracks.push(t);
  const opt = document.createElement('option');
  opt.value = tracks.length - 1;
  opt.textContent = t.name;
  $('selTrack').appendChild(opt);
  $('selTrack').value = tracks.length - 1;
  endDraw();
  setTrack(t);
  toast('Custom track ready — watch the AI adapt!');
}

function pointerWorld(e) {
  const r = renderer.canvas.getBoundingClientRect();
  return renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
}

renderer.canvas.addEventListener('pointerdown', e => {
  if (mode !== 'draw') return;
  drawing = [pointerWorld(e)];
  renderer.canvas.setPointerCapture(e.pointerId);
});
renderer.canvas.addEventListener('pointermove', e => {
  if (mode !== 'draw' || !drawing || !drawing.length || !(e.buttons & 1)) return;
  const p = pointerWorld(e), last = drawing[drawing.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) > 5) drawing.push(p);
});
renderer.canvas.addEventListener('pointerup', () => {
  if (mode === 'draw' && drawing && drawing.length) finishSketch();
});

// ---------- UI wiring ----------

function setTrack(t) {
  track = t;
  bestLapAll = Infinity;
  if (mode === 'race') startRace();
  else startGeneration();
}

tracks.forEach((t, i) => {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = t.name;
  $('selTrack').appendChild(opt);
});
$('selTrack').addEventListener('change', e => setTrack(tracks[+e.target.value]));

function togglePause() {
  paused = !paused;
  $('btnPause').textContent = paused ? 'Resume' : 'Pause';
}
$('btnPause').addEventListener('click', togglePause);

$('btnReset').addEventListener('click', () => {
  if (mode === 'race') stopRace();
  pop.reset();
  bestLapAll = Infinity;
  chart.draw(pop.history);
  startGeneration();
  toast('Fresh random brains — evolution restarts');
});

$('btnDraw').addEventListener('click', () => (mode === 'draw' ? endDraw() : startDraw()));
$('btnRace').addEventListener('click', () => {
  if (mode === 'race') stopRace();
  else {
    if (mode === 'draw') endDraw();
    startRace();
  }
});

function bindRange(id, outId, fmt, apply) {
  const input = $(id), out = $(outId);
  const update = () => { const v = +input.value; out.textContent = fmt(v); apply(v); };
  input.addEventListener('input', update);
  update();
}
bindRange('rSpeed', 'oSpeed', v => v + '×', v => (settings.speed = v));
bindRange('rPop', 'oPop', v => String(v), v => (pop.targetSize = v));
bindRange('rMut', 'oMut', v => v + '%', v => (pop.mutationRate = v / 100));

$('cTurbo').addEventListener('change', e => (settings.turbo = e.target.checked));
$('cFollow').addEventListener('change', e => (settings.follow = e.target.checked));
$('cSensors').addEventListener('change', e => (settings.sensors = e.target.checked));

$('btnSave').addEventListener('click', () => {
  const brain = pop.champion || (leaderCar() && leaderCar().brain);
  if (!brain || !brain.layers) return toast('Nothing to save yet');
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(brain.toJSON()));
    toast(`Champion from gen ${pop.generation - 1} saved`);
  } catch (err) {
    toast('Could not save (storage unavailable)');
  }
});

$('btnLoad').addEventListener('click', () => {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (err) { data = null; }
  if (!data || String(data.layers) !== String(LAYERS)) return toast('No saved champion found');
  if (mode === 'race') stopRace();
  pop.seed(NeuralNet.fromJSON(data));
  startGeneration();
  toast('Champion loaded — population seeded from it');
});

window.addEventListener('keydown', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  keys[k] = true;
  if (mode === 'race' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
  if (k === 'r' && mode === 'race') startRace();
  if (k === ' ' && mode !== 'race') { e.preventDefault(); togglePause(); }
  if (k === 'Escape') { if (mode === 'race') stopRace(); else if (mode === 'draw') endDraw(); }
});
window.addEventListener('keyup', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys[k] = false;
});
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- main loop ----------

function updateHUD(leader) {
  if (mode === 'race') {
    $('hGen').textContent = 'RACE';
    $('hAlive').textContent = '1 v 1';
    $('hLap').textContent = race ? `${Math.min(LAPS, race.player.laps + 1)} / ${LAPS}` : '-';
    $('hBest').textContent = race ? fmtTime(race.player.bestLap) : '--';
    return;
  }
  const alive = cars.reduce((s, c) => s + (c.alive ? 1 : 0), 0);
  $('hGen').textContent = pop.generation;
  $('hAlive').textContent = `${alive} / ${cars.length}`;
  $('hLap').textContent = leader ? `${Math.max(0, leader.maxProgress / track.n).toFixed(2)} / ${LAPS}` : '-';
  $('hBest').textContent = fmtTime(bestLapAll);
}

function frame() {
  if (!paused) {
    if (mode === 'train') {
      if (settings.turbo) {
        const t0 = performance.now();
        do step(); while (performance.now() - t0 < 14);
      } else {
        for (let i = 0; i < settings.speed; i++) step();
      }
    } else if (mode === 'race') {
      stepRace();
    }
  }

  const leader = mode === 'race' ? race.player : leaderCar();
  renderer.render({
    track: mode === 'draw' ? null : track,
    cars: mode === 'draw' ? [] : cars,
    leader: mode === 'draw' ? null : leader,
    camTarget: mode === 'race' ? race.player : null,
    follow: mode === 'race' || (mode === 'train' && settings.follow),
    showSensors: settings.sensors && mode === 'train',
    drawing: mode === 'draw' ? drawing : null,
    instantCam,
  });
  instantCam = false;

  if (mode !== 'draw') brainView.draw(mode === 'race' ? race.ai.brain : leader && leader.brain);
  if (frameNo++ % 6 === 0) updateHUD(leader);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => chart.draw(pop.history));

startGeneration();
chart.draw(pop.history);
requestAnimationFrame(frame);
