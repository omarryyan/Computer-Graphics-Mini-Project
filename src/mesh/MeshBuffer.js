/**
 * Build GPU-ready interleaved vertex data and index buffers from a mesh.
 */

const FLOATS_PER_VERTEX = 9; // position(3) + vertexNormal(3) + faceNormal(3)

/**
 * @param {import('./MeshLoader.js').Mesh} mesh
 * @param {import('./MeshLoader.js').MeshNormals} normals
 */
export function buildMeshGPUData(mesh, normals) {
  const triCount = mesh.faces.length / 3;
  const interleaved = new Float32Array(triCount * 3 * FLOATS_PER_VERTEX);
  const wireIndices = [];

  for (let fi = 0; fi < triCount; fi++) {
    const i0 = mesh.faces[fi * 3];
    const i1 = mesh.faces[fi * 3 + 1];
    const i2 = mesh.faces[fi * 3 + 2];

    const fnx = normals.face[fi * 3];
    const fny = normals.face[fi * 3 + 1];
    const fnz = normals.face[fi * 3 + 2];

    const corners = [i0, i1, i2];
    for (let c = 0; c < 3; c++) {
      const vi = corners[c];
      const dst = (fi * 3 + c) * FLOATS_PER_VERTEX;
      interleaved[dst] = mesh.vertices[vi * 3];
      interleaved[dst + 1] = mesh.vertices[vi * 3 + 1];
      interleaved[dst + 2] = mesh.vertices[vi * 3 + 2];
      interleaved[dst + 3] = normals.vertex[vi * 3];
      interleaved[dst + 4] = normals.vertex[vi * 3 + 1];
      interleaved[dst + 5] = normals.vertex[vi * 3 + 2];
      interleaved[dst + 6] = fnx;
      interleaved[dst + 7] = fny;
      interleaved[dst + 8] = fnz;
    }

    const base = fi * 3;
    wireIndices.push(base, base + 1, base + 1, base + 2, base + 2, base);
  }

  const vertexCount = triCount * 3;
  if (vertexCount > 65535) {
    throw new Error(`Mesh has ${vertexCount} vertices; uint16 indices only support up to 65535.`);
  }

  return {
    interleavedVertices: interleaved,
    indices: (() => {
      const arr = new Uint16Array(triCount * 3);
      for (let i = 0; i < arr.length; i++) arr[i] = i;
      return arr;
    })(),
    wireIndices: new Uint16Array(wireIndices),
    vertexCount: triCount * 3,
    triangleCount: triCount,
    floatsPerVertex: FLOATS_PER_VERTEX,
    arrayStride: FLOATS_PER_VERTEX * 4,
  };
}
