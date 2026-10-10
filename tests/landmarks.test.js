import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARKS, CATEGORIES, REGIONS, filterLandmarks, findLandmark, landmarkLocation, matchingLandmark } from '../js/landmarks.js';
import { BATHYMETRY_SPOTS } from '../js/bathymetry-spots.js';
import { bathymetryRegions } from '../js/bathymetry.js';
import { terrainExtent, worldPixel } from '../js/elevation.js';
import { landmarkCamera } from '../js/landmark-camera.js';
import { createMesh, fitMeshPositions } from '../js/mesh.js';
import { stereoCamera } from '../js/stereo.js';
import { projectPoint } from '../js/profile.js';

test('the five existing and twelve priority landmarks have unique, sourced learning records',()=>{
  const expected=['ishizuchi','fuji','aso','daisetsu','yakushima','aogashima','hachijojima','omuroyama','satsuma-iojima','suwanosejima','kurobe','oboke','akiyoshidai','itoigawa','izu','kikaijima','minamidaito'];
  assert.deepEqual(LANDMARKS.slice(0,17).map(p=>p.id),expected);
  assert.equal(BATHYMETRY_SPOTS.length,30);
  assert.deepEqual(LANDMARKS.slice(17).map(p=>p.id),BATHYMETRY_SPOTS.map(p=>p.id));
  assert.equal(new Set(LANDMARKS.map(p=>p.id)).size,47);
  for(const p of LANDMARKS){
    assert.ok(p.name&&p.prefecture&&REGIONS.includes(p.region));
    assert.ok(p.categories.length&&p.categories.every(c=>c in CATEGORIES));
    assert.ok(p.center.latitude>=20&&p.center.latitude<=46&&p.center.longitude>=122&&p.center.longitude<=154);
    for(const mode of ['terrain','geology']){
      assert.ok(p[mode].summary&&p[mode].detail.length>35&&p[mode].points.length);
      const s=p.settings[mode];assert.ok(Number.isInteger(s.zoom)&&s.zoom>=5&&s.zoom<=14);
      assert.ok(s.exaggeration>=.5&&s.exaggeration<=4&&['standard','high','ultra'].includes(s.quality));
      assert.ok(['elevation','shading','photo','map','geology'].includes(s.surface));assert.equal(typeof s.contours,'boolean');
      assert.ok(s.camera.pitch>=.12&&s.camera.pitch<=1.48&&s.camera.distance>=4&&s.camera.distance<=45&&Number.isFinite(s.camera.yaw));
    }
    if(!p.bathymetry)assert.equal(p.settings.geology.surface,'geology');assert.ok(p.geology.rocks&&p.geology.age&&p.limitations.length&&p.coordinateNote);
    assert.ok(p.references.length>=2&&p.references.every(r=>r.title&&new URL(r.url).protocol==='https:'&&r.checked));
  }
});
test('the observation bounds fit the actual rounded 384-pixel DEM footprint',()=>{
  for(const p of LANDMARKS){
    const loc=landmarkLocation(p),[x,y]=worldPixel(loc.latitude,loc.longitude,loc.zoom);
    const [west,south,east,north]=p.coverage;
    for(const lat of [south,north])for(const lon of [west,east]){
      const [px,py]=worldPixel(lat,lon,loc.zoom);
      assert.ok(Math.abs(px-Math.floor(x))<192&&Math.abs(py-Math.floor(y))<192,`${p.id}: coverage does not fit`);
    }
    assert.ok(terrainExtent(loc.latitude,loc.zoom)>0);
  }
  assert.ok(terrainExtent(findLandmark('aso').center.latitude,findLandmark('aso').settings.terrain.zoom)>32);
  assert.ok(terrainExtent(findLandmark('aogashima').center.latitude,findLandmark('aogashima').settings.terrain.zoom)>3.5);
  for(const p of BATHYMETRY_SPOTS)assert.ok(bathymetryRegions(landmarkLocation(p)).length,`${p.id}: no candidate data region`);
});
test('classification, regions and coordinate lookup do not mutate recommendations',()=>{
  const before=JSON.stringify(LANDMARKS);
  assert.equal(filterLandmarks().length,47);
  assert.equal(filterLandmarks('marineVolcano').length,13);
  assert.equal(filterLandmarks('trench').length,7);
  assert.deepEqual(filterLandmarks('karst','中国・四国').map(p=>p.id),['akiyoshidai']);
  assert.equal(filterLandmarks('unknown').length,0);
  assert.equal(findLandmark('unknown'),null);
  assert.equal(matchingLandmark({latitude:33.767,longitude:133.115}).id,'ishizuchi');
  assert.equal(matchingLandmark({latitude:35,longitude:135}),null);
  assert.deepEqual(landmarkLocation(findLandmark('fuji')),{latitude:35.3606,longitude:138.7274,zoom:11});
  assert.equal(JSON.stringify(LANDMARKS),before);
});
test('recommended cameras fit mountains and missing-sea islands in portrait, landscape and desktop',()=>{
  for(const island of [false,true]){
    const size=49,heights=Float32Array.from({length:size*size},(_,i)=>{
      const x=(i%size-24)/24,z=(Math.floor(i/size)-24)/24;
      if(island&&x*x+z*z>.6)return NaN;
      return 1500+1500*Math.exp(-(x*x+z*z)*4);
    });
    for(const p of LANDMARKS){
      const mesh=createMesh({heights,size,spacing:.15},p.settings.terrain.exaggeration);mesh.positions=fitMeshPositions(mesh);
      const before=mesh.positions.slice();
      for(const aspect of [.8,1.5,2.3]){
        const pose=landmarkCamera(mesh,p.settings.terrain.camera,aspect),fit=Math.max(1,1.15/aspect);
        const eye=[pose.target[0]+Math.sin(pose.yaw)*Math.cos(pose.pitch)*pose.distance*fit,pose.target[1]+Math.sin(pose.pitch)*pose.distance*fit,pose.target[2]+Math.cos(pose.yaw)*Math.cos(pose.pitch)*pose.distance*fit];
        const camera={...stereoCamera(eye,pose.target,aspect),x:0,width:aspect*1000,height:1000};
        for(const index of new Set(mesh.indices)){
          const point=projectPoint(Array.from(mesh.positions.slice(index*3,index*3+3)),camera);
          assert.ok(point.w>0&&point.z<1&&point.x>=camera.width*.08&&point.x<=camera.width*.92&&point.y>=80&&point.y<=920,p.id);
        }
        assert.ok(eye[1]>Math.max(...mesh.positions.filter((_,i)=>i%3===1)));
      }
      assert.deepEqual(mesh.positions,before);
    }
  }
  assert.throws(()=>landmarkCamera({positions:[],indices:[]},{yaw:0,pitch:1,distance:13},1),/地形/);
});
