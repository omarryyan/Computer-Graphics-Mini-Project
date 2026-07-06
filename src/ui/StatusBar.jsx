const MODE_LABELS = {
  flat: 'Flat Shading',
  phong: 'Phong Shading',
};

export default function StatusBar({ stats }) {
  return (
    <footer className="status-bar">
      <span>FPS: {stats.fps}</span>
      <span className="divider">|</span>
      <span>Mesh: {stats.meshName || 'sphere'}</span>
      <span className="divider">|</span>
      <span>Vertices: {stats.vertexCount.toLocaleString()}</span>
      <span className="divider">|</span>
      <span>Triangles: {stats.triangleCount.toLocaleString()}</span>
      <span className="divider">|</span>
      <span>Mode: {MODE_LABELS[stats.renderMode] || stats.renderMode}</span>
      <span className="divider">|</span>
      <span>WebGPU: {stats.webgpuStatus}</span>
      {stats.errorMessage ? (
        <>
          <span className="divider">|</span>
          <span className="status-error">{stats.errorMessage}</span>
        </>
      ) : null}
    </footer>
  );
}
