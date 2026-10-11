import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocationInput, parseGoogleMapsInput, validateSearchCoordinate, catalogMatches, naturalPlaceMatches, searchCSIS } from '../js/location-search.js';

test('latitude-longitude input accepts varying decimal precision and rejects reversed/out-of-coverage coordinates',()=>{
  assert.deepEqual(parseLocationInput('35.3606, 138.7274'),{kind:'coordinate',point:{latitude:35.3606,longitude:138.7274},source:'入力した座標'});
  assert.equal(validateSearchCoordinate(parseLocationInput('35.3, 139').point).ok,true);
  assert.match(validateSearchCoordinate({latitude:138.7,longitude:35.3}).reason,/緯度, 経度の順/);
  assert.match(validateSearchCoordinate({latitude:48,longitude:135}).reason,/対応していない地域/);
  assert.match(validateSearchCoordinate({latitude:91,longitude:135}).reason,/緯度は/);
  assert.equal(parseLocationInput('???').kind,'place');
});

test('Google Maps URLs prefer selected feature coordinates over viewport coordinates',()=>{
  assert.deepEqual(parseGoogleMapsInput('https://www.google.com/maps/@35.2,138.4,10z'),{kind:'coordinate',point:{latitude:35.2,longitude:138.4},source:'GoogleマップURLの表示中心'});
  assert.deepEqual(parseGoogleMapsInput('https://www.google.com/maps/search/?api=1&query=35.3606%2C138.7274'),{kind:'coordinate',point:{latitude:35.3606,longitude:138.7274},source:'GoogleマップURLの座標'});
  const selected=parseGoogleMapsInput('https://www.google.com/maps/place/X/@35.2,138.4,10z/data=!3m1!4b1!4m2!3d35.3606!4d138.7274');
  assert.deepEqual(selected.point,{latitude:35.3606,longitude:138.7274});
  assert.equal(parseGoogleMapsInput('https://www.google.com/maps/search/?api=1&query=富士山').kind,'place');
  assert.equal(parseGoogleMapsInput('https://www.google.com/maps/place/%E5%AF%8C%E5%A3%AB%E5%B1%B1/@35.2,138.4,10z').query,'富士山');
  assert.equal(parseGoogleMapsInput('https://maps.app.goo.gl/abcdef').kind,'short');
  assert.equal(parseGoogleMapsInput('https://evil.example/maps/@35,139,10z').kind,'invalid');
  assert.equal(parseLocationInput('富士山 https://www.google.com/maps/search/?api=1&query=35.3606%2C138.7274').kind,'coordinate');
});

test('catalog matches are clearly separate and use catalog centers',()=>{
  const fuji=catalogMatches('富士山');assert.equal(fuji.length,1);assert.equal(fuji[0].source,'名所ガイド登録地');assert.deepEqual(fuji[0].point,{latitude:35.3606,longitude:138.7274});
  assert.ok(catalogMatches('阿蘇山').length);assert.ok(catalogMatches('青ヶ島').length);assert.ok(catalogMatches('西之島').length);
  assert.deepEqual(catalogMatches('姫鶴平'),[]);assert.deepEqual(catalogMatches('姫'),[]);
  assert.equal(catalogMatches('石鎚山').length,1);assert.equal(catalogMatches('石鎚').length,0);
});

test('reviewed natural place index uses exact names and explicit aliases with source context',()=>{
  const shikoku=naturalPlaceMatches('四国カルスト');assert.equal(shikoku.length,1);assert.equal(shikoku[0].name,'四国カルスト');assert.match(shikoku[0].detail,/広域地名/);assert.ok(shikoku[0].sourceUrl);
  const hime=naturalPlaceMatches('姫鶴平');assert.equal(hime.length,1);assert.equal(hime[0].point.latitude,33.4675);assert.match(hime[0].detail,/高原・カルスト/);
  assert.equal(naturalPlaceMatches('メヅルダイラ')[0].name,'姫鶴平');
  assert.deepEqual(naturalPlaceMatches('姫'),[]);
  assert.equal(naturalPlaceMatches('阿蘇カルデラ')[0].name,'阿蘇カルデラ');
  assert.equal(naturalPlaceMatches('仁淀川')[0].source.startsWith('地名集日本'),true);
});

test('CSIS explicit lookup parses candidates and caches one request per query',async()=>{
  const previous=globalThis.DOMParser;
  globalThis.DOMParser=class{parseFromString(){return{querySelector:()=>null,querySelectorAll:()=>[{querySelector(tag){return{textContent:({address:'愛媛県/松山市',latitude:'33.8392',longitude:'132.7657'})[tag]}}}]}}};
  let calls=0,requestUrl;
  const fetchImpl=async url=>{calls++;requestUrl=String(url);return{ok:true,text:async()=>'<results />'}};
  try{
    const first=await searchCSIS('愛媛県松山市',{fetchImpl}),second=await searchCSIS('愛媛県松山市',{fetchImpl});
    assert.equal(calls,1);assert.equal(decodeURIComponent(requestUrl).includes('addr=愛媛県松山市'),true);
    assert.equal(first[0].source,'CSISシンプルジオコーディング実験');assert.equal(first[0].point.latitude,33.8392);assert.deepEqual(first,second);
  }finally{globalThis.DOMParser=previous;}
});

test('CSIS lookup reports transport failures without swallowing cancellation',async()=>{
  await assert.rejects(searchCSIS('松山市',{fetchImpl:async()=>{throw new TypeError('network');}}),/接続できません/);
});

test('CSIS keeps exact hierarchy matches and removes unrelated suffix fragments',async()=>{
  const previous=globalThis.DOMParser;
  const data=[
    {address:'石川県/鳳珠郡/能登町/姫',latitude:'37.3',longitude:'137.0'},
    {address:'和歌山県/東牟婁郡/串本町/姫',latitude:'33.5',longitude:'135.8'},
    {address:'長野県/松本市',latitude:'36.2381',longitude:'137.9720'},
    {address:'熊本県/松本町',latitude:'32.86',longitude:'130.81'},
  ];
  globalThis.DOMParser=class{parseFromString(){return{querySelector:()=>null,querySelectorAll:()=>data.map(item=>({querySelector(tag){return{textContent:item[tag]}}}))}}};
  try{
    const irrelevant=await searchCSIS('姫鶴平',{fetchImpl:async()=>({ok:true,text:async()=>'<results />'})});assert.deepEqual(irrelevant,[]);
    const ranked=await searchCSIS('長野県の松本',{fetchImpl:async()=>({ok:true,text:async()=>'<results />'})});assert.deepEqual(ranked.map(item=>item.name),['長野県 松本市']);
  }finally{globalThis.DOMParser=previous;}
});
