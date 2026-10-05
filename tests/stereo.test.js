import test from 'node:test';
import assert from 'node:assert/strict';
import { stereoCamera } from '../js/stereo.js';
import { perspective, lookAt } from '../js/math.js';

function project(camera, point) {
  const multiply = (matrix, vector) => Array.from({length:4}, (_, row) =>
    vector.reduce((sum, value, col) => sum + matrix[col*4+row]*value, 0));
  const clip=multiply(camera.projection,multiply(camera.view,[...point,1]));
  return clip.slice(0,3).map(value=>value/clip[3]);
}

test('stereo cameras converge on the target without vertical disparity at all orbit angles', () => {
  const target=[2,1.1,-3];
  for (const yaw of [-2,-0.5,0,1,3]) for (const pitch of [0.12,0.75,1.48]) {
    const eye=target.map((value,i)=>value+[
      19*Math.cos(pitch)*Math.sin(yaw),19*Math.sin(pitch),19*Math.cos(pitch)*Math.cos(yaw)
    ][i]);
    for (const aspect of [0.35,0.8,1.5]) {
      const left=stereoCamera(eye,target,aspect,-0.3), right=stereoCamera(eye,target,aspect,0.3);
      assert.ok(Math.abs(project(left,target)[0])<1e-5);
      assert.ok(Math.abs(project(right,target)[0])<1e-5);
      for (const point of [[0,0,0],[4,2,-5],[-6,1,6]]) {
        assert.ok(Math.abs(project(left,point)[1]-project(right,point)[1])<1e-5);
      }
    }
  }
});

test('near and far terrain produce opposite disparities and separation controls their size', () => {
  const eye=[0,0,20],target=[0,0,0];
  const disparity=(point,separation)=>project(stereoCamera(eye,target,1,-separation/2),point)[0]
    -project(stereoCamera(eye,target,1,separation/2),point)[0];
  assert.ok(disparity([0,0,5],0.5)>0);
  assert.ok(disparity([0,0,-5],0.5)<0);
  assert.ok(Math.abs(disparity([0,0,5],1)-2*disparity([0,0,5],0.5))<1e-6);
  assert.equal(disparity([4,2,5],0),0);
});

test('zero separation retains the normal perspective and view', () => {
  const eye=[4,12,15],target=[0,1.1,0];
  const camera=stereoCamera(eye,target,1.5);
  assert.deepEqual(camera.view,lookAt(eye,target));
  assert.ok(camera.projection.every((value,i)=>value===perspective(Math.PI/4,1.5,0.1,100)[i]));
});

test('distant cameras on narrow screens keep terrain inside the depth range', () => {
  const camera=stereoCamera([0,150,280],[0,1.1,0],0.18,2);
  for (const point of [[0,0,0],[6,0,-6],[-6,8,6]]) {
    const depth=project(camera,point)[2];
    assert.ok(depth>-1 && depth<1);
  }
});
