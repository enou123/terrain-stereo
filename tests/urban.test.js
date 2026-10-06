import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBuildingTiles } from '../js/urban.js';
const location = { latitude: 35.69, longitude: 139.75 };
const metadata = { asset: { version: '1.1' }, root: { boundingVolume: { sphere: [0, 0, 0, 1] } } };
test('requests the official LOD1 3D Tiles model without fabricating heights', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const result = await fetchBuildingTiles(location, signal, async (url, options) => {
    calls.push(url); assert.equal(options.signal, signal);
    return Response.json(calls.length === 1 ? { results: { muniCd: '13101' } } : metadata);
  });
  assert.equal(result.cityCode, '13101');
  assert.match(calls[0], /lat=35\.69&lon=139\.75/);
  assert.equal(result.url, 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/13101-bldg-lod1-latest/tileset.json');
});
test('distinguishes unavailable LOD1 data from connection errors', async () => {
  for (const [code, message] of [[404, /LOD1建物モデルが見つかりません/], [503, /HTTP 503/]]) {
    let count = 0;
    await assert.rejects(fetchBuildingTiles(location, undefined, async () => ++count === 1
      ? Response.json({ results: { muniCd: '13101' } }) : new Response('', { status: code })), message);
  }
});
test('rejects missing municipality and malformed 3D Tiles metadata', async () => {
  await assert.rejects(fetchBuildingTiles(location, undefined, async () => Response.json({ results: {} })), /自治体を特定できません/);
  let count = 0;
  await assert.rejects(fetchBuildingTiles(location, undefined, async () => Response.json(++count === 1
    ? { results: { muniCd: '13101' } } : { tiles: [] })), /形式を確認できません/);
});
