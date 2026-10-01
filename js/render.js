'use strict';

const COLORS = {
  bg: '#07080f',
  grid: 'rgba(120,140,255,0.05)',
  road: '#151a2e',
  wallA: '#3cf0ff',
  wallB: '#ff3cac',
  gold: '#ffd166',
  text: '#c9d1ff',
  dim: '#5a6290',
};

function sizeCanvas(canvas, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = cssH != null ? cssH : canvas.clientHeight;
  if (cssH != null) canvas.style.height = cssH + 'px';
  const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.cam = { x: WORLD.w / 2, y: WORLD.h / 2, z: 1 };
    this.w = 1; this.h = 1;
  }

  fitScale() {
    return Math.min(this.w / WORLD.w, this.h / WORLD.h) * 0.96;
  }

  updateCamera(target, follow, instant) {
    const fit = this.fitScale();
    const tz = follow && target ? fit * 2.3 : fit;
    const tx = follow && target ? target.x : WORLD.w / 2;
    const ty = follow && target ? target.y : WORLD.h / 2;
    const k = instant ? 1 : 0.12;
    this.cam.z += (tz - this.cam.z) * k;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.cam.z + this.cam.x, y: (sy - this.h / 2) / this.cam.z + this.cam.y };
  }

  render(state) {
    const { ctx, w, h } = sizeCanvas(this.canvas);
    this.w = w; this.h = h;
    this.updateCamera(state.camTarget || state.leader, state.follow, state.instantCam);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.cam.z, this.cam.z);
    ctx.translate(-this.cam.x, -this.cam.y);

    this.drawGrid(ctx);
    if (state.track) this.drawTrack(ctx, state.track);
    if (state.drawing) this.drawSketch(ctx, state.drawing);
    else this.drawCars(ctx, state.cars, state.leader, state.showSensors);

    ctx.restore();
  }

  drawGrid(ctx) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -400; x <= WORLD.w + 400; x += 50) { ctx.moveTo(x, -400); ctx.lineTo(x, WORLD.h + 400); }
    for (let y = -400; y <= WORLD.h + 400; y += 50) { ctx.moveTo(-400, y); ctx.lineTo(WORLD.w + 400, y); }
    ctx.stroke();
  }

  drawTrack(ctx, t) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = COLORS.road;
    ctx.lineWidth = t.width;
    ctx.stroke(t.roadPath);

    // faint gates
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < t.n; i += 8) {
      ctx.moveTo(t.wallA[i].x, t.wallA[i].y);
      ctx.lineTo(t.wallB[i].x, t.wallB[i].y);
    }
    ctx.stroke();

    // center dashes
    ctx.setLineDash([10, 14]);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1.5;
    ctx.stroke(t.roadPath);
    ctx.setLineDash([]);

    // checkered start line
    const a = t.wallA[0], b = t.wallB[0];
    const squares = 8;
    const nx = Math.cos(t.dir[0]) * 5, ny = Math.sin(t.dir[0]) * 5;
    for (let s = 0; s < squares; s++) {
      for (let r = 0; r < 2; r++) {
        ctx.fillStyle = (s + r) % 2 ? '#ffffff' : '#111';
        const p0 = s / squares, p1 = (s + 1) / squares;
        const x0 = a.x + (b.x - a.x) * p0, y0 = a.y + (b.y - a.y) * p0;
        const x1 = a.x + (b.x - a.x) * p1, y1 = a.y + (b.y - a.y) * p1;
        ctx.beginPath();
        ctx.moveTo(x0 + nx * r, y0 + ny * r);
        ctx.lineTo(x1 + nx * r, y1 + ny * r);
        ctx.lineTo(x1 + nx * (r + 1), y1 + ny * (r + 1));
        ctx.lineTo(x0 + nx * (r + 1), y0 + ny * (r + 1));
        ctx.closePath();
        ctx.fill();
      }
    }

    // neon walls
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 14;
    ctx.shadowColor = COLORS.wallA;
    ctx.strokeStyle = COLORS.wallA;
    ctx.stroke(t.wallAPath);
    ctx.shadowColor = COLORS.wallB;
    ctx.strokeStyle = COLORS.wallB;
    ctx.stroke(t.wallBPath);
    ctx.shadowBlur = 0;
  }

  drawSketch(ctx, pts) {
    if (pts.length < 2) return;
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 4;
    ctx.shadowBlur = 12;
    ctx.shadowColor = COLORS.gold;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(255,209,102,0.4)';
    ctx.beginPath();
    ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.lineTo(pts[0].x, pts[0].y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawCars(ctx, cars, leader, showSensors) {
    if (!cars.length) return;

    // leader trail, colored by speed
    if (leader && leader.trail.length > 6) {
      const tr = leader.trail;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      const segs = tr.length / 3;
      for (let i = 1; i < segs; i++) {
        const spd = tr[i * 3 + 2] / MAX_SPEED;
        ctx.strokeStyle = `hsla(${200 - spd * 160},100%,60%,${(i / segs) * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(tr[(i - 1) * 3], tr[(i - 1) * 3 + 1]);
        ctx.lineTo(tr[i * 3], tr[i * 3 + 1]);
        ctx.stroke();
      }
    }

    // dead first, then alive, then leader on top
    for (const c of cars) if (!c.alive && !c.finished && c !== leader) this.drawCar(ctx, c, 0.13, false);
    for (const c of cars) if ((c.alive || c.finished) && c !== leader) this.drawCar(ctx, c, 0.85, false);

    if (leader) {
      if (showSensors && leader.alive) {
        for (let k = 0; k < leader.hits.length; k++) {
          const h = leader.hits[k], v = leader.sensors[k];
          const col = `hsla(${120 - v * 120},100%,60%,`;
          ctx.strokeStyle = col + '0.55)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(leader.sx, leader.sy);
          ctx.lineTo(h.x, h.y);
          ctx.stroke();
          ctx.fillStyle = col + '1)';
          ctx.beginPath();
          ctx.arc(h.x, h.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      this.drawCar(ctx, leader, 1, true);
    }
  }

  drawCar(ctx, c, alpha, glow) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.globalAlpha = alpha;
    if (glow) { ctx.shadowColor = c.color; ctx.shadowBlur = 20; }
    ctx.fillStyle = c.color;
    const s = glow ? 1.25 : 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-10 * s, -5 * s, 20 * s, 10 * s, 3 * s);
    else ctx.rect(-10 * s, -5 * s, 20 * s, 10 * s);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(1 * s, -3.5 * s, 4 * s, 7 * s);
    if (c.crashed) {
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4);
      ctx.stroke();
    }
    ctx.restore();
  }
}

const INPUT_LABELS = ['◤ L2', '◤ L1', '▲ F', '◥ R1', '◥ R2', 'speed'];
const OUTPUT_LABELS = ['steer', 'gas'];

class BrainView {
  constructor(canvas) { this.canvas = canvas; }

  draw(net) {
    const { ctx, w, h } = sizeCanvas(this.canvas, 210);
    ctx.clearRect(0, 0, w, h);
    if (!net) return;
    const L = net.layers;
    const padL = 46, padR = 44, padY = 14;
    const pos = L.map((n, l) => {
      const x = padL + ((w - padL - padR) * l) / (L.length - 1);
      const arr = [];
      for (let i = 0; i < n; i++) arr.push({ x, y: padY + ((h - 2 * padY) * (i + 0.5)) / n });
      return arr;
    });

    for (let l = 0; l < net.weights.length; l++) {
      const nin = L[l], nout = L[l + 1], wts = net.weights[l], act = net.acts[l];
      for (let j = 0; j < nout; j++) {
        for (let i = 0; i < nin; i++) {
          const wv = wts[j * nin + i];
          const strength = Math.min(1, Math.abs(wv * act[i]));
          ctx.strokeStyle = wv > 0 ? `rgba(60,240,255,${0.05 + strength * 0.6})` : `rgba(255,60,172,${0.05 + strength * 0.6})`;
          ctx.lineWidth = 0.5 + Math.min(2.5, Math.abs(wv));
          ctx.beginPath();
          ctx.moveTo(pos[l][i].x, pos[l][i].y);
          ctx.lineTo(pos[l + 1][j].x, pos[l + 1][j].y);
          ctx.stroke();
        }
      }
    }

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    for (let l = 0; l < L.length; l++) {
      for (let i = 0; i < L[l]; i++) {
        const p = pos[l][i], a = net.acts[l][i];
        const r = l === 0 || l === L.length - 1 ? 6 : 5;
        ctx.fillStyle = a >= 0 ? `rgba(60,240,255,${0.15 + Math.min(1, a) * 0.85})` : `rgba(255,60,172,${0.15 + Math.min(1, -a) * 0.85})`;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (l === 0) {
          ctx.fillStyle = COLORS.dim;
          ctx.textAlign = 'right';
          ctx.fillText(INPUT_LABELS[i] || '', p.x - 10, p.y);
        } else if (l === L.length - 1) {
          ctx.fillStyle = COLORS.text;
          ctx.textAlign = 'left';
          ctx.fillText(`${OUTPUT_LABELS[i]} ${a >= 0 ? '+' : ''}${a.toFixed(2)}`, p.x - 20, p.y - 14);
        }
      }
    }
  }
}

class FitnessChart {
  constructor(canvas) { this.canvas = canvas; }

  draw(history) {
    const { ctx, w, h } = sizeCanvas(this.canvas, 150);
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 30, r: 8, t: 10, b: 20 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    ctx.font = '10px "JetBrains Mono", monospace';

    if (!history.length) {
      ctx.fillStyle = COLORS.dim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('waiting for first generation…', w / 2, h / 2);
      return;
    }

    const maxY = Math.max(0.5, ...history.map(s => s.best));
    const N = history.length;
    const xOf = i => pad.l + (N === 1 ? iw / 2 : (iw * i) / (N - 1));
    const yOf = v => pad.t + ih - (v / maxY) * ih;

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.fillStyle = COLORS.dim;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    for (let k = 0; k <= 3; k++) {
      const v = (maxY * k) / 3, y = yOf(v);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(v.toFixed(1), pad.l - 4, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`gen ${history[0].gen}`, pad.l + 18, h - pad.b + 5);
    ctx.fillText(`gen ${history[N - 1].gen}`, w - pad.r - 22, h - pad.b + 5);

    // finish line at LAPS
    if (maxY >= LAPS) {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255,209,102,0.35)';
      ctx.beginPath(); ctx.moveTo(pad.l, yOf(LAPS)); ctx.lineTo(w - pad.r, yOf(LAPS)); ctx.stroke();
      ctx.setLineDash([]);
    }

    const line = (key, color, fill) => {
      ctx.beginPath();
      history.forEach((s, i) => (i ? ctx.lineTo(xOf(i), yOf(s[key])) : ctx.moveTo(xOf(i), yOf(s[key]))));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (fill) {
        ctx.lineTo(xOf(N - 1), yOf(0));
        ctx.lineTo(xOf(0), yOf(0));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
    };
    line('avg', '#3cf0ff', 'rgba(60,240,255,0.08)');
    line('best', COLORS.gold, null);
  }
}
