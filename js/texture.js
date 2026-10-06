import { worldPixel } from './elevation.js?v=0.22.0';

const sources = {
  map:{url:'https://cyberjapandata.gsi.go.jp/xyz/std',extension:'png',label:'地図画像'},
  photo:{url:'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto',extension:'jpg',label:'航空写真'},
  geology:{url:'https://gbank.gsj.jp/seamless/v2/api/1.3.1/tiles',extension:'png',label:'地質図',yBeforeX:true,maxZoom:13,query:'?type=original'}
};
function sourceFor(surface) {
  const source=sources[surface];
  if(!source) throw new Error('対応していない画像の種類です。');
  return source;
}

// Same rounded origin and 384-pixel footprint as DEM, independent of its quality.
export function texturePlan(location, surface = 'map') {
  const source=sourceFor(surface);
  const zoom = Math.min(source.maxZoom ?? 14, location.zoom + 1), scale = 2 ** (zoom - location.zoom);
  const [x, y] = worldPixel(location.latitude, location.longitude, location.zoom);
  const left = (Math.floor(x) - 192) * scale, top = (Math.floor(y) - 192) * scale;
  const span = 384 * scale, tiles = [];
  for (let ty = Math.floor(top / 256); ty < Math.ceil((top + span) / 256); ty++) {
    for (let tx = Math.floor(left / 256); tx < Math.ceil((left + span) / 256); tx++) {
      const coordinates=source.yBeforeX ? `${zoom}/${ty}/${tx}` : `${zoom}/${tx}/${ty}`;
      tiles.push({ x: tx, y: ty, url: `${source.url}/${coordinates}.${source.extension}${source.query ?? ''}` });
    }
  }
  return { zoom, left, top, span, tiles };
}
export function textureKey(location, surface = 'map') {
  const p = texturePlan(location,surface);
  return `${surface}/${p.zoom}/${p.left}/${p.top}/${p.span}`;
}
// One bounded atlas, four concurrent requests; caller owns cancellation and cache.
export async function loadMapTexture(location, signal, surface = 'map') {
  const source=sourceFor(surface);
  const plan = texturePlan(location,surface), canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d'), factor = 1024 / plan.span;
  let next = 0;
  async function worker() {
    while (next < plan.tiles.length) {
      signal.throwIfAborted();
      const tile = plan.tiles[next++];
      const response = await fetch(tile.url, { mode: 'cors', signal });
      if (!response.ok) throw new Error(`${source.label}を取得できませんでした（HTTP ${response.status}）。`);
      const bitmap = await createImageBitmap(await response.blob());
      try {
        signal.throwIfAborted();
        if (bitmap.width !== 256 || bitmap.height !== 256) throw new Error(`${source.label}のサイズが不正です。`);
        context.drawImage(bitmap, (tile.x * 256 - plan.left) * factor, (tile.y * 256 - plan.top) * factor, 256 * factor, 256 * factor);
      } finally { bitmap.close(); }
    }
  }
  const results = await Promise.allSettled(Array.from({ length: Math.min(4, plan.tiles.length) }, worker));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return canvas;
}
