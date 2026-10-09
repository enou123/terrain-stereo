import test from 'node:test';
import assert from 'node:assert/strict';
import {LANDMARKS,findLandmark} from '../js/landmarks.js';
import {LANDMARK_SPOTS,spotsFor,findSpot,observationPreset,observationLocation,observationFocus,matchesObservation} from '../js/landmark-spots.js';
import {contourInterval,CONTOUR_INTERVALS} from '../js/contours.js';
import {terrainExtent} from '../js/elevation.js';

test('six existing places have ten sourced observation spots within real DEM bounds',()=>{
 assert.deepEqual(Object.keys(LANDMARK_SPOTS).sort(),['akiyoshidai','aogashima','aso','kikaijima','kurobe','minamidaito']);
 assert.equal(Object.values(LANDMARK_SPOTS).flat().length,10);
 for(const [id,spots] of Object.entries(LANDMARK_SPOTS)){
  const place=findLandmark(id);assert.ok(place);assert.equal(new Set(spots.map(s=>s.id)).size,spots.length);
  for(const spot of spots){
   const preset=observationPreset(place,'terrain',spot.id),loc=observationLocation(place,'terrain',spot.id),focus=observationFocus(spot,loc);
   assert.ok(spot.description.length>30&&spot.limit.length>20&&spot.references.length>=2);
   assert.ok(spot.references.every(r=>r.checked&&r.title&&new URL(r.url).protocol==='https:'));
   assert.ok(preset.zoom<=14&&preset.zoom>place.settings.terrain.zoom);
   assert.ok(terrainExtent(loc.latitude,loc.zoom)<terrainExtent(place.center.latitude,place.settings.terrain.zoom));
   assert.ok(focus.every(x=>x>=0&&x<=1),`${id}/${spot.id}: feature outside DEM ${focus}`);
   assert.ok(focus[2]>focus[0]&&focus[3]>focus[1]);
   assert.ok(CONTOUR_INTERVALS.includes(preset.contourInterval));
   assert.ok(preset.camera.pitch>=.12&&preset.camera.pitch<=1.48&&preset.exaggeration>=.5&&preset.exaggeration<=4);
   assert.ok(matchesObservation(place,loc,spot.id));
   assert.equal(observationPreset(place,'geology',spot.id).surface,'geology');
  }
 }
});
test('whole recommendations and spot helpers do not mutate records or create unknown spots',()=>{
 const before=JSON.stringify([LANDMARKS,LANDMARK_SPOTS]),aoga=findLandmark('aogashima');
 assert.deepEqual(observationLocation(aoga),{...aoga.center,zoom:aoga.settings.terrain.zoom});
 assert.equal(findSpot('unknown','unknown'),null);assert.deepEqual(spotsFor('unknown'),[]);
 assert.equal(observationPreset(aoga,'terrain','unknown'),aoga.settings.terrain);
 assert.equal(matchesObservation(aoga,{latitude:35,longitude:135}),false);
 assert.equal(observationFocus(null,{}),null);
 assert.equal(JSON.stringify([LANDMARKS,LANDMARK_SPOTS]),before);
 for(const place of LANDMARKS)for(const s of Object.values(place.settings))assert.ok(CONTOUR_INTERVALS.includes(s.contourInterval));
});
test('contour intervals reject unsafe or unsupported uniforms',()=>{
 for(const n of CONTOUR_INTERVALS)assert.equal(contourInterval(String(n)),n);
 for(const n of [null,undefined,NaN,0,-10,Infinity,33,'bogus'])assert.equal(contourInterval(n),100);
});
