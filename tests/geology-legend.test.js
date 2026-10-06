import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGeologyLegend, fetchGeologyPoint, geologyPointLocation } from '../js/geology-legend.js';

test('geology legend requests only the visible extent using detailed map categories',async()=>{
  const original=globalThis.fetch,requests=[];
  const response=[{value:'7F9B72',title:'新生代 第四紀, 火山岩',group_ja:'火成岩',formationAge_ja:'新生代 第四紀',lithology_ja:'火山岩'},{value:'bad',title:'invalid'}];
  globalThis.fetch=async(url,options)=>{requests.push({url,signal:options.signal});return {ok:true,json:async()=>response}};
  try{
    const location={latitude:33.767,longitude:133.115,zoom:12},legend=await fetchGeologyLegend(location,12);
    assert.equal(requests.length,1);
    const url=new URL(requests[0].url);
    assert.equal(url.searchParams.get('type'),'original');
    assert.equal(url.searchParams.get('z'),'13');
    assert.equal(url.searchParams.get('box'),'33.71310,133.05016,33.82090,133.17984');
    assert.deepEqual(legend,[{symbol:'',value:'7f9b72',title:'新生代 第四紀, 火山岩',group_ja:'火成岩',formationAge_ja:'新生代 第四紀',lithology_ja:'火山岩'}]);
    const again=await fetchGeologyLegend(location,12);
    assert.equal(requests.length,1);
    assert.deepEqual(again,legend);
  }finally{globalThis.fetch=original}
});

test('geology hit uses the same rounded DEM footprint and queries original point legend',async()=>{
  const location={latitude:33.767,longitude:133.115,zoom:12};
  const middle=geologyPointLocation(location,{u:.5,v:.5});
  assert.ok(Math.abs(middle.latitude-location.latitude)<.0004);
  assert.ok(Math.abs(middle.longitude-location.longitude)<.0004);
  const nw=geologyPointLocation(location,{u:0,v:0}),se=geologyPointLocation(location,{u:1,v:1});
  assert.ok(nw.latitude>middle.latitude&&nw.longitude<middle.longitude);
  assert.ok(se.latitude<middle.latitude&&se.longitude>middle.longitude);
  const original=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    const query=new URL(url).searchParams;
    assert.equal(query.get('type'),'original');assert.equal(query.get('z'),'13');
    assert.equal(query.get('point'),`${middle.latitude.toFixed(7)},${middle.longitude.toFixed(7)}`);
    return {ok:true,json:async()=>({symbol:'K12_pim_a',value:'E7385D',title:'花崗閃緑岩'})};
  };
  try{const entry=await fetchGeologyPoint(location,{u:.5,v:.5});assert.equal(entry.symbol,'K12_pim_a');assert.equal(entry.value,'e7385d');}
  finally{globalThis.fetch=original;}
});
