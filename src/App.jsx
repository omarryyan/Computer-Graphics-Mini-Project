import { useEffect, useRef, useState, useCallback } from 'react';
import { WebGPURenderer } from './renderer/WebGPURenderer.js';
import { DEFAULT_POINT_LIGHT, DEFAULT_MATERIAL } from './lighting/defaults.js';
import Controls from './ui/Controls.jsx';
import StatusBar from './ui/StatusBar.jsx';

const INITIAL_LIGHT = {
  position: [...DEFAULT_POINT_LIGHT.position],
  ambient: [...DEFAULT_POINT_LIGHT.ambient],
  diffuse: [...DEFAULT_POINT_LIGHT.diffuse],
  specular: [...DEFAULT_POINT_LIGHT.specular],
  materialAmbient: [...DEFAULT_MATERIAL.ambient],
  materialDiffuse: [...DEFAULT_MATERIAL.diffuse],
  materialSpecular: [...DEFAULT_MATERIAL.specular],
  shininess: DEFAULT_MATERIAL.shininess,
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
    meshName: 'sphere',
    webgpuStatus: 'initializing',
  });

  const [meshName, setMeshName] = useState('sphere');
  const [shadingMode, setShadingMode] = useState('phong');
  const [showDebugVectors, setShowDebugVectors] = useState(false);
  const [lightSettings, setLightSettings] = useState({ ...INITIAL_LIGHT });
  const [wireframeEnabled, setWireframeEnabled] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const renderer = new WebGPURenderer(canvas);
    rendererRef.current = renderer;

    renderer.onStatsUpdate((s) => {
      if (disposed) return;
      setStats(s);
      if (s.webgpuStatus === 'error' && s.errorMessage) {
        setWebgpuError(s.errorMessage);
      }
    });

    const onResize = () => renderer.resize();

    renderer.init().then((ok) => {
      if (disposed) return;
      if (!ok) setWebgpuError(renderer.error);

      const resizeObserver = new ResizeObserver(() => renderer.resize());
      resizeObserver.observe(canvas);
      window.addEventListener('resize', onResize);
      renderer._resizeObserver = resizeObserver;
      renderer._onResize = onResize;
    });

    return () => {
      disposed = true;
      renderer._resizeObserver?.disconnect();
      if (renderer._onResize) {
        window.removeEventListener('resize', renderer._onResize);
      }
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  const updateLight = useCallback((partial) => {
    setLightSettings((prev) => {
      const next = { ...prev, ...partial };
      rendererRef.current?.setLightSettings(partial);
      return next;
    });
  }, []);

  const updateMaterial = useCallback((partial) => {
    setLightSettings((prev) => {
      const next = { ...prev };
      if (partial.ambient) next.materialAmbient = [...partial.ambient];
      if (partial.diffuse) next.materialDiffuse = [...partial.diffuse];
      if (partial.specular) next.materialSpecular = [...partial.specular];
      if (partial.shininess !== undefined) next.shininess = partial.shininess;
      rendererRef.current?.setMaterialSettings(partial);
      return next;
    });
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="webgpu-canvas" />

      <header className="title-bar">
        <h1>HW5 WebGPU</h1>
        <p>Phong lighting — ported from nanorender</p>
      </header>

      {webgpuError ? (
        <div className="error-overlay">
          <div className="error-card">
            <h2>WebGPU Error</h2>
            <p>{webgpuError}</p>
            <p className="error-hint">
              Use Chrome 113+ or Edge 113+ with hardware acceleration enabled.
            </p>
          </div>
        </div>
      ) : (
        <Controls
          meshName={meshName}
          shadingMode={shadingMode}
          showDebugVectors={showDebugVectors}
          lightSettings={lightSettings}
          wireframeEnabled={wireframeEnabled}
          onMeshNameChange={(name) => {
            setMeshName(name);
            rendererRef.current?.setMeshName(name).catch(() => {
              // Error surfaced via renderer stats / overlay.
            });
          }}
          onShadingModeChange={(mode) => {
            setShadingMode(mode);
            rendererRef.current?.setShadingMode(mode);
          }}
          onDebugVectorsChange={(enabled) => {
            setShowDebugVectors(enabled);
            rendererRef.current?.setShowDebugVectors(enabled);
          }}
          onLightChange={updateLight}
          onMaterialChange={updateMaterial}
          onWireframeChange={(enabled) => {
            setWireframeEnabled(enabled);
            rendererRef.current?.setWireframeEnabled(enabled);
          }}
          onResetCamera={() => rendererRef.current?.resetCamera()}
        />
      )}

      <StatusBar stats={stats} />
    </div>
  );
}
