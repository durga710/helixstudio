/**
 * A tiny 2-input multi-layer perceptron (2 → H tanh → 1 sigmoid) with batch
 * gradient descent, in plain JS. Self-contained and instant on the small
 * datasets the Lab uses. Shared by the Neural-Net studio and the "Teach-the-
 * Robot" game so the game trains a REAL network, not a fake one.
 */

export interface Net {
  W1: number[][]; // hidden-layer input weights (H × 2)
  b1: number[]; // hidden-layer biases (H)
  W2: number[]; // output-layer weights (H)
  b2: number; // output bias
}

export interface Sample {
  x: [number, number];
  y: number; // 1 = class A (e.g. core/treasure), 0 = class B (ring/rock)
}

export function initNet(h: number): Net {
  const r = () => (Math.random() * 2 - 1) * 0.9;
  return {
    W1: Array.from({ length: h }, () => [r(), r()]),
    b1: Array.from({ length: h }, r),
    W2: Array.from({ length: h }, r),
    b2: r(),
  };
}

const sig = (z: number) => 1 / (1 + Math.exp(-z));

export function forward(net: Net, x: [number, number]): { a1: number[]; out: number } {
  const a1 = net.W1.map((w, j) => Math.tanh(w[0] * x[0] + w[1] * x[1] + net.b1[j]));
  const out = sig(net.W2.reduce((s, w, j) => s + w * a1[j], 0) + net.b2);
  return { a1, out };
}

/** Run `epochs` of full-batch gradient descent and return a NEW net. */
export function trainEpochs(net: Net, data: Sample[], epochs: number, lr = 0.6): Net {
  const W1 = net.W1.map((r) => [...r]);
  const b1 = [...net.b1];
  const W2 = [...net.W2];
  let b2 = net.b2;
  const Hn = W1.length;
  const n = data.length || 1;
  for (let e = 0; e < epochs; e++) {
    const gW1 = W1.map(() => [0, 0]);
    const gb1 = Array(Hn).fill(0);
    const gW2 = Array(Hn).fill(0);
    let gb2 = 0;
    for (const d of data) {
      const a1 = W1.map((w, j) => Math.tanh(w[0] * d.x[0] + w[1] * d.x[1] + b1[j]));
      const out = sig(W2.reduce((s, w, j) => s + w * a1[j], 0) + b2);
      const dz2 = out - d.y;
      for (let j = 0; j < Hn; j++) {
        gW2[j] += dz2 * a1[j];
        const dz1 = dz2 * W2[j] * (1 - a1[j] * a1[j]);
        gW1[j][0] += dz1 * d.x[0];
        gW1[j][1] += dz1 * d.x[1];
        gb1[j] += dz1;
      }
      gb2 += dz2;
    }
    for (let j = 0; j < Hn; j++) {
      W2[j] -= (lr * gW2[j]) / n;
      W1[j][0] -= (lr * gW1[j][0]) / n;
      W1[j][1] -= (lr * gW1[j][1]) / n;
      b1[j] -= (lr * gb1[j]) / n;
    }
    b2 -= (lr * gb2) / n;
  }
  return { W1, b1, W2, b2 };
}

/** Share of `data` the net classifies correctly (threshold 0.5). */
export function accuracyOf(net: Net, data: Sample[]): number {
  if (data.length === 0) return 0;
  let ok = 0;
  for (const d of data) if ((forward(net, d.x).out > 0.5 ? 1 : 0) === d.y) ok++;
  return ok / data.length;
}
