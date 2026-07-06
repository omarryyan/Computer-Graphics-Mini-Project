import { MESH_SHADER, MESH_WIREFRAME_SHADER, DEBUG_LINE_SHADER } from './shaders.js';
import { OrbitCamera } from '../camera/OrbitCamera.js';
import {
  loadObjFromUrl,
  createUVSphere,
  computeMeshNormals,
  computeBounds,
} from '../mesh/MeshLoader.js';
import { buildMeshGPUData } from '../mesh/MeshBuffer.js';
import { buildLightReflectionDebugLines } from '../mesh/DebugLines.js';
import {
  DEFAULT_POINT_LIGHT,
  DEFAULT_MATERIAL,
  SHADING_MODES,
} from '../lighting/defaults.js';
import { vec3 } from 'gl-matrix';

const UNIFORM_SIZE = 512;

const MESH_VERTEX_LAYOUT = {
  arrayStride: 36,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x3' },
  ],
};

const DEPTH_STENCIL = {
  format: 'depth24plus',
  depthWriteEnabled: true,
  depthCompare: 'less',
};

const MESH_MODELS = {
  sphere: () => createUVSphere(10, 16, 1.0),
  test_cube: () => loadObjFromUrl('/models/test_cube.obj'),
  cube: () => loadObjFromUrl('/models/test_cube.obj'),
};

function mat4FromNormalMatrix(m3) {
  return new Float32Array([
    m3[0], m3[1], m3[2], 0,
    m3[3], m3[4], m3[5], 0,
    m3[6], m3[7], m3[8], 0,
    0, 0, 0, 1,
  ]);
}

async function logShaderErrors(module, label) {
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error');
  for (const msg of errors) {
    console.error(`WGSL ${label} [${msg.lineNum}:${msg.linePos}]:`, msg.message);
  }
  if (errors.length > 0) {
    throw new Error(
      `WGSL shader compile error (${label}) at line ${errors[0].lineNum}: ${errors[0].message}`,
    );
  }
}

/** WebGPU renderer for HW5 Phong mesh lighting. */
export class WebGPURenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.device = null;
    this.context = null;
    this.format = null;
    this.depthTexture = null;
    this.depthView = null;

    this.meshPipeline = null;
    this.meshWirePipeline = null;
    this.debugLinePipeline = null;

    this.meshVertexBuffer = null;
    this.meshIndexBuffer = null;
    this.meshWireIndexBuffer = null;
    this.debugVertexBuffer = null;
    this.uniformBuffer = null;
    this.bindGroup = null;

    this.camera = new OrbitCamera();
    this.meshName = 'sphere';
    this.mesh = null;
    this.meshNormals = null;
    this.meshGPU = null;
    this.meshBounds = null;

    this.lightSettings = {
      position: [...DEFAULT_POINT_LIGHT.position],
      ambient: [...DEFAULT_POINT_LIGHT.ambient],
      diffuse: [...DEFAULT_POINT_LIGHT.diffuse],
      specular: [...DEFAULT_POINT_LIGHT.specular],
      materialAmbient: [...DEFAULT_MATERIAL.ambient],
      materialDiffuse: [...DEFAULT_MATERIAL.diffuse],
      materialSpecular: [...DEFAULT_MATERIAL.specular],
      shininess: DEFAULT_MATERIAL.shininess,
    };
    this.shadingMode = 'phong';
    this.showDebugVectors = false;
    this.wireframeEnabled = false;

    this.running = false;
    this.error = null;
    this._ready = false;

    this.stats = {
      fps: 0,
      vertexCount: 0,
      triangleCount: 0,
      renderMode: 'phong',
      meshName: 'sphere',
      webgpuStatus: 'initializing',
    };

    this._frameCount = 0;
    this._lastFpsTime = performance.now();
    this._animationId = null;
    this._onStatsUpdate = null;
  }

  onStatsUpdate(callback) {
    this._onStatsUpdate = callback;
  }

  async init() {
    if (!navigator.gpu) {
      this.error = 'WebGPU is not supported in this browser.';
      this.stats.webgpuStatus = 'unsupported';
      this._notifyStats();
      return false;
    }

    try {
      let adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        adapter = await navigator.gpu.requestAdapter({ forceFallbackAdapter: true });
      }
      if (!adapter) {
        throw new Error(
          'Failed to get WebGPU adapter. Enable hardware acceleration in Chrome/Edge settings.',
        );
      }

      this.device = await adapter.requestDevice();
      this.device.addEventListener('uncapturederror', (e) => {
        console.error('WebGPU error:', e.error);
        this.error = e.error?.message || String(e.error);
        this.stats.webgpuStatus = 'error';
        this._notifyStats();
      });

      this.context = this.canvas.getContext('webgpu');
      if (!this.context) throw new Error('Failed to get WebGPU canvas context.');

      this.format = navigator.gpu.getPreferredCanvasFormat();

      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'opaque',
      });

      this.uniformBuffer = this.device.createBuffer({
        size: UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      await this._createPipelines();
      this.camera.attach(this.canvas);
      await this._loadMesh(this.meshName);
      this._fitCameraToMesh();

      this._ready = true;
      this._syncDepthToCanvas();
      // Prime depth buffer size to match the swapchain before the render loop.
      this._ensureDepthForTexture(this.context.getCurrentTexture());

      this.stats.webgpuStatus = 'ready';
      this._notifyStats();

      this.running = true;
      this._startLoop();
      return true;
    } catch (err) {
      console.error('WebGPU init failed:', err);
      this.error = err.message || 'WebGPU initialization failed.';
      this.stats.webgpuStatus = 'error';
      this._notifyStats();
      return false;
    }
  }

  async _createPipelines() {
    const meshModule = this.device.createShaderModule({ code: MESH_SHADER });
    const wireModule = this.device.createShaderModule({ code: MESH_WIREFRAME_SHADER });
    const debugModule = this.device.createShaderModule({ code: DEBUG_LINE_SHADER });

    await Promise.all([
      logShaderErrors(meshModule, 'mesh'),
      logShaderErrors(wireModule, 'wire'),
      logShaderErrors(debugModule, 'debug'),
    ]);

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', minBindingSize: UNIFORM_SIZE },
      }],
    });
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    this.meshPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: meshModule,
        entryPoint: 'vs_mesh',
        buffers: [MESH_VERTEX_LAYOUT],
      },
      fragment: {
        module: meshModule,
        entryPoint: 'fs_mesh',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: DEPTH_STENCIL,
    });

    this.meshWirePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: wireModule,
        entryPoint: 'vs_mesh_wire',
        buffers: [{
          arrayStride: 36,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        }],
      },
      fragment: {
        module: wireModule,
        entryPoint: 'fs_mesh_wire',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'line-list' },
      depthStencil: { ...DEPTH_STENCIL, depthWriteEnabled: false },
    });

    this.debugLinePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: debugModule,
        entryPoint: 'vs_debug',
        buffers: [{
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
          ],
        }],
      },
      fragment: {
        module: debugModule,
        entryPoint: 'fs_debug',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'line-list' },
      depthStencil: { ...DEPTH_STENCIL, depthWriteEnabled: false },
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  async _loadMesh(name) {
    const loader = MESH_MODELS[name];
    if (!loader) throw new Error(`Unknown mesh: ${name}`);

    this.mesh = await loader();
    this.meshNormals = computeMeshNormals(this.mesh);
    this.meshGPU = buildMeshGPUData(this.mesh, this.meshNormals);
    this.meshBounds = computeBounds(this.mesh);
    this.meshName = name;

    if (this.meshVertexBuffer) this.meshVertexBuffer.destroy();
    if (this.meshIndexBuffer) this.meshIndexBuffer.destroy();
    if (this.meshWireIndexBuffer) this.meshWireIndexBuffer.destroy();

    const verts = this.meshGPU.interleavedVertices;
    this.meshVertexBuffer = this.device.createBuffer({
      size: verts.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.meshVertexBuffer.getMappedRange()).set(verts);
    this.meshVertexBuffer.unmap();

    this.meshIndexBuffer = this.device.createBuffer({
      size: this.meshGPU.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.meshIndexBuffer.getMappedRange()).set(this.meshGPU.indices);
    this.meshIndexBuffer.unmap();

    this.meshWireIndexBuffer = this.device.createBuffer({
      size: this.meshGPU.wireIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(this.meshWireIndexBuffer.getMappedRange()).set(this.meshGPU.wireIndices);
    this.meshWireIndexBuffer.unmap();

    this.stats.vertexCount = this.meshGPU.vertexCount;
    this.stats.triangleCount = this.meshGPU.triangleCount;
    this.stats.meshName = name;
    this._notifyStats();
  }

  _fitCameraToMesh() {
    if (!this.meshBounds) return;
    const { center, radius } = this.meshBounds;
    vec3.set(this.camera.target, center[0], center[1], center[2]);
    this.camera.distance = Math.max(radius * 3.5, 2.5);
    this.camera.minDistance = Math.max(radius * 0.5, 0.5);
    this.camera.maxDistance = Math.max(radius * 12, 20);
    this.camera.update();
    this._updateProjection();
  }

  _updateProjection() {
    const w = Math.max(this.canvas.clientWidth, 1);
    const h = Math.max(this.canvas.clientHeight, 1);
    this.camera.updateProjection(w / h, Math.PI / 4, 0.1, 100);
  }

  _syncDepthToCanvas() {
    if (!this.device || !this.context) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(this.canvas.clientWidth, 1);
    const cssH = Math.max(this.canvas.clientHeight, 1);
    const width = Math.max(1, Math.floor(cssW * dpr));
    const height = Math.max(1, Math.floor(cssH * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'opaque',
      });
      this._updateProjection();
    }
  }

  _ensureDepthForTexture(colorTexture) {
    const w = colorTexture.width;
    const h = colorTexture.height;
    if (this.depthTexture
      && this.depthTexture.width === w
      && this.depthTexture.height === h) {
      return;
    }
    if (this.depthTexture) this.depthTexture.destroy();
    this.depthTexture = this.device.createTexture({
      size: [w, h],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthView = this.depthTexture.createView();
  }

  _resize() {
    if (!this._ready) return;
    this._syncDepthToCanvas();
  }

  _updateUniforms() {
    this.camera.update();
    const { model, view, projection, normal, position } = this.camera.modelViewProjection;
    const ls = this.lightSettings;
    const data = new Float32Array(UNIFORM_SIZE / 4);

    data.set(model, 0);
    data.set(view, 16);
    data.set(projection, 32);
    data.set(mat4FromNormalMatrix(normal), 48);

    data[64] = position[0];
    data[65] = position[1];
    data[66] = position[2];

    data[68] = ls.position[0];
    data[69] = ls.position[1];
    data[70] = ls.position[2];

    data[72] = ls.ambient[0];
    data[73] = ls.ambient[1];
    data[74] = ls.ambient[2];

    data[76] = ls.diffuse[0];
    data[77] = ls.diffuse[1];
    data[78] = ls.diffuse[2];

    data[80] = ls.specular[0];
    data[81] = ls.specular[1];
    data[82] = ls.specular[2];

    data[84] = ls.materialAmbient[0];
    data[85] = ls.materialAmbient[1];
    data[86] = ls.materialAmbient[2];

    data[88] = ls.materialDiffuse[0];
    data[89] = ls.materialDiffuse[1];
    data[90] = ls.materialDiffuse[2];

    data[92] = ls.materialSpecular[0];
    data[93] = ls.materialSpecular[1];
    data[94] = ls.materialSpecular[2];

    data[96] = ls.shininess;
    data[97] = SHADING_MODES[this.shadingMode] ?? 1;

    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  _buildDebugBuffer() {
    if (!this.showDebugVectors || !this.mesh || !this.meshNormals || !this.meshBounds) return 0;

    const lineLen = this.meshBounds.radius * 0.45;
    const { model } = this.camera.modelViewProjection;
    const debug = buildLightReflectionDebugLines(
      this.mesh,
      this.meshNormals,
      model,
      { position: this.lightSettings.position },
      lineLen,
    );
    if (debug.vertexCount === 0) return 0;

    const interleaved = new Float32Array(debug.vertexCount * 6);
    for (let i = 0; i < debug.vertexCount; i++) {
      interleaved[i * 6] = debug.positions[i * 3];
      interleaved[i * 6 + 1] = debug.positions[i * 3 + 1];
      interleaved[i * 6 + 2] = debug.positions[i * 3 + 2];
      interleaved[i * 6 + 3] = debug.colors[i * 3];
      interleaved[i * 6 + 4] = debug.colors[i * 3 + 1];
      interleaved[i * 6 + 5] = debug.colors[i * 3 + 2];
    }

    if (this.debugVertexBuffer) this.debugVertexBuffer.destroy();
    this.debugVertexBuffer = this.device.createBuffer({
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.debugVertexBuffer.getMappedRange()).set(interleaved);
    this.debugVertexBuffer.unmap();
    return debug.vertexCount;
  }

  _render() {
    if (!this.device || !this.running || !this.meshGPU) return;

    this._syncDepthToCanvas();

    this._updateUniforms();
    const debugCount = this.showDebugVectors ? this._buildDebugBuffer() : 0;

    const colorTexture = this.context.getCurrentTexture();
    this._ensureDepthForTexture(colorTexture);
    if (!this.depthView) return;

    const encoder = this.device.createCommandEncoder();
    const textureView = colorTexture.createView();

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.15, g: 0.17, b: 0.22, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depthView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    pass.setPipeline(this.meshPipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.meshVertexBuffer);
    pass.setIndexBuffer(this.meshIndexBuffer, 'uint16');
    pass.drawIndexed(this.meshGPU.indices.length);

    if (this.wireframeEnabled) {
      pass.setPipeline(this.meshWirePipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.setVertexBuffer(0, this.meshVertexBuffer);
      pass.setIndexBuffer(this.meshWireIndexBuffer, 'uint16');
      pass.drawIndexed(this.meshGPU.wireIndices.length);
    }

    if (debugCount > 0 && this.debugVertexBuffer) {
      pass.setPipeline(this.debugLinePipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.setVertexBuffer(0, this.debugVertexBuffer);
      pass.draw(debugCount);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);

    this._frameCount++;
    const now = performance.now();
    if (now - this._lastFpsTime >= 1000) {
      this.stats.fps = this._frameCount;
      this._frameCount = 0;
      this._lastFpsTime = now;
      this._notifyStats();
    }
  }

  _startLoop() {
    const loop = () => {
      if (!this.running) return;
      try {
        this._render();
      } catch (err) {
        console.error('Render error:', err);
        this.error = err.message || String(err);
        this.stats.webgpuStatus = 'error';
        this.running = false;
        this._notifyStats();
      }
      this._animationId = requestAnimationFrame(loop);
    };
    this._animationId = requestAnimationFrame(loop);
  }

  _notifyStats() {
    this.stats.renderMode = this.shadingMode;
    this.stats.errorMessage = this.error || '';
    if (this._onStatsUpdate) this._onStatsUpdate({ ...this.stats });
  }

  async setMeshName(name) {
    if (!MESH_MODELS[name] || !this.device) return;
    await this._loadMesh(name);
    this._fitCameraToMesh();
  }

  setShadingMode(mode) {
    if (mode === 'flat' || mode === 'phong') {
      this.shadingMode = mode;
      this._notifyStats();
    }
  }

  setShowDebugVectors(enabled) {
    this.showDebugVectors = enabled;
  }

  setLightSettings(settings) {
    Object.assign(this.lightSettings, settings);
  }

  setMaterialSettings(settings) {
    if (settings.ambient) this.lightSettings.materialAmbient = [...settings.ambient];
    if (settings.diffuse) this.lightSettings.materialDiffuse = [...settings.diffuse];
    if (settings.specular) this.lightSettings.materialSpecular = [...settings.specular];
    if (settings.shininess !== undefined) this.lightSettings.shininess = settings.shininess;
  }

  setWireframeEnabled(enabled) {
    this.wireframeEnabled = enabled;
  }

  resetCamera() {
    this._fitCameraToMesh();
  }

  resize() {
    this._resize();
  }

  destroy() {
    this.running = false;
    if (this._animationId) cancelAnimationFrame(this._animationId);
    this.camera.detach();
    if (this.meshVertexBuffer) this.meshVertexBuffer.destroy();
    if (this.meshIndexBuffer) this.meshIndexBuffer.destroy();
    if (this.meshWireIndexBuffer) this.meshWireIndexBuffer.destroy();
    if (this.debugVertexBuffer) this.debugVertexBuffer.destroy();
    if (this.uniformBuffer) this.uniformBuffer.destroy();
    if (this.depthTexture) this.depthTexture.destroy();
    if (this.context) this.context.unconfigure();
    if (this.device) this.device.destroy();
    this.device = null;
    this.context = null;
    this.depthView = null;
  }
}
