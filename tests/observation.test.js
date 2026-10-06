import test from 'node:test';
import assert from 'node:assert/strict';
import { compassDirections } from '../js/observation.js';
import { lookAt } from '../js/math.js';
import { stereoCamera } from '../js/stereo.js';

test('cardinal directions follow known north/east/south/west camera positions',()=>{
  for(const [eye,expected] of [
    [[0,10,10],{N:[0,-1],E:[1,0]}],
    [[10,10,0],{N:[1,0],E:[0,1]}],
    [[0,10,-10],{N:[0,1],E:[-1,0]}],
    [[-10,10,0],{N:[-1,0],E:[0,-1]}]
  ]) {
    const directions=compassDirections(lookAt(eye,[0,0,0]));
    for(const [label,[x,y]] of Object.entries(expected)) {
      const d=directions.find(d=>d.label===label);
      assert.ok(Math.abs(d.x-x)<1e-6);
      assert.ok(y===0?Math.abs(d.y)<1e-6:d.y*y>0);
    }
  }
});

test('compass vectors match projected geographic displacements across orbit and stereo eyes',()=>{
  const vectors={N:[0,0,-1],E:[1,0,0],S:[0,0,1],W:[-1,0,0]};
  for(const yaw of [-Math.PI,-1.2,0,.38,Math.PI/2,2.8,7]) for(const pitch of [.12,.75,1.48]) {
    const target=[3,1.1,-2], eye=target.map((v,i)=>v+[
      19*Math.cos(pitch)*Math.sin(yaw),19*Math.sin(pitch),19*Math.cos(pitch)*Math.cos(yaw)
    ][i]);
    const directions=compassDirections(lookAt(eye,target));
    for(const offset of [-.3,0,.3]) {
      const camera=stereoCamera(eye,target,.5,offset);
      for(const d of directions) {
        const vector=vectors[d.label];
        const project=point=>[0,1].map(row=>point.reduce((sum,v,col)=>sum+camera.view[col*4+row]*v, camera.view[12+row]));
        const a=project(target),b=project(target.map((v,i)=>v+vector[i]));
        assert.ok(Math.abs(d.x-(b[0]-a[0]))<1e-6);
        assert.ok(Math.abs(d.y+(b[1]-a[1]))<1e-6);
        assert.ok(Number.isFinite(d.x)&&Number.isFinite(d.y));
      }
    }
    for(let i=0;i<2;i++) {
      assert.ok(Math.abs(directions[i].x+directions[i+2].x)<1e-6);
      assert.ok(Math.abs(directions[i].y+directions[i+2].y)<1e-6);
    }
  }
});
