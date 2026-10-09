import { worldPixel } from './elevation.js?v=0.26.7';
import { pixelLocation } from './map.js?v=0.26.7';
const API='https://gbank.gsj.jp/seamless/v2/api/1.3.1/legend.json';
const cache=new Map();
export async function fetchGeologyLegend(location,extentKm,signal){
  const halfKm=Math.max(0.1,extentKm/2),latDelta=halfKm/111.32,cos=Math.max(0.1,Math.cos(location.latitude*Math.PI/180)),lonDelta=halfKm/(111.32*cos);
  const box=[location.latitude-latDelta,location.longitude-lonDelta,location.latitude+latDelta,location.longitude+lonDelta].map(value=>value.toFixed(5)).join(',');
  const url=`${API}?box=${encodeURIComponent(box)}&z=${Math.min(13,location.zoom+1)}&type=original`;
  if(cache.has(url)) return cache.get(url).map(item=>({...item}));
  const response=await fetch(url,{signal});
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  const data=await response.json();
  if(!Array.isArray(data)) throw new Error('凡例データの形式が不正です。');
  const entries=data.filter(item=>item&&/^[0-9a-f]{6}$/i.test(item.value||'')).map(item=>({
    symbol:String(item.symbol||''),value:item.value.toLowerCase(),title:String(item.title||''),group_ja:String(item.group_ja||''),
    formationAge_ja:String(item.formationAge_ja||''),lithology_ja:String(item.lithology_ja||'')
  }));
  if(cache.size>=24) cache.delete(cache.keys().next().value);
  cache.set(url,entries);
  return entries.map(item=>({...item}));
}

// Use the DEM's rounded pixel origin, matching every quality and the texture atlas.
export function geologyPointLocation(location,hit){
  const [x,y]=worldPixel(location.latitude,location.longitude,location.zoom);
  return pixelLocation(Math.floor(x)-192+hit.u*384,Math.floor(y)-192+hit.v*384,location.zoom);
}
export async function fetchGeologyPoint(location,hit,signal){
  const point=geologyPointLocation(location,hit);
  const z=Math.min(13,location.zoom+1);
  const response=await fetch(`${API}?point=${point.latitude.toFixed(7)},${point.longitude.toFixed(7)}&z=${z}&type=original`,{signal});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const entry=await response.json();
  if(!entry || !/^[0-9a-f]{6}$/i.test(entry.value||''))return null;
  return {...entry,value:entry.value.toLowerCase()};
}
