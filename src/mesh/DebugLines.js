import { mat4, vec3 } from 'gl-matrix';

/**
 * HW5 Part 3: yellow light-direction and magenta reflection debug lines.
 * Ported from draw_light_reflection_debug() in nanorender/src/main.cpp
 */

function transformNormal(normalMatrix, objectNormal) {
  const out = vec3.create();
  vec3.transformMat3(out, objectNormal, normalMatrix);
  const len = vec3.length(out);
  if (len <= 1e-8) return [0, 0, 0];
  vec3.scale(out, out, 1 / len);
  return [out[0], out[1], out[2]];
}

function computeLightDirection(lightPos, worldPoint) {
  const dx = lightPos[0] - worldPoint[0];
  const dy = lightPos[1] - worldPoint[1];
  const dz = lightPos[2] - worldPoint[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len <= 1e-8) return [0, 0, 0];
  return [dx / len, dy / len, dz / len];
}

function computeReflectionVector(lightDir, worldNormal) {
  const dot = 2 * (
    lightDir[0] * worldNormal[0] +
    lightDir[1] * worldNormal[1] +
    lightDir[2] * worldNormal[2]
  );
  return [
    -lightDir[0] + dot * worldNormal[0],
    -lightDir[1] + dot * worldNormal[1],
    -lightDir[2] + dot * worldNormal[2],
  ];
}

/**
 * @param {import('./MeshLoader.js').Mesh} mesh
 * @param {import('./MeshLoader.js').MeshNormals} normals
 * @param {Float32Array} modelMatrix
 * @param {{ position: number[] }} light
 * @param {number} lineLen
 * @param {number} maxLines
 */
export function buildLightReflectionDebugLines(mesh, normals, modelMatrix, light, lineLen, maxLines = 6) {
  const positions = [];
  const colors = [];
  const triCount = mesh.faces.length / 3;
  const vertexCount = mesh.vertices.length / 3;

  const normalMatrix = mat3FromMat4(modelMatrix);
  let drawn = 0;

  for (let fi = 0; fi < triCount && drawn < maxLines; fi++) {
    if (fi % 2 !== 0) continue;

    const i0 = mesh.faces[fi * 3];
    const i1 = mesh.faces[fi * 3 + 1];
    const i2 = mesh.faces[fi * 3 + 2];
    if (i0 < 0 || i1 < 0 || i2 < 0) continue;
    if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;

    const p0 = [mesh.vertices[i0 * 3], mesh.vertices[i0 * 3 + 1], mesh.vertices[i0 * 3 + 2]];
    const p1 = [mesh.vertices[i1 * 3], mesh.vertices[i1 * 3 + 1], mesh.vertices[i1 * 3 + 2]];
    const p2 = [mesh.vertices[i2 * 3], mesh.vertices[i2 * 3 + 1], mesh.vertices[i2 * 3 + 2]];
    const center = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3];

    const worldCenter = vec3.create();
    vec3.transformMat4(worldCenter, center, modelMatrix);

    const faceNormal = [normals.face[fi * 3], normals.face[fi * 3 + 1], normals.face[fi * 3 + 2]];
    const worldNormal = transformNormal(normalMatrix, faceNormal);
    if (worldNormal[0] === 0 && worldNormal[1] === 0 && worldNormal[2] === 0) continue;

    const lightDir = computeLightDirection(light.position, worldCenter);
    if (lightDir[0] === 0 && lightDir[1] === 0 && lightDir[2] === 0) continue;

    const reflectDir = computeReflectionVector(lightDir, worldNormal);

    const yellow = [1.0, 0.86, 0.16];
    const magenta = [0.86, 0.24, 1.0];

    addLine(positions, colors, worldCenter, lightDir, lineLen, yellow);
    addLine(positions, colors, worldCenter, reflectDir, lineLen, magenta);
    drawn++;
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    vertexCount: positions.length / 3,
  };
}

function addLine(positions, colors, origin, dir, len, color) {
  const end = [
    origin[0] + dir[0] * len,
    origin[1] + dir[1] * len,
    origin[2] + dir[2] * len,
  ];
  positions.push(origin[0], origin[1], origin[2], end[0], end[1], end[2]);
  colors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
}

function mat3FromMat4(m) {
  const out = mat4.create();
  mat4.copy(out, m);
  return new Float32Array([
    out[0], out[1], out[2],
    out[4], out[5], out[6],
    out[8], out[9], out[10],
  ]);
}
