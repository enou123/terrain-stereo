// GSI text DEM: 256 × 256 comma-separated elevations (metres), "e" = no data.
export const LOCATION = Object.freeze({ latitude: 33.767, longitude: 133.115, zoom: 12 });
export const GRID_SIZE = 193;
const TILE_SIZE = 256;
const STEP = 2;
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
export async function loadElevation(onProgress = () => {}, location = LOCATION) {
  const { latitude, longitude, zoom = 12 } = location;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 20 || latitude > 46 || longitude < 122 || longitude > 154 || zoom !== 12) {
    throw new Error('日本周辺の緯度・経度を指定してください。');
  }
  const [cx, cy] = worldPixel(latitude, longitude, zoom);
  const half = (GRID_SIZE - 1) * STEP / 2;
  const startX = Math.floor(cx) - half, startY = Math.floor(cy) - half;
  const tiles = new Map();
  const jobs = [];
  for (let y = Math.floor(startY / TILE_SIZE); y <= Math.floor((startY + half * 2) / TILE_SIZE); y++) {
    for (let x = Math.floor(startX / TILE_SIZE); x <= Math.floor((startX + half * 2) / TILE_SIZE); x++) jobs.push({ x, y });
  }
  let completed = 0, failed = false;
  // Small bounded batch (at most 9 tiles); no synthetic fallback on a failed request.
  try { await Promise.all(jobs.map(async ({ x, y }) => {
    const url = `https://cyberjapandata.gsi.go.jp/xyz/dem/${zoom}/${x}/${y}.txt`;
    let values = tileCache.get(url);
    if (!values) {
      const response = await fetch(url, { signal: AbortSignal.timeout(25000), mode: 'cors' });
      if (!response.ok) throw new Error(`標高タイルの取得に失敗しました（HTTP ${response.status}）。`);
      values = parseTile(await response.text());
    }
    tileCache.delete(url); tileCache.set(url, values);
    if (tileCache.size > CACHE_LIMIT) tileCache.delete(tileCache.keys().next().value);
    tiles.set(`${x}/${y}`, values);
    if (!failed) onProgress(++completed, jobs.length);
  })); } catch (error) {
    failed = true;
    if (error.name === 'TimeoutError') throw new Error('標高タイルの通信がタイムアウトしました。');
    throw error;
  }
  const heights = new Float32Array(GRID_SIZE ** 2);
  let validCount = 0, min = Infinity, max = -Infinity;
  for (let row = 0; row < GRID_SIZE; row++) for (let col = 0; col < GRID_SIZE; col++) {
    const px = startX + col * STEP, py = startY + row * STEP;
    const value = tiles.get(`${Math.floor(px / TILE_SIZE)}/${Math.floor(py / TILE_SIZE)}`)[(py % TILE_SIZE) * TILE_SIZE + px % TILE_SIZE];
    heights[row * GRID_SIZE + col] = value;
    if (Number.isFinite(value)) { validCount++; min = Math.min(min, value); max = Math.max(max, value); }
  }
  if (!validCount) throw new Error('この範囲には有効な標高データがありません。');
  const spacing = 40075016.6856 * Math.cos(latitude * Math.PI / 180) / (TILE_SIZE * 2 ** zoom) * STEP / 1000;
  return { heights, size: GRID_SIZE, spacing, min, max, tileCount: jobs.length, validCount, location: { latitude, longitude, zoom } };
}
