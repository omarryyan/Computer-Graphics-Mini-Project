import { useEffect, useRef, useState, useCallback } from 'react';
import { WebGPURenderer } from './renderer/WebGPURenderer.js';
import { TERRAIN_DEFAULTS } from './terrain/TerrainGenerator.js';
import Controls from './ui/Controls.jsx';
import StatusBar from './ui/StatusBar.jsx';

const INITIAL_LIGHT = {
  direction: [-0.4, -0.8, -0.3],
  intensity: 1.2,
  shininess: 48,
};

export default function App() {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [webgpuError, setWebgpuError] = useState(null);
  const [stats, setStats] = useState({
    fps: 0,
    vertexCount: 0,
    triangleCount: 0,
    renderMode: 'phong',
    webgpuStatus: 'initializing',
  });

  const [terrainSettings, setTerrainSettings] = useState({ ...TERRAIN_DEFAULTS });
  const [lightSettings, setLightSettings] = useState({ ...INITIAL_LIGHT });
  const [renderMode, setRenderMode] = useState('phong');
  const [wireframeEnabled, setWireframeEnabled] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WebGPURenderer(canvas);
    rendererRef.current = renderer;

    renderer.onStatsUpdate((s) => setStats(s));

    renderer.init().then((ok) => {
      if (!ok) setWebgpuError(renderer.error);
    });

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  const updateTerrain = useCallback((partial) => {
    setTerrainSettings((prev) => {
      const next = { ...prev, ...partial };
      rendererRef.current?.setTerrainSettings(partial);
      return next;
    });
  }, []);

  const updateLight = useCallback((partial) => {
    setLightSettings((prev) => {
      const next = { ...prev, ...partial };
      rendererRef.current?.setLightSettings(partial);
      return next;
    });
  }, []);

  const handleRenderMode = useCallback((mode) => {
    setRenderMode(mode);
    rendererRef.current?.setRenderMode(mode);
  }, []);

  const handleWireframe = useCallback((enabled) => {
    setWireframeEnabled(enabled);
    rendererRef.current?.setWireframeEnabled(enabled);
  }, []);

  const handleRegenerate = useCallback(() => {
    rendererRef.current?.regenerateTerrain();
  }, []);

  const handleResetCamera = useCallback(() => {
    rendererRef.current?.resetCamera();
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="webgpu-canvas" />

      <header className="title-bar">
        <h1>TerraGPU</h1>
        <p>Interactive Procedural Terrain Explorer</p>
      </header>

      {webgpuError ? (
        <div className="error-overlay">
          <div className="error-card">
            <h2>WebGPU Not Available</h2>
            <p>{webgpuError}</p>
            <p className="error-hint">
              Please use Chrome 113+, Edge 113+, or another WebGPU-capable browser with hardware
              acceleration enabled.
            </p>
          </div>
        </div>
      ) : (
        <Controls
          terrainSettings={terrainSettings}
          lightSettings={lightSettings}
          renderMode={renderMode}
          wireframeEnabled={wireframeEnabled}
          onTerrainChange={updateTerrain}
          onLightChange={updateLight}
          onRenderModeChange={handleRenderMode}
          onWireframeChange={handleWireframe}
          onRegenerate={handleRegenerate}
          onResetCamera={handleResetCamera}
        />
      )}

      <StatusBar stats={stats} />
    </div>
  );
}
