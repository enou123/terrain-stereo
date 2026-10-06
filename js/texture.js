import { worldPixel } from './elevation.js?v=0.10.0';

// Same rounded origin and 384-pixel footprint as DEM, independent of its quality.
export function texturePlan(location) {
  const zoom = Math.min(14, location.zoom + 1), scale = 2 ** (zoom - location.zoom);
  const [x, y] = worldPixel(location.latitude, location.longitude, location.zoom);
  const left = (Math.floor(x) - 192) * scale, top = (Math.floor(y) - 192) * scale;
  const span = 384 * scale, tiles = [];
  for (let ty = Math.floor(top / 256); ty < Math.ceil((top + span) / 256); ty++) {
    for (let tx = Math.floor(left / 256); tx < Math.ceil((left + span) / 256); tx++) {
      tiles.push({ x: tx, y: ty, url: `https://cyberjapandata.gsi.go.jp/xyz/std/${zoom}/${tx}/${ty}.png` });
    }
  }
  return { zoom, left, top, span, tiles };
}
export function textureKey(location) {
  const p = texturePlan(location);
  return `${p.zoom}/${p.left}/${p.top}/${p.span}`;
}
// One bounded atlas, four concurrent requests; caller owns cancellation and cache.
export async function loadMapTexture(location, signal) {
  const plan = texturePlan(location), canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d'), factor = 1024 / plan.span;
  let next = 0;
  async function worker() {
    while (next < plan.tiles.length) {
      signal.throwIfAborted();
      const tile = plan.tiles[next++];
      const response = await fetch(tile.url, { mode: 'cors', signal });
      if (!response.ok) throw new Error(`地図画像を取得できませんでした（HTTP ${response.status}）。`);
      const bitmap = await createImageBitmap(await response.blob());
      try {
        signal.throwIfAborted();
        if (bitmap.width !== 256 || bitmap.height !== 256) throw new Error('地図画像のサイズが不正です。');
        context.drawImage(bitmap, (tile.x * 256 - plan.left) * factor, (tile.y * 256 - plan.top) * factor, 256 * factor, 256 * factor);
      } finally { bitmap.close(); }
    }
  }
  const results = await Promise.allSettled(Array.from({ length: Math.min(4, plan.tiles.length) }, worker));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return canvas;
}
