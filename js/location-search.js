import { LANDMARKS } from './landmarks.js?v=0.45.0';
import { MAP_LOCATION_BOUNDS } from './map.js?v=0.45.0';
import { NATURAL_PLACES } from './natural-places.js?v=0.45.0';

export const SEARCH_BOUNDS = MAP_LOCATION_BOUNDS;
const shortHosts = new Set(['maps.app.goo.gl','goo.gl']);
const googleHosts = new Set(['google.com','www.google.com','maps.google.com','google.co.jp','www.google.co.jp','maps.google.co.jp']);

function numbersPair(value) {
  const match=String(value).trim().match(/^\s*([+-]?\d+(?:\.\d+)?)\s*(?:°?\s*[NS])?\s*[,，;\s]+\s*([+-]?\d+(?:\.\d+)?)\s*(?:°?\s*[EW])?\s*$/i);
  if(!match)return null;
  return {latitude:Number(match[1]),longitude:Number(match[2])};
}

export function validateSearchCoordinate(point) {
  if(!point||!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude))return {ok:false,reason:'座標を読み取れません。緯度, 経度の順で入力してください。'};
  if(Math.abs(point.latitude)>90&&Math.abs(point.longitude)<=90)return {ok:false,reason:'緯度, 経度の順で入力してください。最初の値が緯度です。'};
  if(Math.abs(point.latitude)>90||Math.abs(point.longitude)>180)return {ok:false,reason:'緯度は−90〜90、経度は−180〜180の範囲で入力してください。'};
  if(point.latitude<SEARCH_BOUNDS.south||point.latitude>SEARCH_BOUNDS.north||point.longitude<SEARCH_BOUNDS.west||point.longitude>SEARCH_BOUNDS.east)
    return {ok:false,reason:'現在の地形探訪では対応していない地域です（緯度20〜46°、経度122〜154°）。'};
  return {ok:true,point:{latitude:point.latitude,longitude:point.longitude}};
}

function decodeMaybe(value){try{return decodeURIComponent(value.replace(/\+/g,' '))}catch{return value}}
function trimUrl(value){return value.replace(/[)、。，,;]+$/,'')}

// Coordinates attached to a selected Google Maps place pin are stronger than
// the map viewport in /@lat,lon. Never resolve a URL by fetching it.
export function parseGoogleMapsInput(raw) {
  const text=String(raw||'');
  const found=text.match(/https?:\/\/[^\s<>"'）)]+/i);
  if(!found)return null;
  const rawUrl=trimUrl(found[0]);let url;
  try{url=new URL(rawUrl)}catch{return {kind:'invalid',message:'URLを読み取れませんでした。'}}
  const host=url.hostname.toLowerCase();
  if(shortHosts.has(host))return {kind:'short',message:'Googleマップの短縮URLはブラウザから展開できません。Googleマップで地点を開き、共有メニューから緯度・経度をコピーして貼り付けてください。'};
  if(!googleHosts.has(host)||!/^\/maps(?:\/|$)/i.test(url.pathname))return {kind:'invalid',message:'GoogleマップのURLとして認識できません。緯度・経度を貼り付ける方法も使えます。'};
  const selected=matchSelectedPin(url.href);
  if(selected)return {kind:'coordinate',point:selected,source:'Googleマップの選択地点座標'};
  for(const key of ['query','q','ll','center']){
    const value=url.searchParams.get(key);
    if(!value)continue;
    const decoded=decodeMaybe(value),point=numbersPair(decoded)||numbersPair(decoded.replace(/^loc:/i,''));
    if(point)return {kind:'coordinate',point,source:'GoogleマップURLの座標'};
    if(['query','q'].includes(key)&&decoded.trim())return {kind:'place',query:decoded.trim(),source:'GoogleマップURLの検索語'};
  }
  const pathMatch=url.pathname.match(/\/maps\/(?:search|place)\/([^/]+)/i);
  if(pathMatch){const query=decodeMaybe(pathMatch[1].replace(/\+/g,' ')).trim();if(query)return {kind:'place',query,source:'GoogleマップURLの地点名'};}
  const viewport=matchViewport(url.href);
  if(viewport)return {kind:'coordinate',point:viewport,source:'GoogleマップURLの表示中心'};
  return {kind:'unknown',message:'URLに地点の座標や検索語が見つかりませんでした。Googleマップで地点を開き、座標をコピーして貼り付けてください。'};
}

function matchSelectedPin(href){
  let match=href.match(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/);
  if(match)return {latitude:Number(match[1]),longitude:Number(match[2])};
  match=href.match(/!4d([+-]?\d+(?:\.\d+)?)!3d([+-]?\d+(?:\.\d+)?)/);
  if(match)return {latitude:Number(match[2]),longitude:Number(match[1])};
  match=href.match(/!2d([+-]?\d+(?:\.\d+)?)!3d([+-]?\d+(?:\.\d+)?)/);
  if(match)return {latitude:Number(match[2]),longitude:Number(match[1])};
  match=href.match(/!3d([+-]?\d+(?:\.\d+)?)!2d([+-]?\d+(?:\.\d+)?)/);
  if(match)return {latitude:Number(match[1]),longitude:Number(match[2])};
  return null;
}
function matchViewport(href){const match=href.match(/@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)(?:,|\/|$)/);return match?{latitude:Number(match[1]),longitude:Number(match[2])}:null;}

export function parseLocationInput(raw) {
  const text=String(raw||'').trim();if(!text)return {kind:'empty'};
  const link=parseGoogleMapsInput(text);
  if(link)return link;
  const point=numbersPair(text);
  if(point)return {kind:'coordinate',point,source:'入力した座標'};
  // Google Maps often copies a place label together with a coordinate pair.
  const embedded=text.match(/(?:^|[^\d])([+-]?\d{1,2}(?:\.\d+)?)\s*[,，]\s*([+-]?\d{1,3}(?:\.\d+)?)(?=$|[^\d])/);
  if(embedded)return {kind:'coordinate',point:{latitude:Number(embedded[1]),longitude:Number(embedded[2])},source:'貼り付けた座標'};
  return {kind:'place',query:text,source:'入力した地名'};
}

export const normalizeSearchName=text=>[...String(text||'').normalize('NFKC').toLocaleLowerCase('ja')]
  .map(char=>char>='ァ'&&char<='ヶ'?String.fromCharCode(char.charCodeAt(0)-0x60):char)
  .join('').replace(/[・･\s　]/g,'');
const normalize=normalizeSearchName;
const ALIASES=Object.freeze({
  富士山:['fuji'],あそさん:['aso'],
  いしづちさん:['ishizuchi'],いしづち:['ishizuchi'],あおがしま:['aogashima'],
  にしのしま:['sea-nishinoshima'],'西之島':['sea-nishinoshima'],
});
export function catalogMatches(query){
  const key=normalize(query);if(!key)return [];
  const ids=ALIASES[key];
  const found=ids?LANDMARKS.filter(place=>ids.includes(place.id)):LANDMARKS.filter(place=>normalize(place.name)===key);
  return found.slice(0,8).map(place=>({name:place.name,detail:`${place.prefecture} · ${place.region} · 名所ガイド登録地`,point:{...place.center},mapZoom:place.settings.terrain.zoom-1,source:'名所ガイド登録地',sourceUrl:place.references?.[0]?.url||`https://maps.gsi.go.jp/#${place.settings.terrain.zoom-1}/${place.center.latitude}/${place.center.longitude}/`,id:place.id}));
}

export function naturalPlaceMatches(query){
  const key=normalize(query);if(!key)return [];
  return NATURAL_PLACES.filter(place=>[place.name,...place.aliases].some(name=>normalize(name)===key))
    .map(place=>({name:place.name,detail:`${place.prefecture}・${place.municipality} · ${place.type} · ${place.detail} · 出典: ${place.source}`,point:{...place.point},mapZoom:place.mapZoom,source:place.source,sourceUrl:place.sourceUrl,placeType:place.type}));
}

function addressMatchScore(query,address){
  const wanted=normalize(query).replaceAll('の',''),parts=String(address||'').split(/[\/／,、]/).map(normalize).filter(Boolean);
  if(!wanted||!parts.length)return 0;
  if(parts.includes(wanted))return 1;
  // Accept a query spanning complete address components (e.g. prefecture+city),
  // but never a short fragment embedded in a longer place name.
  for(let start=0;start<parts.length;start++){
    let joined='';
    for(let end=start;end<parts.length;end++){
      joined+=parts[end];
      if(joined===wanted)return .98;
    }
  }
  if(wanted.length>=4){
    const hierarchy=parts.join('');
    if(hierarchy.startsWith(wanted))return .82;
  }
  return 0;
}

const resultCache=new Map();
export async function searchCSIS(query,{signal,fetchImpl=fetch}={}){
  const q=String(query||'').trim();if(!q)throw new Error('地名・住所を入力してください。');
  const key=normalize(q);if(resultCache.has(key))return resultCache.get(key).map(item=>({...item}));
  const url=new URL('https://geocode.csis.u-tokyo.ac.jp/cgi-bin/simple_geocode.cgi');url.searchParams.set('addr',q);url.searchParams.set('charset','UTF8');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  try{
    const response=await fetchImpl(url,{signal:controller.signal,mode:'cors',credentials:'omit'});
    if(!response.ok)throw new Error('検索サービスから応答がありません。');
    const xml=new DOMParser().parseFromString(await response.text(),'application/xml');
    if(xml.querySelector('parsererror'))throw new Error('検索結果を読み取れませんでした。');
    const items=[...xml.querySelectorAll('candidate')].map(candidate=>{
      const number=tag=>Number(candidate.querySelector(tag)?.textContent);
      const point={latitude:number('latitude'),longitude:number('longitude')};
      if(!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude))return null;
      const address=candidate.querySelector('address')?.textContent?.trim()||'';
      const matchScore=addressMatchScore(q,address);
      if(!matchScore)return null;
      return {name:address.replaceAll('/',' '),detail:`住所検索 · ${address.replaceAll('/',' ')} · CSISシンプルジオコーディング実験`,point,source:'CSISシンプルジオコーディング実験',matchScore};
    }).filter(Boolean).sort((a,b)=>b.matchScore-a.matchScore).slice(0,8);
    resultCache.set(key,items.map(item=>({...item})));if(resultCache.size>24)resultCache.delete(resultCache.keys().next().value);
    return items;
  }catch(error){
    if(error.name==='AbortError')throw new Error(signal?.aborted?'検索を中止しました。':'通信に失敗しました。もう一度お試しください。');
    if(error instanceof TypeError)throw new Error('検索サービスに接続できませんでした。通信状態を確認して、もう一度お試しください。');
    throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
