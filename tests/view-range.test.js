import test from 'node:test';
import assert from 'node:assert/strict';
import {movedRange,scaledRange} from '../js/view-range.js';
import {worldPixel} from '../js/elevation.js';
const location={latitude:33.767,longitude:133.115,zoom:12},base={target:[0,1,0],distance:20};
const mesh={positions:new Float32Array([-6.1,0,-6.1,6.1,0,6.1])};
test('pan commits world east/south displacement at fitted mesh scale',()=>{
 const result=movedRange({location},mesh,base,{target:[3.05,1,-3.05]});
 const a=worldPixel(location.latitude,location.longitude,12),b=worldPixel(result.latitude,result.longitude,12);
 assert.ok(Math.abs(b[0]-a[0]-96)<.001);assert.ok(Math.abs(b[1]-a[1]+96)<.001);assert.equal(result.zoom,12);
});
test('zoom uses distance ratio, preserves loaded center, rounds and clamps map steps',()=>{
 for(const [distance,zoom] of [[10,13],[40,11],[19,12],[1,14],[10000,5]]){
 const result=scaledRange(location,base,{distance,target:[10,1,10]});assert.deepEqual(result,{...location,zoom});
 }
});
test('invalid range and movement outside Japan are rejected',()=>{
 assert.throws(()=>movedRange({location},{positions:new Float32Array([0,0,0])},base,{target:[1,1,1]}));
 assert.throws(()=>movedRange({location},mesh,base,{target:[100000,1,1]}));
});
