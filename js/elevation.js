// GSI text DEM: 256 × 256 comma-separated elevations (metres), "e" = no data.
export const LOCATION = Object.freeze({ latitude: 33.767, longitude: 133.115, zoom: 12 });
export const GRID_SIZE = 193;
const TILE_SIZE = 256;
const STEP = 2;
export const MIN_TERRAIN_ZOOM = 6;
export const MAX_TERRAIN_ZOOM = 14;
export function terrainZoom(mapZoom) {
  return Math.max(MIN_TERRAIN_ZOOM, Math.min(MAX_TERRAIN_ZOOM, mapZoom + 1));
}
export function terrainExtent(latitude, zoom) {
  return 40075016.6856 * Math.cos(latitude * Math.PI / 180) / (TILE_SIZE * 2 ** zoom) * (GRID_SIZE - 1) * STEP / 1000;
}
const tileCache = new Map();
const CACHE_LIMIT = 24;
export function worldPixel(latitude, longitude, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  return [(longitude + 180) / 360 * scale,
    (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * scale];
}
export function parseTile(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length !== TILE_SIZE) throw new Error('標高タイルの行数が不正です。');
  const values = new Float32Array(TILE_SIZE * TILE_SIZE);
  rows.forEach((row, y) => {
    const cells = row.split(',');
    if (cells.length !== TILE_SIZE) throw new Error('標高タイルの列数が不正です。');
    cells.forEach((cell, x) => {
      const value = cell.trim() === 'e' || cell.trim() === '' ? NaN : Number(cell);
      values[y * TILE_SIZE + x] = Number.isFinite(value) ? value : NaN;
    });
  });
  return values;
}
export function qualitySampling(zoom, quality = 'standard') {
  const levels = { standard: 0, high: 1, ultra: 2 };
  if (!Object.hasOwn(levels, quality)) throw new Error('対応する画質を選んでください。');
  const sourceZoom = Math.min(MAX_TERRAIN_ZOOM, zoom + levels[quality]);
  const scale = 2 ** (sourceZoom - zoom);
  const step = quality === 'standard' || sourceZoom === zoom + levels[quality] ? 2 : 1;
  return { sourceZoom, step, size: (GRID_SIZE - 1) * STEP * scale / step + 1, scale };
}
// A 404 means this tile is unavailable, often offshore. Reuse a coarser
// parent at the same geographic coordinates; never turn missing sea into land.
const pendingTiles = new Map();
async function elevationTile(zoom, x, y) {
  const url = `https://cyberjapandata.gsi.go.jp/xyz/dem/${zoom}/${x}/${y}.txt`;
  if (tileCache.has(url)) {
    const result = tileCache.get(url);
    tileCache.delete(url); tileCache.set(url, result);
    return result;
  }
  if (pendingTiles.has(url)) return pendingTiles.get(url);
  const pending = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000), mode: 'cors' });
    let result;
    if (response.ok) result = { values: parseTile(await response.text()), fallback: false };
    else if (response.status === 404) {
      const values = new Float32Array(TILE_SIZE * TILE_SIZE).fill(NaN);
      if (zoom > MIN_TERRAIN_ZOOM) {
        const parent = await elevationTile(zoom - 1, Math.floor(x / 2), Math.floor(y / 2));
        const offsetX = (x % 2) * 128, offsetY = (y % 2) * 128;
        for (let row = 0; row < TILE_SIZE; row++) for (let col = 0; col < TILE_SIZE; col++) {
          values[row * TILE_SIZE + col] = parent.values[(offsetY + Math.floor(row / 2)) * TILE_SIZE + offsetX + Math.floor(col / 2)];
        }
      }
      result = { values, fallback: true };
    } else throw new Error(`標高タイルの取得に失敗しました（HTTP ${response.status}）。`);
    tileCache.delete(url); tileCache.set(url, result);
    if (tileCache.size > CACHE_LIMIT) tileCache.delete(tileCache.keys().next().value);
    return result;
  })();
  pendingTiles.set(url, pending);
  try { return await pending; } finally { pendingTiles.delete(url); }
}
export async function loadElevation(onProgress = () => {}, location = LOCATION, quality = 'standard') {
  const { latitude, longitude, zoom = 12 } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 20 || latitude > 46 || longitude < 122 || longitude > 154 || !Number.isInteger(zoom) || zoom < MIN_TERRAIN_ZOOM || zoom > MAX_TERRAIN_ZOOM) {
    throw new Error('日本周辺の緯度・経度と対応する縮尺を指定してください。');
  }
  const { sourceZoom, step, size, scale } = qualitySampling(zoom, quality);
  // Anchor every quality to exactly the same geographic bounds.
  const [cx, cy] = worldPixel(latitude, longitude, zoom);
  const half = (GRID_SIZE - 1) * STEP * scale / 2;
  const startX = Math.floor(cx) * scale - half, startY = Math.floor(cy) * scale - half;
  const tiles = new Map();
  const jobs = [];
  for (let y = Math.floor(startY / TILE_SIZE); y <= Math.floor((startY + half * 2) / TILE_SIZE); y++) {
    for (let x = Math.floor(startX / TILE_SIZE); x <= Math.floor((startX + half * 2) / TILE_SIZE); x++) jobs.push({ x, y });
  }
  let completed = 0, failed = false, fallbackTileCount = 0;
  // At most 49 target tiles, with coarser parents fetched only for 404s.
  // Four workers also bound simultaneous fallback requests.
  let nextJob = 0;
  async function worker() {
    while (!failed && nextJob < jobs.length) {
      const { x, y } = jobs[nextJob++];
      const tile = await elevationTile(sourceZoom, x, y);
      if (tile.fallback) fallbackTileCount++;
      tiles.set(`${x}/${y}`, tile.values);
      if (!failed) onProgress(++completed, jobs.length);
    }
  }
  const results = await Promise.allSettled(Array.from({length: Math.min(4, jobs.length)}, async () => {
    try { await worker(); } catch (error) { failed = true; throw error; }
  }));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) {
    const error = failure.reason;
    failed = true;
    if (error.name === 'TimeoutError') throw new Error('標高タイルの通信がタイムアウトしました。');
    throw error;
  }
  const heights = new Float32Array(size ** 2);
  let validCount = 0, min = Infinity, max = -Infinity;
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const px = startX + col * step, py = startY + row * step;
    const value = tiles.get(`${Math.floor(px / TILE_SIZE)}/${Math.floor(py / TILE_SIZE)}`)[(py % TILE_SIZE) * TILE_SIZE + px % TILE_SIZE];
    heights[row * size + col] = value;
    if (Number.isFinite(value)) { validCount++; min = Math.min(min, value); max = Math.max(max, value); }
  }
  if (!validCount) throw new Error('この範囲には有効な標高データがありません。');
  const spacing = 40075016.6856 * Math.cos(latitude * Math.PI / 180) / (TILE_SIZE * 2 ** sourceZoom) * step / 1000;
  return { heights, size, spacing, min, max, tileCount: jobs.length, fallbackTileCount, validCount, quality, sourceZoom, location: { latitude, longitude, zoom } };
}
