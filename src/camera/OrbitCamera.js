import { mat4, vec3 } from 'gl-matrix';

/**
 * Orbit camera for HW5 mesh viewer.
 */
export class OrbitCamera {
  constructor() {
    this.target = vec3.fromValues(0, 0, 0);
    this.distance = 4;
    this.azimuth = Math.PI * 0.3;
    this.elevation = 0.4;
    this.minDistance = 1;
    this.maxDistance = 30;
    this.minElevation = 0.05;
    this.maxElevation = Math.PI / 2 - 0.05;

    this.viewMatrix = mat4.create();
    this.projectionMatrix = mat4.create();
    this.modelMatrix = mat4.create();
    this.normalMatrix = mat3FromMat4(this.modelMatrix);
    this.position = vec3.create();

    this._isDragging = false;
    this._dragButton = -1;
    this._lastX = 0;
    this._lastY = 0;
  }

  get modelViewProjection() {
    return {
      model: this.modelMatrix,
      view: this.viewMatrix,
      projection: this.projectionMatrix,
      normal: this.normalMatrix,
      position: this.position,
    };
  }

  updateProjection(aspect, fov = Math.PI / 4, near = 0.1, far = 100) {
    const safeAspect = Math.max(aspect, 1e-6);
    mat4.perspectiveZO(this.projectionMatrix, fov, safeAspect, near, far);
    // WebGPU clip-space Y points down (unlike OpenGL).
    this.projectionMatrix[5] *= -1;
  }

  update() {
    const cosElev = Math.cos(this.elevation);
    const sinElev = Math.sin(this.elevation);
    const cosAz = Math.cos(this.azimuth);
    const sinAz = Math.sin(this.azimuth);

    const eyeX = this.target[0] + this.distance * cosElev * sinAz;
    const eyeY = this.target[1] + this.distance * sinElev;
    const eyeZ = this.target[2] + this.distance * cosElev * cosAz;

    vec3.set(this.position, eyeX, eyeY, eyeZ);
    mat4.identity(this.modelMatrix);
    mat4.lookAt(this.viewMatrix, this.position, this.target, [0, 1, 0]);
    this.normalMatrix = mat3FromMat4(this.modelMatrix);
  }

  attach(canvas) {
    this._canvas = canvas;
    canvas.addEventListener('contextmenu', this._onContextMenu);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('mouseleave', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  detach() {
    this._onMouseUp();
    if (!this._canvas) return;
    const canvas = this._canvas;
    canvas.removeEventListener('contextmenu', this._onContextMenu);
    canvas.removeEventListener('mousedown', this._onMouseDown);
    canvas.removeEventListener('mousemove', this._onMouseMove);
    canvas.removeEventListener('mouseup', this._onMouseUp);
    canvas.removeEventListener('mouseleave', this._onMouseUp);
    canvas.removeEventListener('wheel', this._onWheel);
    this._canvas = null;
  }

  _onContextMenu = (e) => e.preventDefault();

  _onMouseDown = (e) => {
    this._isDragging = true;
    this._dragButton = e.button;
    this._shiftPan = e.shiftKey && e.button === 0;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
  };

  _onMouseMove = (e) => {
    if (!this._isDragging) return;

    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;

    const rotate = this._dragButton === 0 && !this._shiftPan && !e.shiftKey;
    const pan = this._dragButton === 2 || (this._dragButton === 0 && (this._shiftPan || e.shiftKey));

    if (rotate) {
      this.azimuth -= dx * 0.005;
      this.elevation -= dy * 0.005;
      this.elevation = Math.max(this.minElevation, Math.min(this.maxElevation, this.elevation));
    } else if (pan) {
      const panSpeed = this.distance * 0.0015;
      const cosAz = Math.cos(this.azimuth);
      const sinAz = Math.sin(this.azimuth);
      const right = [-cosAz, 0, sinAz];
      this.target[0] -= right[0] * dx * panSpeed;
      this.target[1] -= dy * panSpeed;
      this.target[2] -= right[2] * dx * panSpeed;
    }

    this.update();
  };

  _onMouseUp = () => {
    this._isDragging = false;
    this._dragButton = -1;
  };

  _onWheel = (e) => {
    e.preventDefault();
    const factor = 1 + e.deltaY * 0.001;
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance * factor));
    this.update();
  };
}

function mat3FromMat4(m) {
  return new Float32Array([
    m[0], m[1], m[2],
    m[4], m[5], m[6],
    m[8], m[9], m[10],
  ]);
}
