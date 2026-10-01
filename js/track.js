'use strict';

const WORLD = { w: 1200, h: 800 };
const SPACING = 14; // distance between centerline samples

function resampleClosed(pts, spacing) {
  const n = pts.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[n];
  const count = Math.max(8, Math.round(total / spacing));
  const step = total / count;
  const out = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const d = k * step;
    while (seg < n - 1 && cum[seg + 1] < d) seg++;
    const len = cum[seg + 1] - cum[seg] || 1;
    const t = (d - cum[seg]) / len;
    const a = pts[seg], b = pts[(seg + 1) % n];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function smoothClosed(pts, passes, radius = 3) {
  let cur = pts;
  const n = pts.length;
  for (let p = 0; p < passes; p++) {
    const next = [];
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0;
      for (let k = -radius; k <= radius; k++) {
        const q = cur[(i + k + n) % n];
        sx += q.x; sy += q.y;
      }
      next.push({ x: sx / (2 * radius + 1), y: sy / (2 * radius + 1) });
    }
    cur = next;
  }
  return cur;
}

function polylineLength(pts, closed) {
  let len = 0;
  const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

function closedPath(pts) {
  const p = new Path2D();
  p.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
  p.closePath();
  return p;
}

class Track {
  constructor(name, centerPts, width) {
    this.name = name;
    this.width = width;
    this.half = width / 2;
    const c = resampleClosed(centerPts, SPACING);
    const n = c.length;
    this.center = c;
    this.n = n;
    this.dir = [];
    this.wallA = [];
    this.wallB = [];
    for (let i = 0; i < n; i++) {
      const prev = c[(i - 1 + n) % n], next = c[(i + 1) % n];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const tx = dx / len, ty = dy / len;
      this.dir.push(Math.atan2(ty, tx));
      this.wallA.push({ x: c[i].x - ty * this.half, y: c[i].y + tx * this.half });
      this.wallB.push({ x: c[i].x + ty * this.half, y: c[i].y - tx * this.half });
    }
    this.roadPath = closedPath(c);
    this.wallAPath = closedPath(this.wallA);
    this.wallBPath = closedPath(this.wallB);
  }

  // Nearest point on the centerline, searching segments near `hint`.
  locate(x, y, hint, win) {
    const n = this.n, c = this.center;
    let best = Infinity, bi = hint, bt = 0, side = 0;
    for (let k = -win; k <= win; k++) {
      const i = (((hint + k) % n) + n) % n;
      const a = c[i], b = c[(i + 1) % n];
      const ex = b.x - a.x, ey = b.y - a.y;
      const L2 = ex * ex + ey * ey || 1;
      let t = ((x - a.x) * ex + (y - a.y) * ey) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + ex * t - x, py = a.y + ey * t - y;
      const d2 = px * px + py * py;
      if (d2 < best) {
        best = d2; bi = i; bt = t;
        side = ex * (y - a.y) - ey * (x - a.x);
      }
    }
    return { idx: bi, t: bt, dist: Math.sqrt(best), side: side < 0 ? -1 : 1 };
  }
}

function polarTrack(name, rfn, sx, sy, width) {
  const pts = [];
  const N = 900;
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const r = rfn(th);
    pts.push({ x: WORLD.w / 2 + Math.cos(th) * r * sx, y: WORLD.h / 2 + Math.sin(th) * r * sy });
  }
  return new Track(name, pts, width);
}

function buildTracks() {
  return [
    polarTrack('Serpent', th => 250 + 40 * Math.sin(2 * th) + 22 * Math.cos(5 * th), 1.65, 1.1, 74),
    polarTrack('Clover', th => 270 + 60 * Math.sin(3 * th), 1.55, 1.05, 76),
    polarTrack('Gearbox', th => 250 + 30 * Math.sin(6 * th), 1.6, 1.2, 70),
    polarTrack('Speedway Oval (easy)', () => 1, 470, 290, 84),
  ];
}

// Turn a freehand mouse loop into a smooth, drivable track.
function trackFromDrawing(name, pts) {
  const smooth = smoothClosed(resampleClosed(pts, 6), 12, 3);
  return new Track(name, smooth, 72);
}
