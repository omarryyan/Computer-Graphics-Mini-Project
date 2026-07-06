const MODE_LABELS = {
  phong: 'Phong Terrain',
  toon: 'Toon Terrain',
  normal: 'Normal Visualization',
};

export default function StatusBar({ stats }) {
  return (
    <footer className="status-bar">
      <span>FPS: {stats.fps}</span>
      <span className="divider">|</span>
      <span>Vertices: {stats.vertexCount.toLocaleString()}</span>
      <span className="divider">|</span>
      <span>Triangles: {stats.triangleCount.toLocaleString()}</span>
      <span className="divider">|</span>
      <span>Mode: {MODE_LABELS[stats.renderMode] || stats.renderMode}</span>
      <span className="divider">|</span>
      <span>WebGPU: {stats.webgpuStatus}</span>
    </footer>
  );
}
