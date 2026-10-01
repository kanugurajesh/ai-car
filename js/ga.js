'use strict';

// Genetic algorithm over a population of neural-net brains.
class Population {
  constructor(size, layers) {
    this.layers = layers;
    this.targetSize = size;
    this.mutationRate = 0.1;
    this.reset();
  }

  reset() {
    this.generation = 1;
    this.history = [];
    this.champion = null;
    this.brains = [];
    this.tags = [];
    for (let i = 0; i < this.targetSize; i++) {
      this.brains.push(new NeuralNet(this.layers));
      this.tags.push('child');
    }
  }

  // Replace the population with a known brain plus mutated variants of it.
  seed(brain) {
    this.brains = [brain.copy()];
    this.tags = ['elite'];
    while (this.brains.length < this.targetSize) {
      this.brains.push(brain.copy().mutate(this.mutationRate, 0.3));
      this.tags.push('child');
    }
    this.champion = brain.copy();
  }

  evolve(cars, trackN) {
    for (const c of cars) c.computeFitness();
    const ranked = cars.slice().sort((a, b) => b.fitness - a.fitness);
    const avg = ranked.reduce((s, c) => s + Math.max(0, c.maxProgress), 0) / ranked.length / trackN;
    const stats = {
      gen: this.generation,
      best: Math.max(0, ranked[0].maxProgress) / trackN,
      avg,
      finished: ranked.filter(c => c.finished).length,
    };
    this.history.push(stats);
    this.champion = ranked[0].brain.copy();

    const pick = () => {
      let best = null;
      for (let k = 0; k < 3; k++) {
        const c = ranked[Math.floor(Math.random() * ranked.length)];
        if (!best || c.fitness > best.fitness) best = c;
      }
      return best;
    };

    const next = [], tags = [];
    for (let i = 0; i < Math.min(2, ranked.length, this.targetSize); i++) {
      next.push(ranked[i].brain.copy());
      tags.push('elite');
    }
    if (this.targetSize >= 20) {
      next.push(new NeuralNet(this.layers));
      tags.push('fresh');
    }
    while (next.length < this.targetSize) {
      const child = NeuralNet.crossover(pick().brain, pick().brain);
      child.mutate(this.mutationRate, 0.35);
      next.push(child);
      tags.push('child');
    }
    this.brains = next;
    this.tags = tags;
    this.generation++;
    return stats;
  }
}
