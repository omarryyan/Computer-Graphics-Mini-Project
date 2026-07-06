import { TERRAIN_SHADER, WIREFRAME_SHADER, TRIANGLE_SHADER, RENDER_MODES } from './shaders.js';
import { TerrainGenerator, TERRAIN_DEFAULTS } from '../terrain/TerrainGenerator.js';
import { OrbitCamera } from '../camera/OrbitCamera.js';

const UNIFORM_SIZE = 256;

/**
 * WebGPU renderer for procedural terrain.
 * Manages GPU resources, render loop, and exposes imperative API for React UI.
 */
export class WebGPURenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.device = null;
    this.context = null;
    this.format = null;
    this.depthTexture = null;
    this.depthView = null;

    this.terrainPipeline = null;
    this.wireframePipeline = null;
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.wireIndexBuffer = null;
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.wireBindGroup = null;

    this.terrain = null;
    this.camera = new OrbitCamera();

    this.terrainSettings = { ...TERRAIN_DEFAULTS };
    this.lightSettings = {
      direction: [-0.4, -0.8, -0.3],
      intensity: 1.2,
      shininess: 48,
    };
    this.renderMode = 'phong';
    this.wireframeEnabled = false;
    this.fogDensity = 1.0;

    this.running = false;
    this.supported = false;
    this.error = null;
    this.demoTriangle = true;

    this.stats = {
      fps: 0,
      vertexCount: 0,
      triangleCount: 0,
      renderMode: 'phong',
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
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        this.error = 'Failed to get WebGPU adapter.';
        this.stats.webgpuStatus = 'unsupported';
        this._notifyStats();
        return false;
      }

      this.device = await adapter.requestDevice();
      this.context = this.canvas.getContext('webgpu');
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

      this._createPipelines();
      this._resize();
      this.camera.attach(this.canvas);
      this.camera.update();
      this.camera.updateProjection(this.canvas.width / this.canvas.height);

      this.supported = true;
      this.stats.webgpuStatus = 'ready';

      // Brief triangle demo to verify WebGPU, then switch to terrain.
      this.demoTriangle = true;
      this._createTrianglePipeline();
      this.running = true;
      this._startLoop();

      setTimeout(() => {
        this.demoTriangle = false;
        this._buildTerrain();
      }, 1200);

      return true;
    } catch (err) {
      this.error = err.message || 'WebGPU initialization failed.';
      this.stats.webgpuStatus = 'error';
      this._notifyStats();
      return false;
    }
  }

  _createTrianglePipeline() {
    const module = this.device.createShaderModule({ code: TRIANGLE_SHADER });
    this.trianglePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs_triangle' },
      fragment: {
        module,
        entryPoint: 'fs_triangle',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });
  }

  _createPipelines() {
    const terrainModule = this.device.createShaderModule({ code: TERRAIN_SHADER });
    const wireModule = this.device.createShaderModule({ code: WIREFRAME_SHADER });

    const vertexLayout = {
      arrayStride: 36,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' },
      ],
    };

    const depthStencil = {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    };

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });

    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    this.terrainPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: terrainModule,
        entryPoint: 'vs_main',
        buffers: [vertexLayout],
      },
      fragment: {
        module: terrainModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil,
    });

    this.wireframePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: wireModule,
        entryPoint: 'vs_wire',
        buffers: [{
          arrayStride: 36,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        }],
      },
      fragment: {
        module: wireModule,
        entryPoint: 'fs_wire',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'line-list' },
      depthStencil: { ...depthStencil, depthWriteEnabled: false },
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
    this.wireBindGroup = this.bindGroup;
  }

  _buildTerrain() {
    this.terrain = new TerrainGenerator(this.terrainSettings);
    const vertices = this.terrain.getInterleavedVertices();
    const indices = this.terrain.indices;
    const wireIndices = this.terrain.wireIndices;

    if (this.vertexBuffer) this.vertexBuffer.destroy();
    if (this.indexBuffer) this.indexBuffer.destroy();
    if (this.wireIndexBuffer) this.wireIndexBuffer.destroy();

    this.vertexBuffer = this.device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
    this.vertexBuffer.unmap();

    this.indexBuffer = this.device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.indexBuffer.getMappedRange()).set(indices);
    this.indexBuffer.unmap();

    this.wireIndexBuffer = this.device.createBuffer({
      size: wireIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.wireIndexBuffer.getMappedRange()).set(wireIndices);
    this.wireIndexBuffer.unmap();

    const stats = this.terrain.getStats();
    this.stats.vertexCount = stats.vertexCount;
    this.stats.triangleCount = stats.triangleCount;
    this._notifyStats();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.floor(this.canvas.clientWidth * dpr);
    const height = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width === width && this.canvas.height === height) return;
    if (width < 1 || height < 1) return;

    this.canvas.width = width;
    this.canvas.height = height;

    if (this.depthTexture) this.depthTexture.destroy();
    this.depthTexture = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthView = this.depthTexture.createView();

    if (this.context && this.device) {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'opaque',
      });
      this.camera.updateProjection(width / height);
    }
  }

  _updateUniforms(time) {
    this.camera.update();
    const { model, view, projection, normal, position } = this.camera.modelViewProjection;

    const data = new Float32Array(UNIFORM_SIZE / 4);
    data.set(model, 0);
    data.set(view, 16);
    data.set(projection, 32);

    // Normal matrix stored as mat4x4 (3x3 in upper-left)
    const nm = normal;
    data[48] = nm[0]; data[49] = nm[1]; data[50] = nm[2];
    data[52] = nm[3]; data[53] = nm[4]; data[54] = nm[5];
    data[56] = nm[6]; data[57] = nm[7]; data[58] = nm[8];

    data[60] = position[0];
    data[61] = position[1];
    data[62] = position[2];

    const ld = this.lightSettings.direction;
    const len = Math.sqrt(ld[0] ** 2 + ld[1] ** 2 + ld[2] ** 2) || 1;
    data[64] = ld[0] / len;
    data[65] = ld[1] / len;
    data[66] = ld[2] / len;

    data[68] = this.lightSettings.intensity;
    data[69] = this.lightSettings.shininess;
    data[70] = RENDER_MODES[this.renderMode] ?? 0;
    data[71] = this.terrainSettings.waterLevel;

    data[72] = this.fogDensity;
    data[73] = time;
    data[74] = this.terrainSettings.height;

    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  _render(time) {
    if (!this.device || !this.running) return;

    this._resize();
    if (!this.depthView) return;
    this._updateUniforms(time);

    const encoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.45, g: 0.62, b: 0.82, a: 1 },
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

    if (this.demoTriangle) {
      pass.setPipeline(this.trianglePipeline);
      pass.draw(3);
    } else if (this.terrain && this.vertexBuffer) {
      pass.setPipeline(this.terrainPipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.setIndexBuffer(this.indexBuffer, 'uint32');
      pass.drawIndexed(this.terrain.indices.length);

      if (this.wireframeEnabled) {
        pass.setPipeline(this.wireframePipeline);
        pass.setBindGroup(0, this.wireBindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.setIndexBuffer(this.wireIndexBuffer, 'uint32');
        pass.drawIndexed(this.terrain.wireIndices.length);
      }
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
    const loop = (time) => {
      if (!this.running) return;
      this._render(time * 0.001);
      this._animationId = requestAnimationFrame(loop);
    };
    this._animationId = requestAnimationFrame(loop);
  }

  _notifyStats() {
    this.stats.renderMode = this.renderMode;
    if (this._onStatsUpdate) this._onStatsUpdate({ ...this.stats });
  }

  setTerrainSettings(settings) {
    const needsRegen = ['size', 'height', 'noiseScale', 'octaves', 'waterLevel', 'resolution']
      .some((key) => settings[key] !== undefined && settings[key] !== this.terrainSettings[key]);

    Object.assign(this.terrainSettings, settings);

    if (needsRegen && this.device && !this.demoTriangle) {
      this._buildTerrain();
    }
  }

  setLightSettings(settings) {
    Object.assign(this.lightSettings, settings);
  }

  setRenderMode(mode) {
    if (RENDER_MODES[mode] !== undefined) {
      this.renderMode = mode;
      this.stats.renderMode = mode;
      this._notifyStats();
    }
  }

  setWireframeEnabled(enabled) {
    this.wireframeEnabled = enabled;
  }

  regenerateTerrain() {
    if (this.device && !this.demoTriangle) {
      this._buildTerrain();
    }
  }

  resetCamera() {
    this.camera.reset();
  }

  resize() {
    this._resize();
  }

  destroy() {
    this.running = false;
    if (this._animationId) cancelAnimationFrame(this._animationId);
    this.camera.detach();
    if (this.vertexBuffer) this.vertexBuffer.destroy();
    if (this.indexBuffer) this.indexBuffer.destroy();
    if (this.wireIndexBuffer) this.wireIndexBuffer.destroy();
    if (this.uniformBuffer) this.uniformBuffer.destroy();
    if (this.depthTexture) this.depthTexture.destroy();
    if (this.device) this.device.destroy();
  }
}
