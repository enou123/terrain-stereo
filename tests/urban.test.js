import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_TILES_URL } from '../js/urban.js';

test('uses PLATEAU’s nationwide latest LOD1 composite tileset URL', () => {
  assert.equal(BUILDING_TILES_URL, 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/all-bldg-lod1-latest/tileset.json');
});
