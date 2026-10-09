import { perspective, lookAt } from './math.js?v=0.26.4';

// Parallel cameras with off-axis projection put the target on the screen plane.
// offset is in terrain units (km); positive offsets place the camera to the right.
export function stereoCamera(eye, target, aspect, offset = 0) {
  const direction = eye.map((value, i) => value - target[i]);
  const distance = Math.hypot(...direction);
  const horizontal = Math.hypot(direction[0], direction[2]);
  const right = [direction[2] / horizontal, 0, -direction[0] / horizontal];
  const shift = point => point.map((value, i) => value + right[i] * offset);
  const projection = perspective(Math.PI / 4, aspect, 0.1, Math.max(100, distance + 30));
  projection[8] = -offset * projection[0] / distance;
  return { projection, view: lookAt(shift(eye), shift(target)) };
}
