/** HW5 defaults matching cg-at-uoh-26-omarryyan/nanorender/src/lighting.h */

export const DEFAULT_POINT_LIGHT = {
  position: [2.0, 3.0, 4.0],
  ambient: [0.4, 0.4, 0.4],
  diffuse: [1.0, 1.0, 1.0],
  specular: [1.0, 1.0, 1.0],
};

export const DEFAULT_MATERIAL = {
  ambient: [0.8, 0.2, 0.2],
  diffuse: [0.8, 0.2, 0.2],
  specular: [0.6, 0.6, 0.6],
  shininess: 32,
};

export const SHADING_MODES = {
  flat: 0,
  phong: 1,
};
