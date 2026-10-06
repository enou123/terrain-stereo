import test from 'node:test';
import assert from 'node:assert/strict';
import { loadElevation, worldPixel } from '../js/elevation.js';

test('404 fine tiles use the correct parent quadrant while retaining detail elsewhere', async()=>{
  const original=globalThis.fetch, requests=[];
  const location={latitude:33.2035,longitude:132.1812,zoom:9};
  const text=Array.from({length:256},(_,y)=>Array.from({length:256},(_,x)=>String(y*256+x)).join(',')).join('\n');
  globalThis.fetch=async url=>{
    requests.push(url);
    const [z,x]=url.match(/dem\/(\d+)\/(\d+)\//).slice(1).map(Number);
    return z===11&&x%2===0 ? {ok:false,status:404} : {ok:true,text:async()=>text};
  };
  try {
    const data=await loadElevation(()=>{},location,'ultra');
    assert.equal(data.size,769);assert.equal(data.quality,'ultra');assert.ok(data.fallbackTileCount>0);
    const [cx,cy]=worldPixel(location.latitude,location.longitude,9);
    const sx=Math.floor(cx)*4-768,sy=Math.floor(cy)*4-768;
    for(const [row,col] of [[0,0],[100,200],[400,500],[768,768]]) {
      const px=sx+col*2,py=sy+row*2,tx=Math.floor(px/256);
      const expected=tx%2===0 ? ((Math.floor(py/2)%256)*256+Math.floor(px/2)%256) : ((py%256)*256+px%256);
      assert.equal(data.heights[row*data.size+col],expected);
    }
    assert.ok(requests.some(url=>url.includes('/dem/10/')));
    assert.equal(new Set(requests).size,requests.length,'Concurrent siblings share parent requests');
  } finally {globalThis.fetch=original;}
});

test('404 at every scale preserves no-data and ends with a meaningful sea-area error',async()=>{
  const original=globalThis.fetch,requests=[];
  globalThis.fetch=async url=>{requests.push(url);return {ok:false,status:404};};
  try {
    await assert.rejects(loadElevation(()=>{},{latitude:26.123,longitude:149.456,zoom:7},'high'),/有効な標高データがありません/);
    assert.ok(requests.length<40);
    assert.ok(requests.every(url=>Number(url.match(/dem\/(\d+)/)[1])>=6));
  } finally {globalThis.fetch=original;}
});
