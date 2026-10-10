import { contourInterval } from './contours.js?v=0.37.0';
const MODES = new Set(['mono', 'parallel', 'cross', 'anaglyph']);
const QUALITIES = new Set(['standard', 'high', 'ultra']);
const SURFACES = new Set(['elevation', 'shading', 'map', 'photo', 'geology']);

function number(params, key, fallback, min, max) {
  const value = Number(params.get(key));
  return params.has(key) && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function readSharedView(search) {
  const params = new URLSearchParams(search);
  if (!['lat', 'lon', 'z', 'yaw', 'pitch', 'dist', 'tx', 'ty', 'tz', 'h', 'mode', 'quality', 'surface', 'strength', 'contours', 'ci', 'sun', 'alt', 'sea'].some(key => params.has(key))) return null;
  const mode = params.get('mode'), quality = params.get('quality'), surface = params.get('surface');
  const sun = params.get('sun'), altitude = params.get('alt');
  return {
    location: {
      latitude: number(params, 'lat', 33.767, 20, 46),
      longitude: number(params, 'lon', 133.115, 122, 154),
      zoom: number(params, 'z', 12, 5, 14)
    },
    camera: {
      yaw: number(params, 'yaw', .38, -1000, 1000),
      pitch: number(params, 'pitch', .75, .12, Math.PI/2),
      distance: number(params, 'dist', 19, 4, 45),
      target: [number(params, 'tx', 0, -12, 12), number(params, 'ty', 1.1, -100, 100), number(params, 'tz', 0, -12, 12)]
    },
    exaggeration: number(params, 'h', 1.5, .5, 4),
    mode: MODES.has(mode) ? mode : 'mono',
    quality: QUALITIES.has(quality) ? quality : 'standard',
    surface: SURFACES.has(surface) ? surface : 'elevation',
    strength: number(params, 'strength', 1, 0, 2),
    contours: params.get('contours') === '1',
    bathymetry:params.get('sea')==='1',
    contourInterval: contourInterval(params.get('ci')),
    sunAzimuth: number(params, 'sun', 315, 0, 359),
    sunAltitude: number(params, 'alt', 35, 5, 85)
  };
}

export function createShareUrl(base, state) {
  const url = new URL(base);
  const params = new URLSearchParams();
  const add = (key, value, digits = 2) => params.set(key, Number(value).toFixed(digits));
  add('lat', state.location.latitude, 5); add('lon', state.location.longitude, 5); add('z', state.location.zoom, 2);
  add('yaw', state.camera.yaw, 4); add('pitch', state.camera.pitch, 4); add('dist', state.camera.distance, 3);
  add('tx', state.camera.target[0], 3); add('ty', state.camera.target[1], 3); add('tz', state.camera.target[2], 3);
  add('h', state.exaggeration, 1); params.set('mode', state.mode); params.set('quality', state.quality);
  params.set('surface', state.surface); add('strength', state.strength, 1);
  if(state.bathymetry)params.set('sea','1');
  params.set('contours', state.contours ? '1' : '0'); params.set('ci', String(contourInterval(state.contourInterval))); add('sun', state.sunAzimuth, 0); add('alt', state.sunAltitude, 0);
  url.search = params.toString();
  url.hash = '';
  return url.href;
}
