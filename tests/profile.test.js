import test from 'node:test';
import assert from 'node:assert/strict';
import {gridSample,sectionSamples,gridPosition,projectPoint,pickSurface} from '../js/profile.js';
import {createMesh,fitMeshPositions} from '../js/mesh.js';
import {stereoCamera} from '../js/stereo.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
test('section interpolation follows the actual diagonal triangles, real metres and missing vertices',()=>{
 const data={size:2,spacing:1,heights:new Float32Array([-100,100,300,900])};
 near(gridSample(data,.25,.25),50);near(gridSample(data,.75,.75),550);
 near(gridSample(data,1,1),900);assert.ok(Number.isNaN(gridSample(data,-.1,.5)));
 data.heights[3]=NaN;near(gridSample(data,.25,.25),50);assert.ok(Number.isNaN(gridSample(data,.75,.75)));
});
test('sections include cell and diagonal crossings and retain missing intervals without false zero elevation',()=>{
 const data={size:4,spacing:2,heights:new Float32Array([0,10,20,30,0,10,NaN,30,0,10,20,30,0,10,20,30])};
 const a={u:0,v:.4},b={u:1,v:.4},result=sectionSamples(data,a,b);
 near(result.length,6);near(result.samples[0].height,0);near(result.samples.at(-1).height,30);
 assert.ok(result.samples.some(p=>Number.isNaN(p.height)));
 assert.ok(result.samples.some(p=>Math.abs(p.t-1/3)<1e-9));
 const reverse=sectionSamples(data,b,a);near(reverse.length,result.length);
 const zero=sectionSamples(data,a,a);near(zero.length,0);assert.ok(zero.samples.every(p=>p.height===0));
});
test('screen picking agrees with visible terrain through orbit, fitting, stereo eye order and portrait aspect',()=>{
 const data={size:3,spacing:1,heights:new Float32Array([0,100,200,100,200,300,200,300,400])};
 for(const exaggeration of [.5,4]) {
 const original=createMesh(data,exaggeration),mesh={positions:fitMeshPositions(original),indices:original.indices,size:3};
 for(const yaw of [0,.9,2.8,-1.6])for(const aspect of [.45,1.6])for(const offset of [-.5,0,.5]) {
 const target=[0,1,0],eye=[20*Math.sin(yaw),15,20*Math.cos(yaw)];
 const camera={...stereoCamera(eye,target,aspect,offset),x:70,width:450,height:450/aspect};
 const expected={u:.38,v:.61},point=projectPoint(gridPosition(mesh,expected),camera),hit=pickSurface(point.x,point.y,camera,mesh);
 assert.ok(hit);near(hit.u,expected.u);near(hit.v,expected.v);
 assert.equal(pickSurface(0,0,camera,mesh),null);
 }
 }
});
test('picking chooses the front triangle and never fills a missing terrain hole',()=>{
 const camera={...stereoCamera([0,10,0.001],[0,0,0],1),x:0,width:400,height:400};
 const mesh={size:4,positions:new Float32Array([-1,0,-1,1,0,-1,-1,0,1,1,0,1,-1,2,-1,1,2,-1,-1,2,1,1,2,1]),indices:new Uint16Array([0,2,1,1,2,3,4,6,5,5,6,7])};
 const p=projectPoint([0,2,0],camera),hit=pickSurface(p.x,p.y,camera,mesh);
 assert.ok(hit.v>.3,'nearest triangle must come from the upper layer');
 const data={size:5,spacing:1,heights:new Float32Array(25)};data.heights[12]=NaN;
 const original=createMesh(data,1),hole={size:5,positions:fitMeshPositions(original),indices:original.indices};
 const centre=projectPoint([0,0,0],camera);assert.equal(pickSurface(centre.x,centre.y,camera,hole),null);
});
test('picking retains grid indices above the 16-bit boundary',()=>{
 const size=257,data={size,spacing:.01,heights:new Float32Array(size*size).fill(100)};
 const original=createMesh(data,1),mesh={size,positions:fitMeshPositions(original),indices:original.indices};
 assert.ok(mesh.indices instanceof Uint32Array);
 const camera={...stereoCamera([0,18,.001],[0,0,0],1),x:0,width:600,height:600};
 const expected={u:.96,v:.999},p=projectPoint(gridPosition(mesh,expected),camera),hit=pickSurface(p.x,p.y,camera,mesh);
 near(hit.u,expected.u);near(hit.v,expected.v);
});
