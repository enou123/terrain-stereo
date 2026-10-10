import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('stylesheet and complete browser module graph share the release version', async () => {
  const root = new URL('../', import.meta.url);
  const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const html = await readFile(new URL('index.html', root), 'utf8');
  const references = [...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js)(?:\?[^" ]*)?)"/g)].map(match => match[1]);
  assert.equal(references.length, 2);
  const visited = new Set();
  async function check(reference, parent) {
    const url = new URL(reference, parent);
    assert.equal(url.search, `?v=${version}`, `Missing or stale release version: ${reference}`);
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = await readFile(url, 'utf8');
    if (url.pathname.endsWith('.js')) {
      for (const match of source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
        await check(match[1], url);
      }
    }
  }
  for (const reference of references) await check(reference, root);
  assert.equal(visited.size, 27, 'All browser modules, including the regional bathymetry registry and sea-floor guide, must share the release version');
});
