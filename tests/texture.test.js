import test from 'node:test';
import assert from 'node:assert/strict';
import { texturePlan, textureKey } from '../js/texture.js';
import { worldPixel, qualitySampling } from '../js/elevation.js';
test('map and aerial atlas bounds match every DEM quality across Japan with at most sixteen tiles',()=>{
  for(const location of [{latitude:33.767,longitude:133.115,zoom:12},{latitude:33.2035,longitude:132.1812,zoom:9},{latitude:43.6636,longitude:142.8541,zoom:6},{latitude:35.3606,longitude:138.7274,zoom:14}]) {
    for(const surface of ['map','photo']) {
    const p=texturePlan(location,surface),[x,y]=worldPixel(location.latitude,location.longitude,location.zoom);
    assert.ok(p.tiles.length<=16);assert.ok(p.zoom<=14);
    for(const quality of ['standard','high','ultra']) {
      const s=qualitySampling(location.zoom,quality), ratio=2**(p.zoom-s.sourceZoom);
      assert.equal((Math.floor(x)*s.scale-192*s.scale)*ratio,p.left);
      assert.equal((Math.floor(y)*s.scale-192*s.scale)*ratio,p.top);
      assert.equal((s.size-1)*s.step*ratio,p.span);
    }
    assert.equal(textureKey(location,surface),textureKey({...location},surface));
    const covered=new Set(p.tiles.map(t=>`${t.x}/${t.y}`));
    for(const u of [0,.2,.5,.9,.999999])for(const v of [0,.2,.5,.9,.999999])assert.ok(covered.has(`${Math.floor((p.left+u*p.span)/256)}/${Math.floor((p.top+v*p.span)/256)}`));
    }
  }
});

test('atlas acquisition bounds concurrency, composes tiles and closes decoded images',async()=>{
  const {loadMapTexture}=await import('../js/texture.js');
  const old={fetch:globalThis.fetch,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
  let active=0,peak=0,closed=0;const drawn=[];
  globalThis.document={createElement:()=>({getContext:()=>({drawImage:(...args)=>drawn.push(args.slice(1))})})};
  globalThis.createImageBitmap=async()=>({width:256,height:256,close(){closed++;}});
  globalThis.fetch=async()=>{peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,2));active--;return {ok:true,blob:async()=>({})};};
  try {
    const location={latitude:33.767,longitude:133.115,zoom:12},p=texturePlan(location);
    const c=await loadMapTexture(location,new AbortController().signal);
    assert.equal(c.width,1024);assert.equal(c.height,1024);assert.ok(peak<=4);
    assert.equal(closed,p.tiles.length);assert.equal(drawn.length,closed);
    const expected=[(p.tiles[0].x*256-p.left)*1024/p.span,(p.tiles[0].y*256-p.top)*1024/p.span,256*1024/p.span,256*1024/p.span];
    drawn[0].forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-9));
    globalThis.fetch=async()=>({ok:false,status:404});
    await assert.rejects(loadMapTexture(location,new AbortController().signal),/HTTP 404/);
    const controller=new AbortController();controller.abort();
    await assert.rejects(loadMapTexture(location,controller.signal),{name:'AbortError'});
  } finally {Object.assign(globalThis,old);}
});

test('aerial photo uses JPEG provider over identical bounds with a distinct cache key',()=>{
  const location={latitude:33.767,longitude:133.115,zoom:12};
  const map=texturePlan(location),photo=texturePlan(location,'photo');
  assert.deepEqual({...map,tiles:[]},{...photo,tiles:[]});
  assert.equal(map.tiles.length,photo.tiles.length);
  assert.ok(photo.tiles.every(t=>t.url.includes('/seamlessphoto/')&&t.url.endsWith('.jpg')));
  assert.notEqual(textureKey(location),textureKey(location,'photo'));
  assert.throws(()=>texturePlan(location,'unknown'));
});

test('geology uses GSJ seamless geology tiles over the same terrain footprint',()=>{
  const location={latitude:33.767,longitude:133.115,zoom:12};
  const geology=texturePlan(location,'geology'),map=texturePlan(location,'map');
  assert.deepEqual({...geology,tiles:[]},{...map,tiles:[]});
  assert.equal(geology.tiles.length,map.tiles.length);
  assert.ok(geology.tiles.every(t=>t.url.startsWith('https://gbank.gsj.jp/seamless/v2/api/1.3.1/tiles/13/')&&t.url.endsWith('.png?type=original')));
  const z13=texturePlan({...location,zoom:14},'geology');
  assert.equal(z13.zoom,13);
  assert.ok(z13.tiles.every(t=>/^https:\/\/gbank\.gsj\.jp\/seamless\/v2\/api\/1\.3\.1\/tiles\/13\/\d+\/\d+\.png\?type=original$/.test(t.url)));
  assert.notEqual(textureKey(location,'geology'),textureKey(location,'map'));
  assert.throws(()=>texturePlan(location,'unknown'));
});
