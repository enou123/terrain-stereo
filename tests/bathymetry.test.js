import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bathymetryRegion,bathymetryRegions,decodeBathymetry,sampleBathymetry,mergeBathymetry} from '../js/bathymetry.js';
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
 assert.equal(bathymetryRegion({latitude:35.36,longitude:138.72,zoom:12}).id,'suruga-sagami');
 assert.ok(['izu-north-north','izu-north-south','izu-south','hachijo-aogashima'].includes(bathymetryRegion({latitude:32.457,longitude:139.762,zoom:8}).id));
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
 assert.notDeepEqual(seabedColorAtDepth(8000,10000),seabedColorAtDepth(2000,10000));
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

test('nine recovered GMRT regional grids match their manifests and recorded hashes',()=>{
 const ids=['daito','izu-south','japan-trench','kuril-trench','nankai-west','okinawa-islands','ryukyu-trench-trough','tokara-amami','yaeyama'];
 for(const id of ids){
  const metadata=JSON.parse(readFileSync(new URL(`../data/bathymetry/${id}.json`,import.meta.url)));
  const bytes=readFileSync(new URL(`../data/bathymetry/${metadata.file}`,import.meta.url));
  assert.equal(metadata.id,id);assert.equal(metadata.sourceVersion,'GMRT v4.5.0 (2026年6月)');
  assert.equal(metadata.license,'CC BY 4.0');assert.equal(bytes.byteLength,metadata.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.sha256);
  assert.equal(bytes.byteLength,metadata.width*metadata.height*2+Math.ceil(metadata.width*metadata.height/8));
  assert.ok(metadata.actualSpacingMeters.every(x=>Number.isFinite(x)&&x>0));
  const grid=decodeBathymetry(metadata,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.ok(grid.values.some(value=>value<0&&value!==metadata.nodata),`${id} should contain valid bathymetry`);
 }
 const report=JSON.parse(readFileSync(new URL('../data/bathymetry/acquisition-2026-10-10-report.json',import.meta.url)));
 assert.equal(report.regionGroup,'all');assert.equal(report.regions.filter(r=>r.status==='ok').length,9);
 assert.deepEqual(report.regions.filter(r=>r.status==='failed').map(r=>r.id).sort(),['izu-north','suruga-sagami']);
});

test('incremental GMRT retry adds the successful Suruga-Sagami grid and records the remaining Izu failure',()=>{
 const metadata=JSON.parse(readFileSync(new URL('../data/bathymetry/suruga-sagami.json',import.meta.url)));
 const bytes=readFileSync(new URL(`../data/bathymetry/${metadata.file}`,import.meta.url));
 assert.equal(metadata.id,'suruga-sagami');assert.equal(metadata.width,604);assert.equal(metadata.height,625);
 assert.equal(bytes.byteLength,metadata.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.sha256);
 assert.deepEqual(metadata.actualSpacingMeters.map(x=>Math.round(x)),[805,805]);
 const report=JSON.parse(readFileSync(new URL('../data/bathymetry/acquisition-2026-10-10-remaining-report.json',import.meta.url)));
 assert.equal(report.regionGroup,'remaining');
 assert.equal(report.regions.find(r=>r.id==='suruga-sagami').status,'ok');
 assert.match(report.regions.find(r=>r.id==='izu-north').error,/931014 cells/);
});

test('split northern Izu grids are intact, overlap, and together replace the oversized request',()=>{
 const load=id=>{
  const metadata=JSON.parse(readFileSync(new URL(`../data/bathymetry/${id}.json`,import.meta.url)));
  const bytes=readFileSync(new URL(`../data/bathymetry/${metadata.file}`,import.meta.url));
  assert.equal(metadata.id,id);assert.equal(bytes.byteLength,metadata.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.sha256);
  assert.ok(metadata.width*metadata.height<=900000);
  const grid=decodeBathymetry(metadata,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.ok(grid.values.some(value=>value<0&&value!==metadata.nodata));return metadata;
 };
 const north=load('izu-north-north'),south=load('izu-north-south');
 assert.ok(north.actualRasterBounds[1]<south.actualRasterBounds[3],'adjacent rasters should overlap to avoid a seam');
 assert.ok(north.actualRasterBounds[0]<=136.5&&north.actualRasterBounds[2]>=143.7);
 assert.ok(south.actualRasterBounds[1]<=28&&south.actualRasterBounds[3]>=32.3);
 const report=JSON.parse(readFileSync(new URL('../data/bathymetry/acquisition-2026-10-10-remaining-izu-report.json',import.meta.url)));
 assert.equal(report.regionGroup,'remaining');assert.equal(report.regions.length,2);
 assert.ok(report.regions.every(r=>r.status==='ok'));
});

test('wide map windows retain every intersecting regional grid candidate',()=>{
 const regions=bathymetryRegions({latitude:30.3,longitude:141.6,zoom:5});
 assert.ok(regions.length>=6,regions.map(r=>r.id));
 assert.ok(regions.some(r=>r.id==='izu-north-north')&&regions.some(r=>r.id==='izu-north-south')&&regions.some(r=>r.id==='izu-south')&&regions.some(r=>r.id==='suruga-sagami'));
});

test('overlapping regional grids blend smoothly at a finer tile edge',()=>{
 const mk=(id,lon0,spacing,value)=>{
  const metadata={id,width:5,height:5,lon0,lat0:1,dx:.25,dy:-.25,nodata:-32768,actualSpacingMeters:[spacing,spacing],depthScaleMax:5000};
  return {metadata,values:new Int16Array(25).fill(value),coverage:new Uint8Array(4).fill(255)};
 };
 const coarse=mk('coarse',-.25,2000,-1000),fine=mk('fine',0,100,-2000);
 assert.equal(sampleBathymetry([fine,coarse],.5,0).height,-1000);
 assert.equal(sampleBathymetry([fine,coarse],.5,.25).height,-1500);
 assert.equal(sampleBathymetry([fine,coarse],.5,.5).height,-2000);
});
