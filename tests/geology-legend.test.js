import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchGeologyLegend } from '../js/geology-legend.js';

test('geology legend requests only the visible extent using detailed map categories',async()=>{
  const original=globalThis.fetch,requests=[];
  const response=[{value:'7F9B72',title:'新生代 第四紀, 火山岩',group_ja:'火成岩',formationAge_ja:'新生代 第四紀',lithology_ja:'火山岩'},{value:'bad',title:'invalid'}];
  globalThis.fetch=async(url,options)=>{requests.push({url,signal:options.signal});return {ok:true,json:async()=>response}};
  try{
    const location={latitude:33.767,longitude:133.115},legend=await fetchGeologyLegend(location,12);
    assert.equal(requests.length,1);
    const url=new URL(requests[0].url);
    assert.equal(url.searchParams.get('type'),'level1');
    assert.equal(url.searchParams.get('z'),'13');
    assert.equal(url.searchParams.get('box'),'33.71310,133.05016,33.82090,133.17984');
    assert.deepEqual(legend,[{value:'7f9b72',title:'新生代 第四紀, 火山岩',group_ja:'火成岩',formationAge_ja:'新生代 第四紀',lithology_ja:'火山岩'}]);
    const again=await fetchGeologyLegend(location,12);
    assert.equal(requests.length,1);
    assert.deepEqual(again,legend);
  }finally{globalThis.fetch=original}
});
