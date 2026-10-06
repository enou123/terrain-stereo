import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBuildingTiles } from '../js/urban.js';
const location = { latitude: 35.69, longitude: 139.75 };
const metadata = { asset: { version: '1.1' }, root: { boundingVolume: { sphere: [0, 0, 0, 1] } } };
test('requests the official nationwide LOD1 composite, independent of selected city', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const result = await fetchBuildingTiles(location, signal, async (url, options) => {
    calls.push(url); assert.equal(options.signal, signal); return Response.json(metadata);
  });
  assert.deepEqual(calls, ['https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/all-bldg-lod1-latest/tileset.json']);
  assert.equal(result.url, calls[0]);
});
test('distinguishes missing national data from connection errors', async () => {
  for (const [code, message] of [[404, /全国のLOD1建物データが見つかりません/], [503, /HTTP 503/]]) {
    await assert.rejects(fetchBuildingTiles(location, undefined, async () => new Response('', { status: code })), message);
  }
});
test('rejects malformed 3D Tiles metadata', async () => {
  await assert.rejects(fetchBuildingTiles(location, undefined, async () => Response.json({ tiles: [] })), /形式を確認できません/);
});
