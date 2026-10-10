import { worldPixel } from './elevation.js?v=0.34.0';

const sources = {
  map:{url:'https://cyberjapandata.gsi.go.jp/xyz/std',extension:'png',label:'地図画像'},
  photo:{url:'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto',extension:'jpg',label:'航空写真',maxZoom:17},
  geology:{url:'https://gbank.gsj.jp/seamless/v2/api/1.3.1/tiles',extension:'png',label:'地質図',yBeforeX:true,maxZoom:13,query:'?type=original'}
};
function sourceFor(surface) {
  const source=sources[surface];
  if(!source) throw new Error('対応していない画像の種類です。');
  return source;
}

// Keep map and geology at their established size. Aerial imagery follows the
// selected terrain quality, within the WebGL/device-provided texture limit.
export function textureResolution(surface='map',quality='standard',maxTextureSize=4096) {
  if(surface!=='photo')return 1024;
  const requested={standard:1024,high:2048,ultra:4096}[quality];
  if(!requested)throw new Error('対応する画質を選んでください。');
  const supported=Math.max(1024,Math.floor(maxTextureSize/1024)*1024);
  return Math.min(requested,supported);
}

// Use the same 384×384 source-DEM-pixel footprint at every quality. For photo,
// each doubled atlas dimension gets one more source zoom, up to zoom 17.
export function texturePlan(location,surface='map',quality='standard',maxTextureSize=4096) {
  const source=sourceFor(surface),requestedSize=textureResolution(surface,quality,maxTextureSize);
  const standardZoom=Math.min(surface==='photo'?14:(source.maxZoom??14),location.zoom+1),[x,y]=worldPixel(location.latitude,location.longitude,location.zoom);
  function atSize(size){
    const zoom=surface==='photo'?Math.min(source.maxZoom,standardZoom+Math.log2(size/1024)):standardZoom;
    const scale=2**(zoom-location.zoom),left=(Math.floor(x)-192)*scale,top=(Math.floor(y)-192)*scale,span=384*scale,tiles=[];
    for(let ty=Math.floor(top/256);ty<Math.ceil((top+span)/256);ty++)for(let tx=Math.floor(left/256);tx<Math.ceil((left+span)/256);tx++){
      const coordinates=source.yBeforeX?`${zoom}/${ty}/${tx}`:`${zoom}/${tx}/${ty}`;
      tiles.push({x:tx,y:ty,zoom,url:`${source.url}/${coordinates}.${source.extension}${source.query??''}`});
    }
    return {zoom,left,top,span,tiles,size,quality,surface,requestedSize};
  }
  let plan=atSize(requestedSize);
  // Keep full-area fetches and memory bounded on very wide terrain extents.
  while(surface==='photo'&&plan.size>2048&&plan.tiles.length>64)plan=atSize(plan.size/2);
  plan.effectiveQuality=plan.size>=4096?'ultra':plan.size>=2048?'high':'standard';
  return plan;
}
export function textureKey(location,surface='map',quality='standard',maxTextureSize=4096) {
  const p=texturePlan(location,surface,quality,maxTextureSize);
  return `${surface}/${p.size}/${p.zoom}/${p.left}/${p.top}/${p.span}`;
}

// Build one bounded atlas. Missing photo tiles (404) are filled from the
// matching parent tile; other network errors remain visible to the caller.
export async function loadMapTexture(location,signal,surface='map',quality='standard',maxTextureSize=4096) {
  const source=sourceFor(surface),plan=texturePlan(location,surface,quality,maxTextureSize),canvas=document.createElement('canvas');
  canvas.width=canvas.height=plan.size;
  const context=canvas.getContext('2d'),factor=plan.size/plan.span,start=performance.now();
  const pending=new Map(),bitmaps=new Set();let networkRequests=0,bytes=0,minSourceZoom=plan.zoom;
  async function getBitmap(z,x,y){
    signal.throwIfAborted();
    const key=`${z}/${x}/${y}`;
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      const coordinates=source.yBeforeX?`${z}/${y}/${x}`:`${z}/${x}/${y}`;
      networkRequests++;
      const response=await fetch(`${source.url}/${coordinates}.${source.extension}${source.query??''}`,{mode:'cors',signal});
      if(!response.ok){
        if(surface==='photo'&&response.status===404&&z>0)return getBitmap(z-1,Math.floor(x/2),Math.floor(y/2));
        throw new Error(`${source.label}を取得できませんでした（HTTP ${response.status}）。`);
      }
      const blob=await response.blob();bytes+=blob.size;
      const bitmap=await createImageBitmap(blob);
      if(bitmap.width!==256||bitmap.height!==256){bitmap.close();throw new Error(`${source.label}のサイズが不正です。`);}
      bitmaps.add(bitmap);return {bitmap,zoom:z,x,y};
    })();
    pending.set(key,task);return task;
  }
  let next=0,lowResolutionTileCount=0;
  async function worker(){
    while(next<plan.tiles.length){
      signal.throwIfAborted();const tile=plan.tiles[next++],resolved=await getBitmap(plan.zoom,tile.x,tile.y);
      if(resolved.zoom<plan.zoom)lowResolutionTileCount++;
      minSourceZoom=Math.min(minSourceZoom,resolved.zoom);
      const dx=(tile.x*256-plan.left)*factor,dy=(tile.y*256-plan.top)*factor,dsize=256*factor;
      if(resolved.zoom===plan.zoom)context.drawImage(resolved.bitmap,dx,dy,dsize,dsize);
      else {
        const ratio=2**(plan.zoom-resolved.zoom),sx=(tile.x-resolved.x*ratio)*256/ratio,sy=(tile.y-resolved.y*ratio)*256/ratio,sourceSize=256/ratio;
        context.drawImage(resolved.bitmap,sx,sy,sourceSize,sourceSize,dx,dy,dsize,dsize);
      }
    }
  }
  try {
    const results=await Promise.allSettled(Array.from({length:Math.min(surface==='photo'?8:4,plan.tiles.length)},worker));
    const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
    if(surface==='geology'){
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let available=false;
      for(let i=3;i<pixels.length;i+=4)if(pixels[i]){available=true;break;}
      if(!available)throw new Error('この範囲には地質図データがありません。標高の色で地形を表示します。');
    }
    canvas.textureStats={surface,quality,requestedQuality:quality,effectiveQuality:plan.effectiveQuality,zoom:plan.zoom,minSourceZoom,tileCount:networkRequests,atlasTileCount:plan.tiles.length,lowResolutionTileCount,width:plan.size,height:plan.size,bytes,elapsedMs:Math.round(performance.now()-start)};
    return canvas;
  } finally {for(const bitmap of bitmaps)bitmap.close();}
}
