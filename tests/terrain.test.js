import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTile, worldPixel } from '../js/elevation.js';
import { createMesh, fitMeshPositions } from '../js/mesh.js';
import { perspective, lookAt } from '../js/math.js';
import { OrbitControls, flightTourPose, centeredOrbitPose, flightLapDuration, flightCycle } from '../js/controls.js';

test('GSI text parser preserves positive, negative, zero and missing elevations',()=>{
  const rows=Array.from({length:256},()=>Array(256).fill('100'));
  rows[0].splice(0,5,'1982.3','-12.1','0','e','');
  const data=parseTile(rows.map(row=>row.join(',')).join('\r\n'));
  assert.equal(data.length,65536);
  assert.ok(Math.abs(data[0]-1982.3)<0.001);
  assert.ok(Math.abs(data[1]+12.1)<0.001);
  assert.equal(data[2],0);
  assert.ok(Number.isNaN(data[3])); assert.ok(Number.isNaN(data[4]));
  assert.throws(()=>parseTile('1,2'));
});
test('Ishizuchi resolves to the expected real GSI tile',()=>{
  const [x,y]=worldPixel(33.767,133.115,12);
  assert.equal(Math.floor(x/256),3562); assert.equal(Math.floor(y/256),1639);
});
test('mesh has upward normals and metre-to-kilometre exaggeration',()=>{
  const data={size:2,spacing:1,heights:new Float32Array([1000,1000,1000,1000])};
  const mesh=createMesh(data,2);
  assert.equal(mesh.indices.length,6);
  assert.equal(mesh.positions[1],2);
  assert.equal(mesh.positions[0],-.5);
  assert.equal(mesh.positions[2],-.5);
  assert.deepEqual([...mesh.normals],[0,1,0,0,1,0,0,1,0,0,1,0]);
  assert.ok([...mesh.colors].every(Number.isFinite));
});
test('triangles touching no-data are omitted instead of creating false valleys',()=>{
  const mesh=createMesh({size:2,spacing:1,heights:new Float32Array([NaN,1000,1000,1000])},1);
  assert.deepEqual([...mesh.indices],[1,2,3]);
});
test('camera transforms remain finite',()=>{
  for(const matrix of [perspective(Math.PI/4,1.5,.1,100),lookAt([0,10,10],[0,1,0])]) {
    assert.equal(matrix.length,16); assert.ok([...matrix].every(Number.isFinite));
  }
});
test('Shift and middle-button drags move terrain in the same screen direction at different camera angles',()=>{
  const handlers={};
  const canvas={addEventListener:(name,handler)=>handlers[name]=handler,focus(){},setPointerCapture(){}};
  const controls=new OrbitControls(canvas,()=>{});
  const screenPoint=()=>{
    const view=lookAt(controls.eye,controls.target);
    const projection=perspective(Math.PI/4,1.5,.1,100);
    const multiply=(m,v)=>Array.from({length:4},(_,row)=>v.reduce((sum,x,col)=>sum+m[col*4+row]*x,0));
    const clip=multiply(projection,multiply(view,[0,1.1,0,1]));
    return [clip[0]/clip[3],-clip[1]/clip[3]];
  };
  for(const yaw of [0,.38,Math.PI/2,Math.PI,4.7]) for(const pitch of [.12,.75,1.48]) {
    for(const button of [0,1]) for(const [dx,dy] of [[40,0],[-40,0],[0,40],[0,-40]]) {
      controls.reset(); controls.yaw=yaw; controls.pitch=pitch;
      const before=screenPoint();
      handlers.pointerdown({pointerType:'mouse',button,pointerId:1,clientX:100,clientY:100,preventDefault(){}});
      handlers.pointermove({pointerId:1,clientX:100+dx,clientY:100+dy,shiftKey:button===0});
      handlers.pointerup({pointerId:1});
      const after=screenPoint();
      assert.equal(controls.yaw,yaw); assert.equal(controls.pitch,pitch);
      assert.equal(controls.distance,19);
      assert.ok(dx ? (after[0]-before[0])*dx>0 : (after[1]-before[1])*dy>0,`yaw=${yaw}, pitch=${pitch}, drag=${dx},${dy}`);
    }
  }
});

test('flight controls move relative to heading, change altitude, and stay inside terrain bounds',()=>{
  const controls=new OrbitControls({addEventListener(){}},()=>{});
  controls.yaw=0;const start=controls.target.slice();
  controls.fly('forward');assert.ok(controls.target[2]<start[2]);assert.equal(controls.target[0],start[0]);
  controls.yaw=Math.PI/2;const before=controls.target.slice();
  controls.fly('forward');assert.ok(controls.target[0]<before[0]);
  const y=controls.target[1];controls.fly('up');assert.ok(controls.target[1]>y);controls.fly('down');assert.equal(controls.target[1],y);
  controls.target=[11.9,7.9,0];controls.yaw=Math.PI/2;controls.fly('backward');
  assert.equal(controls.target[0],12);assert.equal(controls.target[1],7.9);assert.ok(Math.abs(controls.target[2])<1e-12);
  controls.fly('up');assert.equal(controls.target[1],8);
  controls.fly('down');controls.fly('down');assert.ok(Math.abs(controls.target[1]-7.56)<1e-12);
  const unchanged=controls.target.slice();controls.fly('unknown');assert.deepEqual(controls.target,unchanged);
});

test('scenic flight follows a closed smooth route with changing view and elevation',()=>{
  const base={yaw:.38,pitch:.72,distance:19,target:[.4,1.2,-.3]};
  const start=flightTourPose(base,0),quarter=flightTourPose(base,.25),middle=flightTourPose(base,.5),end=flightTourPose(base,1);
  assert.deepEqual(start,{...base,target:base.target.slice()});
  assert.ok(Math.hypot(quarter.target[0]-base.target[0],quarter.target[2]-base.target[2])>3);
  assert.ok(quarter.distance<base.distance);
  assert.ok(Math.abs(middle.target[1]-base.target[1])<1e-12);
  assert.ok(Math.abs(middle.target[0]-base.target[0])>4);
  assert.ok(Math.abs(end.yaw-base.yaw+Math.PI*2)<1e-12);
  end.target.forEach((value,i)=>assert.ok(Math.abs(value-base.target[i])<1e-12));
  assert.ok(Math.abs(end.pitch-base.pitch)<1e-12&&Math.abs(end.distance-base.distance)<1e-12);
  assert.deepEqual(flightTourPose(base,-1),start);
  assert.deepEqual(flightTourPose(base,2),end);
});


test('wide and elevated terrain fit uniformly without changing relief ratios', () => {
  for (const spacing of [.015,1,100]) {
    const mesh=createMesh({heights:new Float32Array([3000,3100,3200,3300]),size:2,spacing},1);
    const positions=fitMeshPositions(mesh);
    const scale=positions[3]/mesh.positions[3];
    assert.ok(Math.abs((positions[4]-positions[1])/(mesh.positions[4]-mesh.positions[1])-scale)<.0001);
    assert.equal(positions[1],0);
    assert.ok(Math.max(...positions.map(Math.abs))<=12.2);
    assert.equal(mesh.positions[1],3,'Physical mesh remains unchanged');
  }
});

test('high quality meshes preserve indices above the 16-bit limit', () => {
  const size=385;
  const mesh=createMesh({size,spacing:.01,heights:new Float32Array(size*size).fill(100)},1);
  assert.ok(mesh.indices instanceof Uint32Array);
  assert.equal(mesh.indices.length,(size-1)**2*6);
  assert.equal(mesh.indices.at(-1),size*size-1);
  assert.ok(mesh.normals.every((value,i)=>i%3===1 ? value===1 : value===0));
});


test('contour elevations retain real metres through exaggeration, fitting and missing data',()=>{
  const heights=new Float32Array([-120,0,100,NaN,225,300,400,550,900]);
  const data={heights,size:3,spacing:1};
  const low=createMesh(data,.5), high=createMesh(data,4);
  assert.deepEqual(low.elevations,high.elevations);
  for(const index of low.indices) {
    assert.ok(Number.isFinite(heights[index]));
    assert.equal(low.elevations[index],heights[index]);
  }
  assert.ok(![...low.indices].includes(3));
  const original=low.elevations.slice();
  fitMeshPositions(low);
  assert.deepEqual(low.elevations,original);
  assert.deepEqual(low.indices,high.indices);
  assert.notDeepEqual(low.positions,high.positions);
  assert.ok(low.elevations.every(Number.isFinite));
});

test('centered orbit circles the starting screen-center pivot with fixed pitch, radius and distance',()=>{
  const base={yaw:.38,pitch:.75,distance:19,target:[2,1.5,-3]};
  for(const progress of [0,.25,.5,.75,1]){
    const pose=centeredOrbitPose(base,progress);
    assert.ok(Math.abs(pose.pitch-base.pitch)<1e-12);
    assert.ok(Math.abs(pose.distance-base.distance)<1e-12);
    assert.deepEqual(pose.target,base.target);
    const horizontal=pose.distance*Math.cos(pose.pitch);
    assert.ok(Math.abs(horizontal-base.distance*Math.cos(base.pitch))<1e-12);
    assert.ok(Math.abs(pose.yaw-(base.yaw-progress*Math.PI*2))<1e-12);
  }
});


test('flight speed and lap selections control independent duration, wrapping and stopping',()=>{
  assert.equal(flightLapDuration(.5),64000);assert.equal(flightLapDuration(1),32000);assert.equal(flightLapDuration(2),16000);
  assert.deepEqual(flightCycle(64000,32000,3,false),{progress:0,finished:false,lap:3});
  assert.deepEqual(flightCycle(96000,32000,3,false),{progress:1,finished:true,lap:3});
  assert.deepEqual(flightCycle(80500,32000,Infinity,true),{progress:.515625,finished:false,lap:3});
});
