/**
 * Wavefront OBJ loader and normal computation.
 * Ported from cg-at-uoh-26-omarryyan/nanorender/src/mesh.cpp
 */

function parseVertexIndex(token, vertexCount) {
  const slash = token.indexOf('/');
  const indexPart = slash === -1 ? token : token.slice(0, slash);
  if (!indexPart) return -1;
  let idx = parseInt(indexPart, 10);
  if (Number.isNaN(idx)) return -1;
  if (idx < 0) return vertexCount + idx;
  return idx - 1;
}

/**
 * @typedef {{ vertices: Float32Array, faces: Uint32Array }} Mesh
 * faces is flat [i0,i1,i2, i0,i1,i2, ...]
 */

/**
 * Parse OBJ text into indexed triangle mesh.
 * @param {string} text
 * @returns {Mesh}
 */
export function parseObj(text) {
  const verts = [];
  const faces = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    const tag = parts[0];

    if (tag === 'v') {
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);
      if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z)) {
        verts.push(x, y, z);
      }
    } else if (tag === 'f') {
      const indices = [];
      const vertexCount = verts.length / 3;
      for (let i = 1; i < parts.length; i++) {
        const idx = parseVertexIndex(parts[i], vertexCount);
        if (idx >= 0 && idx < vertexCount) indices.push(idx);
      }
      if (indices.length < 3) continue;
      for (let i = 1; i + 1 < indices.length; i++) {
        faces.push(indices[0], indices[i], indices[i + 1]);
      }
    }
  }

  return {
    vertices: new Float32Array(verts),
    faces: new Uint32Array(faces),
  };
}

export async function loadObjFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load mesh: ${url}`);
  const text = await response.text();
  const mesh = parseObj(text);
  if (mesh.vertices.length === 0) throw new Error(`Empty mesh: ${url}`);
  return mesh;
}

/**
 * @typedef {{ face: Float32Array, vertex: Float32Array }} MeshNormals
 * face: per-triangle normal (3 floats each)
 * vertex: per-vertex smoothed normal (3 floats each)
 */
export function computeMeshNormals(mesh) {
  const vertexCount = mesh.vertices.length / 3;
  const triCount = mesh.faces.length / 3;
  const face = new Float32Array(triCount * 3);
  const vertex = new Float32Array(vertexCount * 3);

  for (let fi = 0; fi < triCount; fi++) {
    const i0 = mesh.faces[fi * 3];
    const i1 = mesh.faces[fi * 3 + 1];
    const i2 = mesh.faces[fi * 3 + 2];

    const ax = mesh.vertices[i0 * 3];
    const ay = mesh.vertices[i0 * 3 + 1];
    const az = mesh.vertices[i0 * 3 + 2];
    const bx = mesh.vertices[i1 * 3];
    const by = mesh.vertices[i1 * 3 + 1];
    const bz = mesh.vertices[i1 * 3 + 2];
    const cx = mesh.vertices[i2 * 3];
    const cy = mesh.vertices[i2 * 3 + 1];
    const cz = mesh.vertices[i2 * 3 + 2];

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len <= 1e-8) continue;
    nx /= len;
    ny /= len;
    nz /= len;

    face[fi * 3] = nx;
    face[fi * 3 + 1] = ny;
    face[fi * 3 + 2] = nz;

    vertex[i0 * 3] += nx;
    vertex[i0 * 3 + 1] += ny;
    vertex[i0 * 3 + 2] += nz;
    vertex[i1 * 3] += nx;
    vertex[i1 * 3 + 1] += ny;
    vertex[i1 * 3 + 2] += nz;
    vertex[i2 * 3] += nx;
    vertex[i2 * 3 + 1] += ny;
    vertex[i2 * 3 + 2] += nz;
  }

  for (let i = 0; i < vertexCount; i++) {
    let vx = vertex[i * 3];
    let vy = vertex[i * 3 + 1];
    let vz = vertex[i * 3 + 2];
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (len > 1e-8) {
      vertex[i * 3] = vx / len;
      vertex[i * 3 + 1] = vy / len;
      vertex[i * 3 + 2] = vz / len;
    }
  }

  return { face, vertex };
}

/** Low-poly UV sphere for HW5 Phong vs flat comparison. */
export function createUVSphere(stacks = 10, slices = 16, radius = 1.0) {
  const verts = [];
  const faces = [];

  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks;
    const phi = v * Math.PI;
    for (let j = 0; j <= slices; j++) {
      const u = j / slices;
      const theta = u * Math.PI * 2;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      verts.push(x, y, z);
    }
  }

  const row = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      // CCW winding when viewed from outside (Y-up, right-handed).
      faces.push(a, b, c);
      faces.push(b, d, c);
    }
  }

  return {
    vertices: new Float32Array(verts),
    faces: new Uint32Array(faces),
  };
}

export function computeBounds(mesh) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < mesh.vertices.length; i += 3) {
    const x = mesh.vertices[i];
    const y = mesh.vertices[i + 1];
    const z = mesh.vertices[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5],
    radius: Math.sqrt(
      (maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2,
    ) * 0.5,
  };
}
