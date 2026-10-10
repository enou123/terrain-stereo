import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bathymetryRegion,decodeBathymetry,sampleBathymetry,mergeBathymetry} from '../js/bathymetry.js';
import {createMesh,fitMeshPositions} from '../js/mesh.js';
import {readSharedView,createShareUrl} from '../js/share.js';
const metadata=JSON.parse(readFileSync(new URL('../data/bathymetry/aogashima-gmrt-4.5.0.json',import.meta.url)));
const bytes=readFileSync(new URL('../data/bathymetry/aogashima-gmrt-4.5.0.bin',import.meta.url));
const grid=decodeBathymetry(metadata,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
test('official GMRT snapshot has realistic land and varied negative depths with explicit source and license',()=>{
 assert.equal(metadata.sourceVersion,'GMRT v4.5.0 (2026年6月)');assert.equal(metadata.license,'CC BY 4.0');
 assert.ok(sampleBathymetry(grid,32.459,139.759).height>100);
 assert.ok(sampleBathymetry(grid,32.459,139.65).height<-1000);
 assert.ok(sampleBathymetry(grid,32.459,139.9).height<-500);
 assert.ok(Number.isNaN(sampleBathymetry(grid,35,139).height));
 assert.equal(bathymetryRegion({latitude:35.36,longitude:138.72,zoom:12}),null);
 assert.equal(bathymetryRegion({latitude:32.457,longitude:139.762,zoom:8}),null);
 assert.equal(bathymetryRegion({latitude:32.457,longitude:139.762,zoom:12}).id,'aogashima');
});
test('adding bathymetry preserves valid GSI elevations and the fitted land positions',()=>{
 const size=9,heights=new Float32Array(size*size).fill(NaN);
 for(let r=3;r<6;r++)for(let c=3;c<6;c++)heights[r*size+c]=100+(r-3)*50;
 const land={size,heights,spacing:1.37,min:100,max:200,location:{latitude:32.457,longitude:139.762,zoom:12}};
 const merged=mergeBathymetry(land,grid);assert.ok(merged.bathymetry.seaCount>30);
 const before=fitMeshPositions(createMesh(land,1.5)),after=fitMeshPositions(createMesh(merged,1.5));
 for(let i=0;i<heights.length;i++)if(Number.isFinite(heights[i])){
  assert.equal(merged.heights[i],heights[i]);assert.deepEqual(after.slice(i*3,i*3+3),before.slice(i*3,i*3+3));assert.equal(merged.seaMask[i],0);
 }
 assert.ok(merged.heights.some(h=>h<-500));assert.ok(Number.isNaN(land.heights[0]));
});
test('invalid or truncated grids are rejected and no-data is not filled',()=>{
 assert.throws(()=>decodeBathymetry(metadata,new ArrayBuffer(10)));
 const bad={...grid,values:grid.values.slice()};bad.values.fill(-32768);
 assert.ok(Number.isNaN(sampleBathymetry(bad,32.45,139.76).height));
});
test('old shared views remain sea-off and new views preserve sea-on',()=>{
 assert.equal(readSharedView('?lat=32.45').bathymetry,false);
 const state=readSharedView('?lat=32.45&lon=139.76&sea=1');
 assert.equal(readSharedView(new URL(createShareUrl('https://example.com/',state)).search).bathymetry,true);
});

test('seabed depth palette has shared exact stops and clamps at 2000m',async()=>{
 const {SEABED_COLOR_STOPS,seabedColorAtDepth}=await import('../js/mesh.js');
 assert.equal(SEABED_COLOR_STOPS.length,4);
 assert.deepEqual(seabedColorAtDepth(0),SEABED_COLOR_STOPS[0]);
 assert.deepEqual(seabedColorAtDepth(2000).map(v=>Math.round(v*255)),[26,56,112]);
 assert.deepEqual(seabedColorAtDepth(8000),seabedColorAtDepth(2000));
 assert.deepEqual(seabedColorAtDepth(2000).map(v=>Math.round(v*255)),[26,56,112]);
});
test('wide GMRT snapshot covers both island centers and bathymetryRegion chooses narrow Aogashima grid when possible',()=>{
 const wide=JSON.parse(readFileSync(new URL('../data/bathymetry/hachijo-aogashima-gmrt-4.5.0.json',import.meta.url)));
 const wideBytes=readFileSync(new URL('../data/bathymetry/hachijo-aogashima-gmrt-4.5.0.bin',import.meta.url));
 const wideGrid=decodeBathymetry(wide,wideBytes.buffer.slice(wideBytes.byteOffset,wideBytes.byteOffset+wideBytes.byteLength));
 assert.equal(wide.width,524);assert.equal(wide.height,475);assert.ok(wide.bytes<600000);
 assert.ok(sampleBathymetry(wideGrid,33.1,139.78).height>0);
 assert.ok(sampleBathymetry(wideGrid,32.46,139.76).height>0);
 assert.ok(sampleBathymetry(wideGrid,32.8,139.78).height<-400);
 assert.equal(bathymetryRegion({latitude:32.78,longitude:139.78,zoom:9}).id,'hachijo-aogashima');
 assert.equal(bathymetryRegion({latitude:32.457,longitude:139.762,zoom:12}).id,'aogashima');
});
