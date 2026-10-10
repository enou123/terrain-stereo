import { worldPixel } from './elevation.js?v=0.38.0';
import { BATHYMETRY_REGIONS } from './bathymetry-regions.js?v=0.38.0';

const REGION_CACHE_MAX_BYTES=8*1024*1024;
const REGION_CACHE_MAX_COUNT=8;
const REGION_MAX_PIXELS=900000;
const cache=new Map();
let cacheBytes=0;

export function pixelCoordinate(x,y,zoom){
  const scale=256*2**zoom;
  return {longitude:x/scale*360-180,latitude:Math.atan(Math.sinh(Math.PI*(1-2*y/scale)))*180/Math.PI};
}
export function viewBounds(location){
  const [x,y]=worldPixel(location.latitude,location.longitude,location.zoom);
  const nw=pixelCoordinate(Math.floor(x)-192,Math.floor(y)-192,location.zoom);
  const se=pixelCoordinate(Math.floor(x)+192,Math.floor(y)+192,location.zoom);
  return {west:nw.longitude,east:se.longitude,south:se.latitude,north:nw.latitude};
}
const contains=(region,b)=>b.west>=region.west&&b.east<=region.east&&b.south>=region.south&&b.north<=region.north;
const intersects=(region,b)=>b.east>region.west&&b.west<region.east&&b.north>region.south&&b.south<region.north;
const area=r=>(r.east-r.west)*(r.north-r.south);
export function bathymetryRegions(location){
  const box=viewBounds(location);
  const covering=BATHYMETRY_REGIONS.filter(r=>contains(r,box));
  if(covering.length)return [covering.sort((a,b)=>area(a)-area(b)||a.spacing-b.spacing)[0]];
  return BATHYMETRY_REGIONS.filter(r=>intersects(r,box))
    // The registry is deliberately bounded (currently 13 regions). Keep every
    // intersecting region for broad views so an arbitrary region-count cap
    // cannot leave an unrequested strip at the edge of the display.
    .sort((a,b)=>b.spacing-a.spacing||area(b)-area(a));
}
// Kept as the synchronous availability check used by the DEM loader.
export function bathymetryRegion(location){return bathymetryRegions(location)[0]||null;}

export function decodeBathymetry(metadata,buffer){
  const n=metadata.width*metadata.height;
  if(metadata.format!=='gmrt-int16-mask-v1'||!Number.isInteger(n)||n<4||n>REGION_MAX_PIXELS||metadata.width<2||metadata.height<2||metadata.dx<=0||metadata.dy>=0||buffer.byteLength!==n*2+Math.ceil(n/8))throw new Error('海底データの形式が不正です。');
  const values=new Int16Array(n),view=new DataView(buffer);
  for(let i=0;i<n;i++)values[i]=view.getInt16(i*2,true);
  return {metadata,values,coverage:new Uint8Array(buffer,n*2).slice()};
}

function cachedGrid(id){
  if(!cache.has(id))return null;
  const value=cache.get(id);cache.delete(id);cache.set(id,value);return value;
}
function cacheGrid(id,grid){
  const bytes=grid.metadata.bytes;
  if(bytes>REGION_CACHE_MAX_BYTES)return;
  if(cache.has(id)){cacheBytes-=cache.get(id).metadata.bytes;cache.delete(id);}
  cache.set(id,grid);cacheBytes+=bytes;
  while(cache.size>REGION_CACHE_MAX_COUNT||cacheBytes>REGION_CACHE_MAX_BYTES){
    const oldest=cache.keys().next().value;cacheBytes-=cache.get(oldest).metadata.bytes;cache.delete(oldest);
  }
}

async function loadRegion(region,signal){
  const cached=cachedGrid(region.id);if(cached)return {grid:cached,bytes:0,requests:0,cached:true};
  const manifestUrl=new URL(`../data/bathymetry/${region.manifest}`,import.meta.url);
  const response=await fetch(manifestUrl,{signal});
  if(!response.ok)throw new Error(`${region.id}の海底データ情報を取得できませんでした（HTTP ${response.status}）。`);
  const text=await response.text();if(text.length>16384)throw new Error('海底データの情報が大きすぎます。');
  const metadata=JSON.parse(text),n=metadata.width*metadata.height;
  if(metadata.id!==region.id||metadata.bytes>2_000_000||n>REGION_MAX_PIXELS||!/^[a-z0-9.-]+\.bin$/.test(metadata.file))throw new Error(`${region.id}のデータサイズまたは識別情報が不正です。`);
  const binary=await fetch(new URL(metadata.file,manifestUrl),{signal});
  if(!binary.ok)throw new Error(`${region.id}の海底数値データを取得できませんでした（HTTP ${binary.status}）。`);
  const buffer=await binary.arrayBuffer();
  if(buffer.byteLength!==metadata.bytes)throw new Error(`${region.id}のデータサイズが一致しません。`);
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==metadata.sha256)throw new Error(`${region.id}のデータ検証に失敗しました。`);
  if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
  const grid=decodeBathymetry(metadata,buffer);cacheGrid(region.id,grid);
  return {grid,bytes:buffer.byteLength+new TextEncoder().encode(text).length,requests:2,cached:false};
}

export async function loadBathymetry(location,signal){
  const regions=bathymetryRegions(location);
  if(!regions.length)throw new Error('この表示範囲の海底数値データはまだ登録されていません。');
  const start=performance.now(),loaded=[];
  for(const region of regions){
    const result=await loadRegion(region,signal);loaded.push(result);
  }
  const grids=loaded.map(x=>x.grid);
  const spacing=grid=>Math.max(...grid.metadata.actualSpacingMeters);
  grids.sort((a,b)=>spacing(a)-spacing(b));
  const depthScaleMax=Math.max(...grids.map(g=>g.metadata.depthScaleMax||2000));
  const bytes=loaded.reduce((n,x)=>n+x.bytes,0),requests=loaded.reduce((n,x)=>n+x.requests,0);
  return {
    grids,metadata:grids.length===1?grids[0].metadata:{id:grids.map(g=>g.metadata.id).join('+'),name:grids.map(g=>g.metadata.name).join('・'),actualSpacingMeters:grids.map(g=>g.metadata.actualSpacingMeters),depthScaleMax},depthScaleMax,
    stats:{bytes,requests,cached:requests===0,regions:grids.map(g=>g.metadata.id),elapsedMs:performance.now()-start},
  };
}

function sampleOne(grid,latitude,longitude){
  const m=grid.metadata,x=(longitude-m.lon0)/m.dx,y=(latitude-m.lat0)/m.dy;
  if(x<0||y<0||x>m.width-1||y>m.height-1)return null;
  const c=Math.min(m.width-2,Math.floor(x)),r=Math.min(m.height-2,Math.floor(y)),a=x-c,b=y-r;
  const ids=[r*m.width+c,r*m.width+c+1,(r+1)*m.width+c,(r+1)*m.width+c+1];
  if(ids.some(i=>grid.values[i]===m.nodata))return null;
  const w=[(1-a)*(1-b),a*(1-b),(1-a)*b,a*b];
  const edgeCells=Math.min(x,y,m.width-1-x,m.height-1-y);
  return {height:ids.reduce((v,i,k)=>v+grid.values[i]*w[k],0),contribution:ids.every(i=>(grid.coverage[i>>3]>>(i%8))&1),edgeCells,metadata:m};
}
export function sampleBathymetry(source,latitude,longitude){
  const grids=(Array.isArray(source)?source:source?.grids||[source]).filter(Boolean);
  const samples=grids.map(sample=>sampleOne(sample,latitude,longitude)).filter(Boolean);
  if(!samples.length)return {height:NaN,contribution:false};
  samples.sort((a,b)=>Math.max(...a.metadata.actualSpacingMeters)-Math.max(...b.metadata.actualSpacingMeters));
  const fine=samples[0],coarse=samples.find(s=>s!==fine);
  if(!coarse)return fine;
  // The request tiles overlap. Blend the two grids only within the finest
  // raster's two-cell edge collar to soften resolution/source transitions.
  const weight=Math.max(0,Math.min(1,fine.edgeCells/2));
  if(weight>=1)return fine;
  return {...fine,height:coarse.height*(1-weight)+fine.height*weight,contribution:fine.contribution&&coarse.contribution};
}

export function mergeBathymetry(land,source){
  const grids=source?.grids||[source];
  const heights=land.heights.slice(),seaMask=new Float32Array(heights.length);
  const [cx,cy]=worldPixel(land.location.latitude,land.location.longitude,land.location.zoom);
  const step=384/(land.size-1);let seaCount=0,supplementLandCount=0,contributionCount=0,seaMin=Infinity,seaMax=-Infinity,min=land.min,max=land.max;
  for(let r=0;r<land.size;r++)for(let c=0;c<land.size;c++){
    const i=r*land.size+c;if(Number.isFinite(heights[i]))continue;
    const coordinate=pixelCoordinate(Math.floor(cx)-192+c*step,Math.floor(cy)-192+r*step,land.location.zoom);
    const sample=sampleBathymetry(grids,coordinate.latitude,coordinate.longitude);
    if(!Number.isFinite(sample.height))continue;
    heights[i]=sample.height;
    if(sample.height<0){seaMask[i]=1;seaCount++;seaMin=Math.min(seaMin,sample.height);seaMax=Math.max(seaMax,sample.height);if(sample.contribution)contributionCount++;}
    else supplementLandCount++;
    min=Math.min(min,sample.height);max=Math.max(max,sample.height);
  }
  let fitMin=Infinity,fitMax=-Infinity;
  for(let r=0;r<land.size-1;r++)for(let c=0;c<land.size-1;c++){
    const i=r*land.size+c;
    for(const ids of [[i,i+land.size,i+1],[i+1,i+land.size,i+land.size+1]])if(ids.every(j=>Number.isFinite(land.heights[j])))for(const j of ids){fitMin=Math.min(fitMin,land.heights[j]);fitMax=Math.max(fitMax,land.heights[j]);}
  }
  if(!Number.isFinite(fitMin))fitMin=fitMax=0;
  const depthScaleMax=Math.max(...grids.map(g=>g.metadata.depthScaleMax||2000));
  const regionSummaries=grids.map(g=>({id:g.metadata.id,name:g.metadata.name,spacing:g.metadata.actualSpacingMeters,contributionCount:g.metadata.highResolutionContributionCount||0}));
  return {...land,heights,seaMask,min,max,landData:land,fitHeightRange:[fitMin,fitMax],bathymetry:{metadata:source?.metadata||grids[0]?.metadata,grids:regionSummaries,depthScaleMax,stats:source?.stats||{},seaCount,supplementLandCount,contributionCount,seaMin,seaMax}};
}

export function clearBathymetryCache(){cache.clear();cacheBytes=0;}
export function bathymetryCacheStats(){return {entries:cache.size,bytes:cacheBytes,maxBytes:REGION_CACHE_MAX_BYTES,maxEntries:REGION_CACHE_MAX_COUNT};}
