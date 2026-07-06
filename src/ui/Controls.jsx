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

function RgbSliders({ label, rgb, onChange }) {
  const channels = ['R', 'G', 'B'];
  return (
    <div className="rgb-group">
      <span className="control-label">{label}</span>
      {channels.map((ch, i) => (
        <Slider
          key={ch}
          label={ch}
          value={rgb[i]}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => {
            const next = [...rgb];
            next[i] = v;
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

export default function Controls({
  meshName,
  shadingMode,
  showDebugVectors,
  lightSettings,
  wireframeEnabled,
  onMeshNameChange,
  onShadingModeChange,
  onDebugVectorsChange,
  onLightChange,
  onMaterialChange,
  onWireframeChange,
  onResetCamera,
}) {
  const material = {
    ambient: lightSettings.materialAmbient,
    diffuse: lightSettings.materialDiffuse,
    specular: lightSettings.materialSpecular,
    shininess: lightSettings.shininess,
  };

  return (
    <aside className="control-panel">
      <h2 className="panel-title">Controls</h2>

      <section className="panel-section">
        <h3>Mesh</h3>
        <label className="control-row">
          <span className="control-label">Model</span>
          <select value={meshName} onChange={(e) => onMeshNameChange(e.target.value)}>
            <option value="sphere">Sphere</option>
            <option value="test_cube">Cube</option>
          </select>
        </label>
        <label className="control-row">
          <span className="control-label">Shading</span>
          <select value={shadingMode} onChange={(e) => onShadingModeChange(e.target.value)}>
            <option value="flat">Flat (per-face)</option>
            <option value="phong">Phong (per-pixel)</option>
          </select>
        </label>
      </section>

      <section className="panel-section">
        <h3>Point Light</h3>
        <Slider
          label="Position X"
          value={lightSettings.position[0]}
          min={-5}
          max={5}
          step={0.1}
          onChange={(v) =>
            onLightChange({ position: [v, lightSettings.position[1], lightSettings.position[2]] })
          }
        />
        <Slider
          label="Position Y"
          value={lightSettings.position[1]}
          min={-2}
          max={8}
          step={0.1}
          onChange={(v) =>
            onLightChange({ position: [lightSettings.position[0], v, lightSettings.position[2]] })
          }
        />
        <Slider
          label="Position Z"
          value={lightSettings.position[2]}
          min={-5}
          max={5}
          step={0.1}
          onChange={(v) =>
            onLightChange({ position: [lightSettings.position[0], lightSettings.position[1], v] })
          }
        />
        <RgbSliders
          label="Light Ambient"
          rgb={lightSettings.ambient}
          onChange={(rgb) => onLightChange({ ambient: rgb })}
        />
        <RgbSliders
          label="Light Diffuse"
          rgb={lightSettings.diffuse}
          onChange={(rgb) => onLightChange({ diffuse: rgb })}
        />
        <RgbSliders
          label="Light Specular"
          rgb={lightSettings.specular}
          onChange={(rgb) => onLightChange({ specular: rgb })}
        />
      </section>

      <section className="panel-section">
        <h3>Material</h3>
        <RgbSliders
          label="Ambient"
          rgb={material.ambient}
          onChange={(rgb) => onMaterialChange({ ambient: rgb })}
        />
        <RgbSliders
          label="Diffuse"
          rgb={material.diffuse}
          onChange={(rgb) => onMaterialChange({ diffuse: rgb })}
        />
        <RgbSliders
          label="Specular"
          rgb={material.specular}
          onChange={(rgb) => onMaterialChange({ specular: rgb })}
        />
        <Slider
          label="Shininess"
          value={material.shininess}
          min={2}
          max={128}
          step={1}
          onChange={(v) => onMaterialChange({ shininess: v })}
        />
      </section>

      <section className="panel-section">
        <h3>Rendering</h3>
        <label className="control-row checkbox-row">
          <input
            type="checkbox"
            checked={showDebugVectors}
            onChange={(e) => onDebugVectorsChange(e.target.checked)}
          />
          <span>Show light / reflection debug</span>
        </label>
        <label className="control-row checkbox-row">
          <input
            type="checkbox"
            checked={wireframeEnabled}
            onChange={(e) => onWireframeChange(e.target.checked)}
          />
          <span>Wireframe overlay</span>
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
