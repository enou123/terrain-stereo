const API='https://gbank.gsj.jp/seamless/v2/api/1.3.1/legend.json';
const cache=new Map();
export async function fetchGeologyLegend(location,extentKm,signal){
  const halfKm=Math.max(0.1,extentKm/2),latDelta=halfKm/111.32,cos=Math.max(0.1,Math.cos(location.latitude*Math.PI/180)),lonDelta=halfKm/(111.32*cos);
  const box=[location.latitude-latDelta,location.longitude-lonDelta,location.latitude+latDelta,location.longitude+lonDelta].map(value=>value.toFixed(5)).join(',');
  const url=`${API}?box=${encodeURIComponent(box)}&z=13&type=original`;
  if(cache.has(url)) return cache.get(url).map(item=>({...item}));
  const response=await fetch(url,{signal});
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  const data=await response.json();
  if(!Array.isArray(data)) throw new Error('凡例データの形式が不正です。');
  const entries=data.filter(item=>item&&/^[0-9a-f]{6}$/i.test(item.value||'')).map(item=>({
    value:item.value.toLowerCase(),title:String(item.title||''),group_ja:String(item.group_ja||''),
    formationAge_ja:String(item.formationAge_ja||''),lithology_ja:String(item.lithology_ja||'')
  }));
  if(cache.size>=24) cache.delete(cache.keys().next().value);
  cache.set(url,entries);
  return entries.map(item=>({...item}));
}
