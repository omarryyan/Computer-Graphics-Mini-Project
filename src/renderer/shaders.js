export const MESH_SHADER = /* wgsl */ `
struct SceneUniforms {
  modelMatrix: mat4x4<f32>,
  viewMatrix: mat4x4<f32>,
  projectionMatrix: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
  cameraPos: vec4<f32>,
  lightPos: vec4<f32>,
  lightAmbient: vec4<f32>,
  lightDiffuse: vec4<f32>,
  lightSpecular: vec4<f32>,
  materialAmbient: vec4<f32>,
  materialDiffuse: vec4<f32>,
  materialSpecular: vec4<f32>,
  shadingParams: vec4<f32>,
};

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertIn {
  @location(0) localPos: vec3<f32>,
  @location(1) vtxNormal: vec3<f32>,
  @location(2) triNormal: vec3<f32>,
};

struct VertOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) triNormal: vec3<f32>,
  @location(2) vtxNormal: vec3<f32>,
};

@vertex
fn vs_mesh(vin: VertIn) -> VertOut {
  var vout: VertOut;
  let wp = scene.modelMatrix * vec4<f32>(vin.localPos, 1.0);
  vout.clipPosition = scene.projectionMatrix * scene.viewMatrix * wp;
  vout.worldPos = wp.xyz;
  let sn = scene.normalMatrix * vec4<f32>(vin.vtxNormal, 0.0);
  let tn = scene.normalMatrix * vec4<f32>(vin.triNormal, 0.0);
  vout.vtxNormal = normalize(sn.xyz);
  vout.triNormal = normalize(tn.xyz);
  return vout;
}

@fragment
fn fs_mesh(fin: VertOut) -> @location(0) vec4<f32> {
  var n = fin.triNormal;
  if (scene.shadingParams.y > 0.5) {
    n = normalize(fin.vtxNormal);
  }

  let ambient = scene.lightAmbient.xyz * scene.materialAmbient.xyz;
  if (length(n) < 0.0001) {
    return vec4<f32>(ambient, 1.0);
  }
  n = normalize(n);

  let toLight = scene.lightPos.xyz - fin.worldPos;
  let lightDist = length(toLight);
  if (lightDist < 0.0001) {
    return vec4<f32>(ambient, 1.0);
  }
  let ldir = toLight / lightDist;

  let ndotl = max(dot(n, ldir), 0.0);
  let diffuse = scene.lightDiffuse.xyz * scene.materialDiffuse.xyz * ndotl;

  var specular = vec3<f32>(0.0);
  let toEye = scene.cameraPos.xyz - fin.worldPos;
  let eyeDist = length(toEye);
  if (eyeDist > 0.0001) {
    let vdir = toEye / eyeDist;
    let incident = -ldir;
    let refl = incident - 2.0 * dot(n, incident) * n;
    let rdotv = max(dot(refl, vdir), 0.0);
    let shininess = scene.shadingParams.x;
    let specAmt = pow(rdotv, shininess);
    specular = scene.lightSpecular.xyz * scene.materialSpecular.xyz * specAmt;
  }

  return vec4<f32>(ambient + diffuse + specular, 1.0);
}
`;

export const MESH_WIREFRAME_SHADER = /* wgsl */ `
struct SceneUniforms {
  modelMatrix: mat4x4<f32>,
  viewMatrix: mat4x4<f32>,
  projectionMatrix: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
  cameraPos: vec4<f32>,
  lightPos: vec4<f32>,
  lightAmbient: vec4<f32>,
  lightDiffuse: vec4<f32>,
  lightSpecular: vec4<f32>,
  materialAmbient: vec4<f32>,
  materialDiffuse: vec4<f32>,
  materialSpecular: vec4<f32>,
  shadingParams: vec4<f32>,
};

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertIn {
  @location(0) localPos: vec3<f32>,
};

struct VertOut {
  @builtin(position) clipPosition: vec4<f32>,
};

@vertex
fn vs_mesh_wire(vin: VertIn) -> VertOut {
  var vout: VertOut;
  let wp = scene.modelMatrix * vec4<f32>(vin.localPos, 1.0);
  vout.clipPosition = scene.projectionMatrix * scene.viewMatrix * wp;
  return vout;
}

@fragment
fn fs_mesh_wire() -> @location(0) vec4<f32> {
  return vec4<f32>(0.9, 0.9, 0.95, 0.8);
}
`;

export const DEBUG_LINE_SHADER = /* wgsl */ `
struct SceneUniforms {
  modelMatrix: mat4x4<f32>,
  viewMatrix: mat4x4<f32>,
  projectionMatrix: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
  cameraPos: vec4<f32>,
  lightPos: vec4<f32>,
  lightAmbient: vec4<f32>,
  lightDiffuse: vec4<f32>,
  lightSpecular: vec4<f32>,
  materialAmbient: vec4<f32>,
  materialDiffuse: vec4<f32>,
  materialSpecular: vec4<f32>,
  shadingParams: vec4<f32>,
};

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertIn {
  @location(0) localPos: vec3<f32>,
  @location(1) lineColor: vec3<f32>,
};

struct VertOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) lineColor: vec3<f32>,
};

@vertex
fn vs_debug(vin: VertIn) -> VertOut {
  var vout: VertOut;
  vout.clipPosition = scene.projectionMatrix * scene.viewMatrix * vec4<f32>(vin.localPos, 1.0);
  vout.lineColor = vin.lineColor;
  return vout;
}

@fragment
fn fs_debug(fin: VertOut) -> @location(0) vec4<f32> {
  return vec4<f32>(fin.lineColor, 1.0);
}
`;
