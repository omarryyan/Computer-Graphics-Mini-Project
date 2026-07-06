/**
 * WGSL shader sources for TerraGPU terrain rendering.
 * Includes Phong, toon, normal visualization, and wireframe pipelines.
 */

export const TERRAIN_SHADER = /* wgsl */ `
struct Uniforms {
  modelMatrix: mat4x4<f32>,
  viewMatrix: mat4x4<f32>,
  projectionMatrix: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
  cameraPos: vec4<f32>,
  lightDir: vec4<f32>,
  params: vec4<f32>,      // x=intensity, y=shininess, z=renderMode, w=waterLevel
  fogParams: vec4<f32>,   // x=fogDensity, y=time, z=terrainHeight, w=unused
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec3<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = uniforms.modelMatrix * vec4<f32>(input.position, 1.0);
  output.position = uniforms.projectionMatrix * uniforms.viewMatrix * worldPos;
  output.worldPos = worldPos.xyz;

  // Transform normal to world space using the normal matrix (3x3 in mat4x4).
  let n = uniforms.normalMatrix * vec4<f32>(input.normal, 0.0);
  output.normal = normalize(n.xyz);
  output.color = input.color;
  return output;
}

// Blinn-Phong lighting with optional toon quantization.
fn computeLighting(normal: vec3<f32>, viewDir: vec3<f32>, baseColor: vec3<f32>) -> vec3<f32> {
  let lightDir = normalize(-uniforms.lightDir.xyz);
  let intensity = uniforms.params.x;
  let shininess = uniforms.params.y;
  let renderMode = uniforms.params.z;

  // Ambient term
  let ambient = 0.15 * baseColor;

  // Diffuse (Lambert)
  let nDotL = max(dot(normal, lightDir), 0.0);
  var diffuseFactor = nDotL;

  // Toon shading: quantize diffuse into discrete bands
  if (renderMode > 0.5 && renderMode < 1.5) {
    let bands = 4.0;
    diffuseFactor = floor(diffuseFactor * bands) / bands;
  }

  let diffuse = diffuseFactor * baseColor * intensity;

  // Specular (Blinn-Phong half-vector)
  var specular = vec3<f32>(0.0);
  if (renderMode < 1.5) {
    let halfDir = normalize(lightDir + viewDir);
    let spec = pow(max(dot(normal, halfDir), 0.0), shininess);
    specular = vec3<f32>(spec) * intensity * 0.35;
  }

  return ambient + diffuse + specular;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let renderMode = uniforms.params.z;
  var normal = normalize(input.normal);
  var baseColor = input.color;

  // Subtle animated water shimmer near water level
  let waterLevel = uniforms.params.w;
  let heightNorm = input.worldPos.y / uniforms.fogParams.z;
  if (heightNorm < waterLevel + 0.02) {
    let wave = sin(input.worldPos.x * 0.3 + uniforms.fogParams.y * 1.5)
             * cos(input.worldPos.z * 0.25 + uniforms.fogParams.y * 1.2);
    baseColor = baseColor + vec3<f32>(0.02, 0.04, 0.06) * wave;
  }

  // Normal visualization mode: encode normal as RGB
  if (renderMode > 1.5) {
    let nColor = normal * 0.5 + 0.5;
    return vec4<f32>(nColor, 1.0);
  }

  let viewDir = normalize(uniforms.cameraPos.xyz - input.worldPos);
  var litColor = computeLighting(normal, viewDir, baseColor);

  // Distance fog for depth perception
  let fogDensity = uniforms.fogParams.x;
  let dist = length(input.worldPos - uniforms.cameraPos.xyz);
  let fogFactor = 1.0 - exp(-dist * fogDensity * 0.008);
  let fogColor = vec3<f32>(0.45, 0.62, 0.82);
  litColor = mix(litColor, fogColor, clamp(fogFactor, 0.0, 0.85));

  return vec4<f32>(litColor, 1.0);
}
`;

export const WIREFRAME_SHADER = /* wgsl */ `
struct Uniforms {
  modelMatrix: mat4x4<f32>,
  viewMatrix: mat4x4<f32>,
  projectionMatrix: mat4x4<f32>,
  normalMatrix: mat4x4<f32>,
  cameraPos: vec4<f32>,
  lightDir: vec4<f32>,
  params: vec4<f32>,
  fogParams: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
};

@vertex
fn vs_wire(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPos = uniforms.modelMatrix * vec4<f32>(input.position, 1.0);
  output.position = uniforms.projectionMatrix * uniforms.viewMatrix * worldPos;
  return output;
}

@fragment
fn fs_wire() -> @location(0) vec4<f32> {
  return vec4<f32>(0.1, 0.12, 0.15, 0.55);
}
`;

export const TRIANGLE_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn vs_triangle(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 0.5),
    vec2<f32>(-0.5, -0.5),
    vec2<f32>(0.5, -0.5)
  );
  var colors = array<vec3<f32>, 3>(
    vec3<f32>(1.0, 0.3, 0.2),
    vec3<f32>(0.2, 0.9, 0.4),
    vec3<f32>(0.3, 0.5, 1.0)
  );

  var output: VertexOutput;
  output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
  output.color = colors[vertexIndex];
  return output;
}

@fragment
fn fs_triangle(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
`;

export const RENDER_MODES = {
  phong: 0,
  toon: 1,
  normal: 2,
};
