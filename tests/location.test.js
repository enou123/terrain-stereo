import test from 'node:test';
import assert from 'node:assert/strict';
import { worldPixel, loadElevation, terrainZoom, terrainExtent } from '../js/elevation.js';
import { pixelLocation, constrainLocation } from '../js/map.js';

test('map coordinates round trip across Japan and constrain navigation at its edges', () => {
  for (const [latitude, longitude] of [[20,122],[46,154],[35.3606,138.7274],[26.2,127.7]]) {
    for (const zoom of [4,6,12,15]) {
      const actual=pixelLocation(...worldPixel(latitude,longitude,zoom),zoom);
      assert.ok(Math.abs(actual.latitude-latitude)<1e-10);
      assert.ok(Math.abs(actual.longitude-longitude)<1e-10);
    }
  }
  assert.deepEqual(constrainLocation({latitude:90,longitude:180}),{latitude:46,longitude:154,zoom:12});
  assert.deepEqual(constrainLocation({latitude:0,longitude:100}),{latitude:20,longitude:122,zoom:12});
});

test('map zoom changes terrain extent by powers of two within supported limits', () => {
  assert.equal(terrainZoom(11),12);
  assert.equal(terrainZoom(4),6);
  assert.equal(terrainZoom(15),14);
  assert.equal(terrainExtent(33.767,8),terrainExtent(33.767,12)*16);
});

test('selected location changes DEM tiles and scale, reuses cache, and allows retry after failures', async () => {
  const original=globalThis.fetch, requests=[];
  let fail=false;
  const tile=Array.from({length:256},()=>Array(256).fill('1000').join(',')).join('\n');
  globalThis.fetch=async url=>{
    requests.push(url);
    return {ok:!fail,status:fail?503:200,text:async()=>tile};
  };
  try {
    const fuji={latitude:35.3606,longitude:138.7274,zoom:12};
    const first=await loadElevation(()=>{},fuji);
    assert.deepEqual(first.location,fuji);
    const [x,y]=worldPixel(fuji.latitude,fuji.longitude,12);
    assert.ok(requests.includes(`https://cyberjapandata.gsi.go.jp/xyz/dem/12/${Math.floor(x/256)}/${Math.floor(y/256)}.txt`));
    const wide=await loadElevation(()=>{},{...fuji,zoom:8});
    assert.equal(wide.spacing,first.spacing*16);
    assert.equal(wide.size,first.size);
    assert.ok(wide.tileCount<=9);
    assert.ok(requests.some(url=>url.includes('/dem/8/')));
    await assert.rejects(loadElevation(()=>{},{...fuji,zoom:15}),/縮尺/);
    await assert.rejects(loadElevation(()=>{},{...fuji,zoom:8.5}),/縮尺/);
    const count=requests.length;
    await loadElevation(()=>{},fuji);assert.equal(requests.length,count);
    const north=await loadElevation(()=>{},{latitude:43.6636,longitude:142.8541,zoom:12});
    assert.ok(north.spacing<first.spacing);
    fail=true;
    await assert.rejects(loadElevation(()=>{},{latitude:32.884,longitude:131.104,zoom:12}),/HTTP 503/);
    fail=false;
    const retried=await loadElevation(()=>{},{latitude:32.884,longitude:131.104,zoom:12});
    assert.equal(retried.validCount,193**2);
    await loadElevation(()=>{},{latitude:30.3361,longitude:130.5044,zoom:12});
    const beforeEviction=requests.length;
    await loadElevation(()=>{},fuji);
    assert.ok(requests.length>beforeEviction,'Distant exploration evicts old tiles from the bounded cache');
    globalThis.fetch=async()=>({ok:true,text:async()=>tile.replaceAll('1000','e')});
    await assert.rejects(loadElevation(()=>{},{latitude:27,longitude:145,zoom:12}),/有効な標高データがありません/);
    await assert.rejects(loadElevation(()=>{},{latitude:NaN,longitude:133}),/緯度・経度/);
  } finally { globalThis.fetch=original; }
});
