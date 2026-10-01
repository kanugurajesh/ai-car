'use strict';

// Standard normal sample (Box-Muller).
function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Small fully-connected feed-forward network with tanh activations.
// weights[l] is a row-major (nout x nin) matrix for layer l -> l+1.
class NeuralNet {
  constructor(layers, init = true) {
    this.layers = layers.slice();
    this.weights = [];
    this.biases = [];
    for (let l = 0; l < layers.length - 1; l++) {
      const nin = layers[l], nout = layers[l + 1];
      const w = new Float32Array(nin * nout), b = new Float32Array(nout);
      if (init) {
        const s = 1.5 / Math.sqrt(nin);
        for (let i = 0; i < w.length; i++) w[i] = gauss() * s;
        for (let i = 0; i < nout; i++) b[i] = gauss() * 0.2;
      }
      this.weights.push(w);
      this.biases.push(b);
    }
    this.acts = layers.map(n => new Float32Array(n));
  }

  predict(input) {
    const a0 = this.acts[0];
    for (let i = 0; i < a0.length; i++) a0[i] = input[i];
    for (let l = 0; l < this.weights.length; l++) {
      const nin = this.layers[l], nout = this.layers[l + 1];
      const w = this.weights[l], b = this.biases[l], a = this.acts[l], o = this.acts[l + 1];
      for (let j = 0; j < nout; j++) {
        let s = b[j];
        const off = j * nin;
        for (let i = 0; i < nin; i++) s += w[off + i] * a[i];
        o[j] = Math.tanh(s);
      }
    }
    return this.acts[this.acts.length - 1];
  }

  copy() {
    const n = new NeuralNet(this.layers, false);
    for (let l = 0; l < this.weights.length; l++) {
      n.weights[l].set(this.weights[l]);
      n.biases[l].set(this.biases[l]);
    }
    return n;
  }

  mutate(rate, strength) {
    const all = this.weights.concat(this.biases);
    for (const arr of all) {
      for (let i = 0; i < arr.length; i++) {
        if (Math.random() < rate) arr[i] += gauss() * strength;
      }
    }
    return this;
  }

  // Neuron-level crossover: each neuron (its incoming weights + bias) comes from one parent.
  static crossover(a, b) {
    const c = a.copy();
    for (let l = 0; l < c.weights.length; l++) {
      const nin = c.layers[l], nout = c.layers[l + 1];
      for (let j = 0; j < nout; j++) {
        if (Math.random() < 0.5) {
          const off = j * nin;
          for (let i = 0; i < nin; i++) c.weights[l][off + i] = b.weights[l][off + i];
          c.biases[l][j] = b.biases[l][j];
        }
      }
    }
    return c;
  }

  toJSON() {
    return {
      layers: this.layers,
      weights: this.weights.map(w => Array.from(w)),
      biases: this.biases.map(b => Array.from(b)),
    };
  }

  static fromJSON(o) {
    const n = new NeuralNet(o.layers, false);
    o.weights.forEach((w, l) => n.weights[l].set(w));
    o.biases.forEach((b, l) => n.biases[l].set(b));
    return n;
  }
}
