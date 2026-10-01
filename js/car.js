'use strict';

const SENSOR_ANGLES = [-1.05, -0.5, 0, 0.5, 1.05];
const SENSOR_LEN = 260;
const NUM_INPUTS = SENSOR_ANGLES.length + 1; // 5 distance sensors + speed
const MAX_SPEED = 7;
const ACCEL = 0.22;
const BRAKE = 0.32;
const TURN = 0.065;
const DRAG = 0.988;
const GRIP = 0.22;
const CAR_R = 5;
const STALL_LIMIT = 150;
const LAPS = 3;
const STEPS_PER_SEC = 60;

// Fraction along ray (px,py)+(dx,dy) where it hits segment a-b, or 2 if it misses.
function raySeg(px, py, dx, dy, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const den = dx * ey - dy * ex;
  if (den === 0) return 2;
  const qx = ax - px, qy = ay - py;
  const t = (qx * ey - qy * ex) / den;
  const u = (qx * dy - qy * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : 2;
}

class Car {
  constructor(track, brain, color) {
    this.brain = brain;          // null => human controlled via this.control
    this.color = color;
    this.control = { steer: 0, throttle: 0 };
    this.respawn = false;        // race mode: crashing resets you instead of killing you
    this.sensors = new Float32Array(SENSOR_ANGLES.length);
    this.hits = SENSOR_ANGLES.map(() => ({ x: 0, y: 0 }));
    this.inputs = new Float32Array(NUM_INPUTS);
    this.reset(track);
  }

  reset(track) {
    this.track = track;
    const c = track.center[0];
    this.x = c.x; this.y = c.y;
    this.angle = track.dir[0];
    this.vx = 0; this.vy = 0;
    this.speed = 0; this.slip = 0;
    this.steer = 0; this.throttle = 0;
    this.idx = 0; this.progress = 0; this.maxProgress = 0;
    this.stall = 0; this.steps = 0; this.dist = 0;
    this.alive = true; this.finished = false; this.crashed = false;
    this.laps = 0; this.lapStart = 0; this.bestLap = Infinity; this.lastLap = 0;
    this.fitness = 0;
    this.trail = [];
  }

  sense() {
    const t = this.track, n = t.n;
    const win = Math.ceil(SENSOR_LEN / SPACING) + 4;
    for (let k = 0; k < SENSOR_ANGLES.length; k++) {
      const a = this.angle + SENSOR_ANGLES[k];
      const dx = Math.cos(a) * SENSOR_LEN, dy = Math.sin(a) * SENSOR_LEN;
      let best = 1;
      for (let j = -win; j <= win; j++) {
        const i = (((this.idx + j) % n) + n) % n, i2 = (i + 1) % n;
        const A = t.wallA[i], A2 = t.wallA[i2], B = t.wallB[i], B2 = t.wallB[i2];
        const h1 = raySeg(this.x, this.y, dx, dy, A.x, A.y, A2.x, A2.y);
        if (h1 < best) best = h1;
        const h2 = raySeg(this.x, this.y, dx, dy, B.x, B.y, B2.x, B2.y);
        if (h2 < best) best = h2;
      }
      this.sensors[k] = 1 - best;
      this.sx = this.x; this.sy = this.y;
      this.hits[k].x = this.x + dx * best;
      this.hits[k].y = this.y + dy * best;
    }
  }

  think() {
    const inp = this.inputs, s = this.sensors;
    for (let k = 0; k < s.length; k++) inp[k] = s[k];
    inp[s.length] = this.speed / MAX_SPEED;
    const out = this.brain.predict(inp);
    this.steer = out[0];
    this.throttle = out[1];
  }

  physics() {
    this.angle += this.steer * TURN * Math.min(1, this.speed / 2.5);
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    let fwd = this.vx * fx + this.vy * fy;
    let lat = -this.vx * fy + this.vy * fx;
    fwd += this.throttle > 0 ? this.throttle * ACCEL : this.throttle * BRAKE;
    fwd *= DRAG;
    fwd = fwd < 0 ? 0 : fwd > MAX_SPEED ? MAX_SPEED : fwd;
    lat *= 1 - GRIP;
    this.vx = fx * fwd - fy * lat;
    this.vy = fy * fwd + fx * lat;
    this.x += this.vx; this.y += this.vy;
    this.speed = fwd; this.slip = lat;
    this.dist += Math.hypot(this.vx, this.vy);
  }

  checkTrack() {
    const t = this.track, n = t.n;
    const loc = t.locate(this.x, this.y, this.idx, 3);
    let d = loc.idx - this.idx;
    if (d < -n / 2) d += n;
    if (d > n / 2) d -= n;
    this.progress += d;
    this.idx = loc.idx;

    if (loc.dist > t.half - CAR_R) {
      if (this.respawn) this.respawnAt(loc.idx);
      else { this.alive = false; this.crashed = true; }
      return;
    }

    const p = this.progress + loc.t;
    if (p > this.maxProgress + 1e-3) { this.maxProgress = p; this.stall = 0; }
    else this.stall++;

    if (!this.respawn && (this.stall > STALL_LIMIT || p < this.maxProgress - 8)) {
      this.alive = false;
      return;
    }

    const lapsNow = Math.floor(this.maxProgress / n);
    if (lapsNow > this.laps) {
      this.lastLap = this.steps - this.lapStart;
      if (this.lastLap < this.bestLap) this.bestLap = this.lastLap;
      this.lapStart = this.steps;
      this.laps = lapsNow;
      if (this.laps >= LAPS) { this.finished = true; this.alive = false; }
    }
  }

  respawnAt(i) {
    const c = this.track.center[i];
    this.x = c.x; this.y = c.y;
    this.angle = this.track.dir[i];
    this.vx = this.vy = 0; this.speed = 0;
    this.stall = 0;
  }

  update() {
    if (!this.alive) return;
    this.steps++;
    this.sense();
    if (this.brain) this.think();
    else { this.steer = this.control.steer; this.throttle = this.control.throttle; }
    this.physics();
    this.checkTrack();
    if (this.steps % 2 === 0) {
      this.trail.push(this.x, this.y, this.speed);
      if (this.trail.length > 270) this.trail.splice(0, 3);
    }
  }

  computeFitness() {
    const avgSpeed = this.dist / Math.max(1, this.steps);
    this.fitness = Math.max(0, this.maxProgress) * (1 + 0.5 * avgSpeed / MAX_SPEED) + (this.finished ? 50 : 0);
    return this.fitness;
  }
}
