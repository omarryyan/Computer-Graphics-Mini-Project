/**
 * Procedural noise utilities for terrain height generation.
 * Uses gradient noise with fractal Brownian motion (FBM) layering.
 */

const PERM = new Uint8Array(512);
const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + t * (b - a);
}

function dot2(g, x, y) {
  return g[0] * x + g[1] * y;
}

// Build permutation table from a fixed seed for reproducible terrain.
(function initPerm() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 2166136261;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16777619) ^ (i * 374761393);
    const j = Math.abs(seed) % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

/**
 * 2D gradient noise in range approximately [-1, 1].
 */
export function noise2D(x, y) {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[xi] + yi] & 7;
  const ab = PERM[PERM[xi] + yi + 1] & 7;
  const ba = PERM[PERM[xi + 1] + yi] & 7;
  const bb = PERM[PERM[xi + 1] + yi + 1] & 7;

  const x1 = lerp(dot2(GRAD2[aa], xf, yf), dot2(GRAD2[ba], xf - 1, yf), u);
  const x2 = lerp(dot2(GRAD2[ab], xf, yf - 1), dot2(GRAD2[bb], xf - 1, yf - 1), u);
  return lerp(x1, x2, v);
}

/**
 * Fractal Brownian motion: layered noise at increasing frequencies
 * with decreasing amplitude for natural-looking terrain.
 */
export function fbm2D(x, y, octaves) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue;
}

/**
 * Radial falloff to shape terrain into an island.
 * Returns 0 at edges, 1 at center.
 */
export function islandMask(nx, ny) {
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy) * 2;
  const mask = 1 - Math.pow(Math.min(dist, 1), 2);
  return Math.max(0, mask);
}
