import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareUrl, readSharedView } from '../js/share.js';

const view = {
  location: { latitude: 35.3606, longitude: 138.7274, zoom: 12 },
  camera: { yaw: -1.2173, pitch: 1.1, distance: 13.25, target: [3.4, 2.1, -4.5] },
  exaggeration: 2.3, mode: 'cross', quality: 'high', surface: 'photo', strength: 1.4,
  contours: true, contourInterval:20, sunAzimuth: 250, sunAltitude: 48
};

test('shared view URL round trips location, camera, and display settings', () => {
  const url = createShareUrl('https://example.test/terrain/?old=1#section', view);
  const parsed = readSharedView(new URL(url).search);
  assert.deepEqual(parsed, { ...view, camera: { ...view.camera } });
  assert.equal(new URL(url).hash, '');
  assert.equal(url.includes('old=1'), false);
});

test('ordinary URLs keep the default startup path', () => {
  assert.equal(readSharedView(''), null);
  assert.equal(readSharedView('?unrelated=1'), null);
});

test('shared view parameters are clamped and invalid choices use safe defaults', () => {
  const parsed = readSharedView('?lat=99&lon=-200&z=100&yaw=NaN&pitch=0&dist=999&tx=40&ty=-200&tz=-30&h=0&mode=unexpected&quality=invalid&surface=unknown&strength=9&contours=yes&sun=-1&alt=200');
  assert.deepEqual(parsed.location, { latitude: 46, longitude: 122, zoom: 14 });
  assert.deepEqual(parsed.camera, { yaw: .38, pitch: .12, distance: 45, target: [12, -100, -12] });
  assert.equal(parsed.exaggeration, .5);
  assert.equal(parsed.mode, 'mono'); assert.equal(parsed.quality, 'standard'); assert.equal(parsed.surface, 'elevation');
  assert.equal(parsed.strength, 2); assert.equal(parsed.contours, false); assert.equal(parsed.sunAzimuth, 0); assert.equal(parsed.sunAltitude, 85);
});

test('shared geology surface is restored as a valid surface', () => {
  assert.equal(readSharedView('?surface=geology').surface, 'geology');
});

test('contour spacing accepts public choices and old or invalid links keep 100m',()=>{
  for(const n of [10,20,50,100,200])assert.equal(readSharedView(`?ci=${n}`).contourInterval,n);
  for(const query of ['?ci=0','?ci=33','?ci=NaN','?contours=1'])assert.equal(readSharedView(query).contourInterval,100);
});
