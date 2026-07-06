const RESOLUTION_OPTIONS = [64, 96, 128, 160, 180, 224];

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <label className="control-row">
      <span className="control-label">
        {label}
        <span className="control-value">{typeof value === 'number' ? value.toFixed(2) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export default function Controls({
  terrainSettings,
  lightSettings,
  renderMode,
  wireframeEnabled,
  onTerrainChange,
  onLightChange,
  onRenderModeChange,
  onWireframeChange,
  onRegenerate,
  onResetCamera,
}) {
  return (
    <aside className="control-panel">
      <h2 className="panel-title">Controls</h2>

      <section className="panel-section">
        <h3>Terrain</h3>
        <Slider
          label="Height"
          value={terrainSettings.height}
          min={5}
          max={40}
          step={1}
          onChange={(v) => onTerrainChange({ height: v })}
        />
        <Slider
          label="Noise Scale"
          value={terrainSettings.noiseScale}
          min={0.5}
          max={6}
          step={0.1}
          onChange={(v) => onTerrainChange({ noiseScale: v })}
        />
        <Slider
          label="Octaves"
          value={terrainSettings.octaves}
          min={1}
          max={8}
          step={1}
          onChange={(v) => onTerrainChange({ octaves: v })}
        />
        <Slider
          label="Water Level"
          value={terrainSettings.waterLevel}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(v) => onTerrainChange({ waterLevel: v })}
        />
        <label className="control-row">
          <span className="control-label">Resolution</span>
          <select
            value={terrainSettings.resolution}
            onChange={(e) => onTerrainChange({ resolution: parseInt(e.target.value, 10) })}
          >
            {RESOLUTION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r} × {r}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" onClick={onRegenerate}>
          Regenerate Terrain
        </button>
      </section>

      <section className="panel-section">
        <h3>Lighting</h3>
        <Slider
          label="Light X"
          value={lightSettings.direction[0]}
          min={-1}
          max={1}
          step={0.05}
          onChange={(v) =>
            onLightChange({ direction: [v, lightSettings.direction[1], lightSettings.direction[2]] })
          }
        />
        <Slider
          label="Light Y"
          value={lightSettings.direction[1]}
          min={-1}
          max={0}
          step={0.05}
          onChange={(v) =>
            onLightChange({ direction: [lightSettings.direction[0], v, lightSettings.direction[2]] })
          }
        />
        <Slider
          label="Light Z"
          value={lightSettings.direction[2]}
          min={-1}
          max={1}
          step={0.05}
          onChange={(v) =>
            onLightChange({ direction: [lightSettings.direction[0], lightSettings.direction[1], v] })
          }
        />
        <Slider
          label="Intensity"
          value={lightSettings.intensity}
          min={0.2}
          max={2.5}
          step={0.1}
          onChange={(v) => onLightChange({ intensity: v })}
        />
        <Slider
          label="Shininess"
          value={lightSettings.shininess}
          min={2}
          max={128}
          step={1}
          onChange={(v) => onLightChange({ shininess: v })}
        />
      </section>

      <section className="panel-section">
        <h3>Rendering</h3>
        <label className="control-row">
          <span className="control-label">Render Mode</span>
          <select value={renderMode} onChange={(e) => onRenderModeChange(e.target.value)}>
            <option value="phong">Phong Terrain</option>
            <option value="toon">Toon Terrain</option>
            <option value="normal">Normal Visualization</option>
          </select>
        </label>
        <label className="control-row checkbox-row">
          <input
            type="checkbox"
            checked={wireframeEnabled}
            onChange={(e) => onWireframeChange(e.target.checked)}
          />
          <span>Wireframe Overlay</span>
        </label>
        <button type="button" className="btn btn-secondary" onClick={onResetCamera}>
          Reset Camera
        </button>
      </section>

      <section className="panel-section hints">
        <p>Left drag: rotate</p>
        <p>Scroll: zoom</p>
        <p>Right / Shift+Left: pan</p>
      </section>
    </aside>
  );
}
