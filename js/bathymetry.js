import { worldPixel } from './elevation.js?v=0.35.0';

// Numeric regional snapshots served from Pages. No external bathymetry request
// and no grid fetch at all until the user enables this feature.
const REGIONS = [{id:'aogashima', west:139.2,east:140.3,south:32.0,north:32.9,
  manifest:new URL('../data/bathymetry/aogashima-gmrt-4.5.0.json',import.meta.url)}];
const cache=new Map();
export function pixelCoordinate(x,y,zoom){
  const scale=256*2**zoom;
  return {longitude:x/scale*360-180,latitude:Math.atan(Math.sinh(Math.PI*(1-2*y/scale)))*180/Math.PI};
}
export function bathymetryRegion(location){
  const [x,y]=worldPixel(location.latitude,location.longitude,location.zoom);
  const nw=pixelCoordinate(Math.floor(x)-192,Math.floor(y)-192,location.zoom);
  const se=pixelCoordinate(Math.floor(x)+192,Math.floor(y)+192,location.zoom);
  return REGIONS.find(r=>nw.longitude>=r.west&&se.longitude<=r.east&&nw.latitude<=r.north&&se.latitude>=r.south)||null;
}
export function decodeBathymetry(metadata,buffer){
  const n=metadata.width*metadata.height;
  if(metadata.format!=='gmrt-int16-mask-v1'||!Number.isInteger(n)||n<4||n>1000000||metadata.width<2||metadata.height<2||metadata.dx<=0||metadata.dy>=0||buffer.byteLength!==n*2+Math.ceil(n/8))throw new Error('海底データの形式が不正です。');
  const values=new Int16Array(n),view=new DataView(buffer);
  for(let i=0;i<n;i++)values[i]=view.getInt16(i*2,true);
  return {metadata,values,coverage:new Uint8Array(buffer,n*2).slice()};
}
export async function loadBathymetry(location,signal){
  const region=bathymetryRegion(location);
  if(!region)throw new Error('海底データは現在、青ヶ島周辺（東経139.2〜140.3度・北緯32.0〜32.9度）の範囲内に対応しています。表示範囲全体を対応域に収めてください。');
  const start=performance.now();
  if(cache.has(region.id))return {...cache.get(region.id),stats:{cached:true,bytes:0,requests:0,elapsedMs:performance.now()-start}};
  const response=await fetch(region.manifest,{signal});
  if(!response.ok)throw new Error(`海底データの情報を取得できませんでした（HTTP ${response.status}）。`);
  const text=await response.text();if(text.length>16384)throw new Error('海底データの情報が大きすぎます。');
  const metadata=JSON.parse(text);
  if(metadata.bytes>2000000||!/^[a-z0-9.-]+\.bin$/.test(metadata.file))throw new Error('海底データのサイズまたはパスが不正です。');
  const binary=await fetch(new URL(metadata.file,region.manifest),{signal});
  if(!binary.ok)throw new Error(`海底データを取得できませんでした（HTTP ${binary.status}）。`);
  const buffer=await binary.arrayBuffer();
  if(buffer.byteLength!==metadata.bytes)throw new Error('海底データのサイズが一致しません。');
  const digest=await crypto.subtle.digest('SHA-256',buffer);
  const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==metadata.sha256)throw new Error('海底データの検証に失敗しました。');
  signal?.throwIfAborted();
  const grid=decodeBathymetry(metadata,buffer);cache.clear();cache.set(region.id,grid);
  return {...grid,stats:{cached:false,bytes:buffer.byteLength+new TextEncoder().encode(text).length,requests:2,elapsedMs:performance.now()-start}};
}
export function sampleBathymetry(grid,latitude,longitude){
  const m=grid.metadata,x=(longitude-m.lon0)/m.dx,y=(latitude-m.lat0)/m.dy;
  if(x<0||y<0||x>m.width-1||y>m.height-1)return {height:NaN,contribution:false};
  const c=Math.min(m.width-2,Math.floor(x)),r=Math.min(m.height-2,Math.floor(y)),a=x-c,b=y-r;
  const ids=[r*m.width+c,r*m.width+c+1,(r+1)*m.width+c,(r+1)*m.width+c+1];
  // Preserve real no-data holes. Positive GMRT topography is not classified as sea.
  if(ids.some(i=>grid.values[i]===m.nodata))return {height:NaN,contribution:false};
  const w=[(1-a)*(1-b),a*(1-b),(1-a)*b,a*b];
  return {height:ids.reduce((v,i,k)=>v+grid.values[i]*w[k],0),contribution:ids.every(i=>(grid.coverage[i>>3]>>(i%8))&1)};
}
export function mergeBathymetry(land,grid){
  const heights=land.heights.slice(),seaMask=new Float32Array(heights.length);
  const [cx,cy]=worldPixel(land.location.latitude,land.location.longitude,land.location.zoom);
  const step=384/(land.size-1);let seaCount=0,supplementLandCount=0,contributionCount=0,seaMin=Infinity,seaMax=-Infinity,min=land.min,max=land.max;
  for(let r=0;r<land.size;r++)for(let c=0;c<land.size;c++){
    const i=r*land.size+c;if(Number.isFinite(heights[i]))continue;
    const coordinate=pixelCoordinate(Math.floor(cx)-192+c*step,Math.floor(cy)-192+r*step,land.location.zoom);
    const sample=sampleBathymetry(grid,coordinate.latitude,coordinate.longitude);
    if(!Number.isFinite(sample.height))continue;
    heights[i]=sample.height;
    if(sample.height<0){seaMask[i]=1;seaCount++;seaMin=Math.min(seaMin,sample.height);seaMax=Math.max(seaMax,sample.height);if(sample.contribution)contributionCount++;}
    else supplementLandCount++;
    min=Math.min(min,sample.height);max=Math.max(max,sample.height);
  }
  // Keep the original terrain's fitting baseline, so enabling sea does not move
  // existing land in the scene or change the camera. Only triangles that existed
  // before count towards the land baseline.
  let fitMin=Infinity,fitMax=-Infinity;
  for(let r=0;r<land.size-1;r++)for(let c=0;c<land.size-1;c++){
    const i=r*land.size+c;
    for(const ids of [[i,i+land.size,i+1],[i+1,i+land.size,i+land.size+1]])if(ids.every(j=>Number.isFinite(land.heights[j])))for(const j of ids){fitMin=Math.min(fitMin,land.heights[j]);fitMax=Math.max(fitMax,land.heights[j]);}
  }
  if(!Number.isFinite(fitMin))fitMin=fitMax=0;
  return {...land,heights,seaMask,min,max,landData:land,fitHeightRange:[fitMin,fitMax],bathymetry:{metadata:grid.metadata,stats:grid.stats,seaCount,supplementLandCount,contributionCount,seaMin,seaMax}};
}
