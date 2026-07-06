import { fbm2D, islandMask } from './noise.js';

/**
 * Procedural terrain mesh generator.
 * Builds a grid mesh with positions, smooth normals, and procedural vertex colors.
 */

const DEFAULT_SETTINGS = {
  size: 80,
  height: 18,
  noiseScale: 2.8,
  octaves: 6,
  waterLevel: 0.12,
  resolution: 160,
};

function lerpColor(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Procedural terrain color based on height and slope.
 * No texture images — colors are computed per vertex.
 */
function computeTerrainColor(height, slope, waterLevel) {
  const deepWater = [0.02, 0.08, 0.28];
  const shallowWater = [0.1, 0.35, 0.55];
  const sand = [0.76, 0.7, 0.5];
  const grass = [0.22, 0.55, 0.2];
  const rock = [0.45, 0.42, 0.38];
  const snow = [0.92, 0.94, 0.97];

  if (height < waterLevel - 0.08) {
    return deepWater;
  }
  if (height < waterLevel) {
    const t = smoothstep(waterLevel - 0.08, waterLevel, height);
    return lerpColor(deepWater, shallowWater, t);
  }
  if (height < waterLevel + 0.06) {
    const t = smoothstep(waterLevel, waterLevel + 0.06, height);
    return lerpColor(shallowWater, sand, t);
  }

  const elevation = (height - waterLevel) / (1 - waterLevel);

  if (slope > 0.55) {
    const rockBlend = smoothstep(0.45, 0.7, slope);
    const base = lerpColor(grass, rock, rockBlend);
    if (elevation > 0.75) {
      const snowBlend = smoothstep(0.75, 0.92, elevation);
      return lerpColor(base, snow, snowBlend);
    }
    return base;
  }

  if (elevation > 0.82) {
    const t = smoothstep(0.82, 0.95, elevation);
    return lerpColor(rock, snow, t);
  }
  if (elevation > 0.55) {
    const t = smoothstep(0.55, 0.75, elevation);
    return lerpColor(grass, rock, t);
  }

  return grass;
}

/**
 * Sample terrain height at normalized grid coordinates [0, 1].
 */
function sampleHeight(nx, ny, settings) {
  const mask = islandMask(nx, ny);
  if (mask <= 0) return settings.waterLevel * 0.5;

  const noise = fbm2D(nx * settings.noiseScale, ny * settings.noiseScale, settings.octaves);
  const normalized = (noise + 1) * 0.5;
  const shaped = Math.pow(normalized, 1.15) * mask;
  return settings.waterLevel + shaped * (1 - settings.waterLevel);
}

export class TerrainGenerator {
  constructor(settings = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
    this.wireIndices = [];
    this.heights = [];
    this.generate();
  }

  generate() {
    const { size, height, resolution } = this.settings;
    const count = resolution * resolution;
    const half = size * 0.5;

    this.positions = new Float32Array(count * 3);
    this.normals = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.heights = new Float32Array(count);

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const i = z * resolution + x;
        const nx = x / (resolution - 1);
        const ny = z / (resolution - 1);
        const h = sampleHeight(nx, ny, this.settings);

        this.heights[i] = h;
        this.positions[i * 3] = nx * size - half;
        this.positions[i * 3 + 1] = h * height;
        this.positions[i * 3 + 2] = ny * size - half;
      }
    }

    this.computeNormals();
    this.computeColors();
    this.buildIndices();
  }

  /**
   * Smooth per-vertex normals via averaged face normals.
   *
   * For each grid vertex we gather the normals of up to four adjacent
   * quad faces (two triangles each). Each face normal is the normalized
   * cross product of two edge vectors. Averaging these normals and
   * re-normalizing produces smooth shading across the terrain surface.
   */
  computeNormals() {
    const { resolution } = this.settings;
    const normals = this.normals;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const i = z * resolution + x;
        let nx = 0;
        let ny = 0;
        let nz = 0;

        const accumulateFace = (i0, i1, i2) => {
          const ax = this.positions[i1 * 3] - this.positions[i0 * 3];
          const ay = this.positions[i1 * 3 + 1] - this.positions[i0 * 3 + 1];
          const az = this.positions[i1 * 3 + 2] - this.positions[i0 * 3 + 2];
          const bx = this.positions[i2 * 3] - this.positions[i0 * 3];
          const by = this.positions[i2 * 3 + 1] - this.positions[i0 * 3 + 1];
          const bz = this.positions[i2 * 3 + 2] - this.positions[i0 * 3 + 2];

          const cx = ay * bz - az * by;
          const cy = az * bx - ax * bz;
          const cz = ax * by - ay * bx;

          nx += cx;
          ny += cy;
          nz += cz;
        };

        if (x < resolution - 1 && z < resolution - 1) {
          const i00 = i;
          const i10 = i + 1;
          const i01 = i + resolution;
          const i11 = i + resolution + 1;
          accumulateFace(i00, i10, i11);
          accumulateFace(i00, i11, i01);
        }
        if (x > 0 && z < resolution - 1) {
          const i00 = i - 1;
          const i10 = i;
          const i01 = i - 1 + resolution;
          const i11 = i + resolution;
          accumulateFace(i00, i10, i11);
          accumulateFace(i00, i11, i01);
        }
        if (x < resolution - 1 && z > 0) {
          const i00 = i - resolution;
          const i10 = i - resolution + 1;
          const i01 = i;
          const i11 = i + 1;
          accumulateFace(i00, i10, i11);
          accumulateFace(i00, i11, i01);
        }
        if (x > 0 && z > 0) {
          const i00 = i - resolution - 1;
          const i10 = i - resolution;
          const i01 = i - 1;
          const i11 = i;
          accumulateFace(i00, i10, i11);
          accumulateFace(i00, i11, i01);
        }

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        normals[i * 3] = nx / len;
        normals[i * 3 + 1] = ny / len;
        normals[i * 3 + 2] = nz / len;
      }
    }
  }

  computeColors() {
    const { resolution, waterLevel } = this.settings;

    for (let z = 0; z < resolution; z++) {
      for (let x = 0; x < resolution; x++) {
        const i = z * resolution + x;
        const h = this.heights[i];
        const nY = this.normals[i * 3 + 1];
        const slope = 1 - Math.abs(nY);
        const color = computeTerrainColor(h, slope, waterLevel);
        this.colors[i * 3] = color[0];
        this.colors[i * 3 + 1] = color[1];
        this.colors[i * 3 + 2] = color[2];
      }
    }
  }

  buildIndices() {
    const { resolution } = this.settings;
    const quadCount = (resolution - 1) * (resolution - 1);
    this.indices = new Uint32Array(quadCount * 6);
    this.wireIndices = [];

    let idx = 0;
    for (let z = 0; z < resolution - 1; z++) {
      for (let x = 0; x < resolution - 1; x++) {
        const i00 = z * resolution + x;
        const i10 = i00 + 1;
        const i01 = i00 + resolution;
        const i11 = i01 + 1;

        this.indices[idx++] = i00;
        this.indices[idx++] = i11;
        this.indices[idx++] = i10;
        this.indices[idx++] = i00;
        this.indices[idx++] = i01;
        this.indices[idx++] = i11;

        this.wireIndices.push(i00, i10, i10, i11, i11, i01, i01, i00);
      }
    }

    this.wireIndices = new Uint32Array(this.wireIndices);
  }

  /**
   * Interleaved vertex buffer: position (3) + normal (3) + color (3) = 9 floats.
   */
  getInterleavedVertices() {
    const count = this.positions.length / 3;
    const data = new Float32Array(count * 9);
    for (let i = 0; i < count; i++) {
      const o = i * 9;
      data[o] = this.positions[i * 3];
      data[o + 1] = this.positions[i * 3 + 1];
      data[o + 2] = this.positions[i * 3 + 2];
      data[o + 3] = this.normals[i * 3];
      data[o + 4] = this.normals[i * 3 + 1];
      data[o + 5] = this.normals[i * 3 + 2];
      data[o + 6] = this.colors[i * 3];
      data[o + 7] = this.colors[i * 3 + 1];
      data[o + 8] = this.colors[i * 3 + 2];
    }
    return data;
  }

  getStats() {
    return {
      vertexCount: this.positions.length / 3,
      triangleCount: this.indices.length / 3,
    };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.generate();
  }
}

export { DEFAULT_SETTINGS as TERRAIN_DEFAULTS };
