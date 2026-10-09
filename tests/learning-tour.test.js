import test from 'node:test';
import assert from 'node:assert/strict';
import {LEARNING_TOURS,learningTourFor} from '../js/learning-tour.js';
import {findLandmark} from '../js/landmarks.js';
import {findSpot} from '../js/landmark-spots.js';

test('the first learning tours connect real terrain, source-backed geology and valid DEM spots',()=>{
 assert.deepEqual(Object.keys(LEARNING_TOURS).sort(),['akiyoshidai','aogashima','aso','itoigawa','kikaijima','kurobe','minamidaito']);
 for(const [id,steps] of Object.entries(LEARNING_TOURS)){
  const place=findLandmark(id);assert.ok(place);assert.ok(steps.length>=2);
  assert.equal(steps[0].mode,'terrain');assert.ok(steps.some(s=>s.mode==='geology'));
  for(const step of steps){
   assert.ok(step.title.length>2&&step.copy.length>30&&step.prompt.length>20);
   assert.ok(step.mode==='terrain'||step.mode==='geology');
   if(step.spot)assert.ok(findSpot(id,step.spot),`${id}: missing ${step.spot}`);
  }
 }
 assert.match(LEARNING_TOURS.akiyoshidai[1].copy,/地質図の色は岩石・地層の区分/);
 assert.match(LEARNING_TOURS.itoigawa[1].copy,/すべてが糸魚川－静岡構造線ではありません/);
 assert.match(LEARNING_TOURS.aogashima[0].copy,/海底.*含まれません/);
 assert.match(LEARNING_TOURS.aso[0].copy,/外輪山.*中央火口丘群/);
 assert.match(LEARNING_TOURS.kikaijima[2].copy,/石灰岩/);
 assert.match(LEARNING_TOURS.minamidaito[0].copy,/火山カルデラではなく/);
 assert.equal(LEARNING_TOURS.kurobe[1].spot,'sennindani');
 assert.ok(LEARNING_TOURS.aso.some(s=>s.spot==='nakadake'&&s.mode==='geology'));
 assert.equal(learningTourFor('fuji'),null);
});
