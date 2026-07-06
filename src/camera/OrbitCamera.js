import { mat4, vec3 } from 'gl-matrix';

/**
 * Orbit camera that rotates around a target point using spherical coordinates.
 * Supports rotate (left drag), zoom (wheel), and pan (right drag / shift+left).
 */
export class OrbitCamera {
  constructor() {
    this.target = vec3.fromValues(0, 4, 0);
    this.distance = 90;
    this.azimuth = Math.PI * 0.25;
    this.elevation = 0.45;
    this.minDistance = 15;
    this.maxDistance = 200;
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

  updateProjection(aspect, fov = Math.PI / 4, near = 0.5, far = 500) {
    mat4.perspective(this.projectionMatrix, fov, aspect, near, far);
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

  reset() {
    this.target = vec3.fromValues(0, 4, 0);
    this.distance = 90;
    this.azimuth = Math.PI * 0.25;
    this.elevation = 0.45;
    this.update();
  }

  attach(canvas) {
    this._canvas = canvas;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('mouseleave', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  detach() {
    if (!this._canvas) return;
    const canvas = this._canvas;
    canvas.removeEventListener('mousedown', this._onMouseDown);
    canvas.removeEventListener('mousemove', this._onMouseMove);
    canvas.removeEventListener('mouseup', this._onMouseUp);
    canvas.removeEventListener('mouseleave', this._onMouseUp);
    canvas.removeEventListener('wheel', this._onWheel);
    this._canvas = null;
  }

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
      this.elevation += dy * 0.005;
      this.elevation = Math.max(this.minElevation, Math.min(this.maxElevation, this.elevation));
    } else if (pan) {
      const panSpeed = this.distance * 0.0015;
      const cosAz = Math.cos(this.azimuth);
      const sinAz = Math.sin(this.azimuth);
      const right = [-cosAz, 0, sinAz];
      const up = [0, 1, 0];

      this.target[0] -= right[0] * dx * panSpeed + up[0] * dy * panSpeed;
      this.target[1] -= right[1] * dx * panSpeed + up[1] * dy * panSpeed;
      this.target[2] -= right[2] * dx * panSpeed + up[2] * dy * panSpeed;
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

/**
 * Extract a 3x3 normal matrix from the model matrix (upper-left rotation part).
 */
function mat3FromMat4(m) {
  return new Float32Array([
    m[0], m[1], m[2],
    m[4], m[5], m[6],
    m[8], m[9], m[10],
  ]);
}
