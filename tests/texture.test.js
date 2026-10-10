import test from 'node:test';
import assert from 'node:assert/strict';
import { texturePlan, textureKey, textureResolution } from '../js/texture.js';
import { worldPixel, qualitySampling } from '../js/elevation.js';
test('map and aerial atlas bounds match the terrain footprint across Japan',()=>{
  for(const location of [{latitude:33.767,longitude:133.115,zoom:12},{latitude:33.2035,longitude:132.1812,zoom:9},{latitude:43.6636,longitude:142.8541,zoom:6},{latitude:35.3606,longitude:138.7274,zoom:14}]) {
    for(const surface of ['map','photo'])for(const quality of ['standard','high','ultra']) {
      const p=texturePlan(location,surface,quality),[x,y]=worldPixel(location.latitude,location.longitude,location.zoom);
      assert.ok(p.tiles.length<=64);assert.ok(p.zoom<=17);
      if(surface==='map')assert.equal(p.size,1024);
      const s=qualitySampling(location.zoom,quality), ratio=2**(p.zoom-s.sourceZoom);
      assert.equal((Math.floor(x)*s.scale-192*s.scale)*ratio,p.left);
      assert.equal((Math.floor(y)*s.scale-192*s.scale)*ratio,p.top);
      assert.equal((s.size-1)*s.step*ratio,p.span);
      assert.equal(textureKey(location,surface,quality),textureKey({...location},surface,quality));
      const covered=new Set(p.tiles.map(t=>`${t.x}/${t.y}`));
      for(const u of [0,.2,.5,.9,.999999])for(const v of [0,.2,.5,.9,.999999])assert.ok(covered.has(`${Math.floor((p.left+u*p.span)/256)}/${Math.floor((p.top+v*p.span)/256)}`));
    }
  }
});

test('aerial resolution follows quality and respects device texture limits',()=>{
  assert.deepEqual(['standard','high','ultra'].map(q=>textureResolution('photo',q,8192)),[1024,2048,4096]);
  assert.equal(textureResolution('photo','ultra',2048),2048);
  assert.equal(textureResolution('map','ultra',4096),1024);
  const location={latitude:33.767,longitude:133.115,zoom:12};
  const plans=['standard','high','ultra'].map(q=>texturePlan(location,'photo',q));
  assert.deepEqual(plans.map(p=>p.size),[1024,2048,2048]);
  assert.deepEqual(plans.map(p=>p.zoom),[13,14,14]);
  assert.ok(plans.every(p=>p.tiles.length<=64));
  assert.notEqual(textureKey(location,'photo','standard'),textureKey(location,'photo','high'));
  assert.equal(textureKey(location,'photo','high'),textureKey(location,'photo','ultra'));
  const closeUltra=texturePlan({...location,zoom:14},'photo','ultra');
  assert.equal(closeUltra.size,4096);assert.ok(closeUltra.tiles.length<=64);
  assert.equal(textureKey(location,'map','standard'),textureKey(location,'map','ultra'));
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
  for(const key of ['zoom','left','top','span','size'])assert.equal(map[key],photo[key]);
  assert.equal(map.tiles.length,photo.tiles.length);
  assert.ok(photo.tiles.every(t=>t.url.includes('/seamlessphoto/')&&t.url.endsWith('.jpg')));
  assert.notEqual(textureKey(location),textureKey(location,'photo'));
  assert.throws(()=>texturePlan(location,'unknown'));
});

test('missing high zoom photo tile is cropped from its lower zoom parent and measured',async()=>{
  const {loadMapTexture}=await import('../js/texture.js');
  const old={fetch:globalThis.fetch,document:globalThis.document,createImageBitmap:globalThis.createImageBitmap};
  const drawn=[],closed=[];let calls=0,failed=false;
  globalThis.document={createElement:()=>({getContext:()=>({drawImage:(...args)=>drawn.push(args)})})};
  globalThis.createImageBitmap=async blob=>({width:256,height:256,id:blob.id,close(){closed.push(this.id)}});
  globalThis.fetch=async url=>{
    calls++;const z=Number(url.match(/\/(\d+)\/\d+\/\d+\.jpg/)[1]);
    if(!failed&&z===14){failed=true;return {ok:false,status:404};}
    return {ok:true,blob:async()=>({id:url})};
  };
  try{
    const location={latitude:33.767,longitude:133.115,zoom:12},canvas=await loadMapTexture(location,new AbortController().signal,'photo','high',4096);
    assert.equal(canvas.width,2048);assert.equal(canvas.height,2048);
    assert.equal(canvas.textureStats.zoom,14);assert.equal(canvas.textureStats.width,2048);
    assert.equal(canvas.textureStats.lowResolutionTileCount,1);assert.equal(canvas.textureStats.tileCount,calls);
    assert.ok(canvas.textureStats.elapsedMs>=0);assert.ok(closed.length>0);
    assert.ok(drawn.some(args=>args.length===9),'fallback must crop the parent tile to the correct child quadrant');
  }finally{Object.assign(globalThis,old);}
});

test('geology uses GSJ seamless geology tiles over the same terrain footprint',()=>{
  const location={latitude:33.767,longitude:133.115,zoom:12};
  const geology=texturePlan(location,'geology'),map=texturePlan(location,'map');
  for(const key of ['zoom','left','top','span','size'])assert.equal(geology[key],map[key]);
  assert.equal(geology.tiles.length,map.tiles.length);
  assert.ok(geology.tiles.every(t=>t.url.startsWith('https://gbank.gsj.jp/seamless/v2/api/1.3.1/tiles/13/')&&t.url.endsWith('.png?type=original')));
  const z13=texturePlan({...location,zoom:14},'geology');
  assert.equal(z13.zoom,13);
  assert.ok(z13.tiles.every(t=>/^https:\/\/gbank\.gsj\.jp\/seamless\/v2\/api\/1\.3\.1\/tiles\/13\/\d+\/\d+\.png\?type=original$/.test(t.url)));
  assert.notEqual(textureKey(location,'geology'),textureKey(location,'map'));
  assert.throws(()=>texturePlan(location,'unknown'));
});
