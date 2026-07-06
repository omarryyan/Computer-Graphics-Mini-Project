# TerraGPU: Interactive Procedural Terrain Explorer

A browser-based Computer Graphics mini project that renders procedural island terrain in real time using **raw WebGPU** and custom **WGSL shaders**. Built with React and Vite for the UI layer only — all rendering, terrain generation, and camera logic live outside React state.

![TerraGPU Screenshot](docs/screenshot.png)

> **Screenshot placeholder:** Run the app and capture a screenshot of the terrain viewer, then save it as `docs/screenshot.png`.

## Features

- Procedural terrain from layered fractal noise (FBM) on a grid mesh
- Orbit camera with rotate, zoom, and pan controls
- Blinn-Phong and toon shading modes
- Normal visualization mode
- Optional wireframe overlay
- Procedural terrain colors (water, sand, grass, rock, snow)
- Depth-tested hidden-surface removal
- Distance fog and animated water shimmer
- Live FPS, vertex/triangle counts, and render mode display

## Installation

```bash
npm install
```

## How to Run

```bash
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

## Browser Requirements

WebGPU is required. Supported browsers include:

- **Chrome** 113+ (Windows, macOS, ChromeOS)
- **Edge** 113+
- **Firefox** 141+ (with `dom.webgpu.enabled` flag on some versions)

Ensure hardware acceleration is enabled. If WebGPU is unavailable, the app displays a friendly error message.

## Controls

| Input | Action |
|-------|--------|
| Left mouse drag | Rotate camera around terrain |
| Mouse wheel | Zoom in / out |
| Right mouse drag | Pan camera |
| Shift + left mouse drag | Pan camera |
| Reset Camera button | Restore default view |

Use the control panel to adjust terrain, lighting, and rendering options.

## Terrain Generation

The terrain is a square grid mesh (default **160 × 160** vertices, configurable). Each vertex height is computed using **fractal Brownian motion (FBM)** — multiple octaves of 2D gradient noise at increasing frequency and decreasing amplitude.

An **island mask** radially attenuates height toward the edges, producing a natural landmass surrounded by water. Parameters:

- **Terrain size** — world-space extent of the grid
- **Terrain height** — vertical scale multiplier
- **Noise scale** — frequency of the base noise
- **Octaves** — number of FBM layers (more = finer detail)
- **Water level** — normalized height threshold for water

Triangles are built as indexed triangle lists (two triangles per grid cell).

## Normal Calculation

Smooth per-vertex normals are computed on the CPU after height generation. For each grid vertex, the normals of all adjacent triangle faces are accumulated. Each face normal is the **cross product** of two edge vectors, normalized. The accumulated vector is then normalized to produce a smooth shading normal that interpolates correctly across triangle surfaces.

This is the standard approach for terrain meshes and is essential for smooth Phong lighting.

## Hidden-Surface Removal

The renderer uses **depth buffering** (Z-buffer) for hidden-surface removal:

1. A `depth24plus` texture is allocated matching the canvas size
2. Every frame, the depth buffer is cleared to `1.0` (far plane)
3. The render pipeline enables `depthWriteEnabled: true` and `depthCompare: 'less'`
4. Fragments closer to the camera overwrite farther fragments

Triangles behind other geometry are correctly occluded without sorting geometry on the CPU.

## Orbit Camera

The camera orbits a target point using spherical coordinates:

- **Azimuth** — horizontal rotation angle
- **Elevation** — vertical angle above the horizon
- **Distance** — radius from the target

Each frame the camera builds:

- **Model matrix** — identity (terrain at origin)
- **View matrix** — `lookAt(eye, target, up)` from spherical position
- **Projection matrix** — perspective projection with configurable aspect ratio
- **Normal matrix** — upper-left 3×3 of the model matrix (for transforming normals to world space)

## Phong vs Toon Shading

**Phong (Blinn-Phong)** uses continuous lighting:

- Ambient + diffuse (Lambert) + specular (Blinn half-vector)
- Smooth gradients across the surface

**Toon shading** quantizes the diffuse term into **4 discrete bands** using `floor(diffuse * bands) / bands`, producing a cel-shaded non-photorealistic look. Terrain procedural colors are preserved and multiplied by the banded lighting.

## WebGPU Pipeline Overview

1. **Adapter & Device** — GPU adapter requested with high-performance preference
2. **Canvas Context** — configured with the browser's preferred surface format
3. **Shader Modules** — WGSL compiled for terrain and wireframe pipelines
4. **Vertex Buffer** — interleaved position, normal, color per vertex
5. **Index Buffer** — `uint32` triangle indices for indexed drawing
6. **Uniform Buffer** — model/view/projection/normal matrices, camera, light, render mode
7. **Depth Texture** — render attachment for Z-buffering
8. **Render Pass** — clear color + depth, draw indexed triangles, optional wireframe pass
9. **Render Loop** — `requestAnimationFrame` drives continuous rendering

## Computer Graphics Topics Demonstrated

| Topic | Implementation |
|-------|----------------|
| 3D Transformations | Model, view, projection matrices via gl-matrix |
| Camera Movement | Orbit camera with mouse interaction |
| Procedural Modeling | FBM noise terrain on a parametric grid |
| Normals | Per-vertex normals from face cross products |
| Hidden-Surface Removal | WebGPU depth texture with less-than compare |
| Lighting & Shading | Blinn-Phong directional light in WGSL |
| Procedural Colors | Height/slope-based vertex colors |
| GPU Rendering | Raw WebGPU pipelines, buffers, draw calls |
| GUI Interaction | React control panel calling renderer methods |
| Non-Photorealistic Rendering | Toon shading with quantized diffuse bands |
| Debug Visualization | Normal RGB encoding mode |
| Wireframe Rendering | Separate line-list pipeline overlay |

## Project Structure

```
src/
  main.jsx                  Entry point
  App.jsx                   React layout, renderer lifecycle
  renderer/
    WebGPURenderer.js       WebGPU init, render loop, GPU buffers
    shaders.js              WGSL shader source code
  terrain/
    TerrainGenerator.js     Grid mesh, normals, colors
    noise.js                FBM and island mask
  camera/
    OrbitCamera.js          Spherical orbit camera
  ui/
    Controls.jsx            Control panel
    StatusBar.jsx           FPS and stats display
  styles/
    main.css                UI styling
```

## License

Educational project for Computer Graphics coursework.
