import { worldPixel, MIN_TERRAIN_ZOOM, MAX_TERRAIN_ZOOM, terrainExtent } from './elevation.js?v=0.31.0';
import { pixelLocation } from './map.js?v=0.31.0';

// Mesh fitting scales all axes uniformly; convert the orbit target back into
// geographic pixels rather than treating screen pixels as north/east movement.
export function movedRange(data,mesh,base,pose){
  let min=Infinity,max=-Infinity;
  for(let i=0;i<mesh.positions.length;i+=3){min=Math.min(min,mesh.positions[i]);max=Math.max(max,mesh.positions[i]);}
  const span=max-min;
  if(!(span>0))throw new Error('地形の表示範囲を計算できません。');
  const dx=pose.target[0]-base.target[0],dz=pose.target[2]-base.target[2];
  const [x,y]=worldPixel(data.location.latitude,data.location.longitude,data.location.zoom);
  const center=pixelLocation(x+dx/span*384,y+dz/span*384,data.location.zoom);
  if(center.latitude<20||center.latitude>46||center.longitude<122||center.longitude>154)throw new Error('移動先が対応範囲（日本周辺）の外です。');
  return {latitude:center.latitude,longitude:center.longitude,zoom:data.location.zoom};
}
export function scaledRange(location,base,pose){
  const wanted=location.zoom+Math.log2(base.distance/pose.distance);
  const zoom=Math.max(MIN_TERRAIN_ZOOM,Math.min(MAX_TERRAIN_ZOOM,Math.round(wanted)));
  return {...location,zoom};
}
export const rangeKilometres=location=>terrainExtent(location.latitude,location.zoom);
