import { worldPixel, terrainZoom } from './elevation.js?v=0.17.0';

export function pixelLocation(x, y, zoom) {
  const scale = 256 * 2 ** zoom;
  return { latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI,
    longitude: x / scale * 360 - 180, zoom: 12 };
}
export function constrainLocation(location) {
  return { latitude: Math.max(20, Math.min(46, location.latitude)),
    longitude: Math.max(122, Math.min(154, location.longitude)), zoom: 12 };
}

// Small slippy map using GSI standard tiles; terrain is fetched only on explicit selection.
export class LocationMap {
  constructor(element, location, onChange) {
    this.element = element; this.center = constrainLocation(location); this.zoom = Number.isFinite(location.zoom) ? Math.max(4, Math.min(13, location.zoom - 1)) : 11;
    this.onChange = onChange; this.tiles = new Map(); this.pointers = new Map();
    this.layer = element.querySelector('.map-tiles'); this.notice = element.querySelector('.map-notice');
    element.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      element.focus({ preventScroll: true }); element.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
    });
    element.addEventListener('pointermove', event => {
      if (!this.pointers.has(event.pointerId)) return;
      const before = [...this.pointers.values()];
      this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
      const after = [...this.pointers.values()];
      const mean = points => points.reduce((sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length], [0, 0]);
      const a = mean(before), b = mean(after);
      this.pan(b[0] - a[0], b[1] - a[1]);
      if (after.length === 2) {
        const distance = points => Math.hypot(points[0][0] - points[1][0], points[0][1] - points[1][1]);
        if (!this.pinchStart) this.pinchStart = { distance: distance(before), zoom: this.zoom };
        const ratio = distance(after) / Math.max(1, this.pinchStart.distance);
        this.setZoom(this.pinchStart.zoom + Math.round(Math.log2(ratio)));
      }
    });
    const release = event => { this.pointers.delete(event.pointerId); this.pinchStart = null; };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, release);
    element.addEventListener('wheel', event => {
      event.preventDefault(); this.setZoom(this.zoom + (event.deltaY < 0 ? 1 : -1));
    }, { passive: false });
    element.addEventListener('keydown', event => {
      const directions = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] };
      if (directions[event.key]) { event.preventDefault(); this.pan(...directions[event.key]); }
      else if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); this.setZoom(this.zoom + (event.key === '-' ? -1 : 1)); }
    });
    this.observer = new ResizeObserver(() => this.render()); this.observer.observe(element);
    this.render();
  }
  pan(dx, dy) {
    const [x, y] = worldPixel(this.center.latitude, this.center.longitude, this.zoom);
    this.center = constrainLocation(pixelLocation(x - dx, y - dy, this.zoom)); this.render();
  }
  setZoom(zoom) { this.zoom = Math.max(4, Math.min(13, zoom)); this.render(); }
  setCenter(location) { this.center = constrainLocation(location); this.zoom = 11; this.render(); }
  render() {
    const width = this.element.clientWidth, height = this.element.clientHeight;
    if (!width || !height) return;
    const [cx, cy] = worldPixel(this.center.latitude, this.center.longitude, this.zoom);
    const left = cx - width / 2, top = cy - height / 2, visible = new Set();
    for (let y = Math.floor(top / 256); y <= Math.floor((top + height) / 256); y++) {
      for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++) {
        const key = `${this.zoom}/${x}/${y}`; visible.add(key);
        let tile = this.tiles.get(key);
        if (!tile) {
          tile = document.createElement('img'); tile.alt = ''; tile.draggable = false;
          tile.addEventListener('load', () => { tile.dataset.state = 'loaded'; this.updateNotice(); });
          tile.addEventListener('error', () => { tile.dataset.state = 'error'; this.updateNotice(); });
          tile.src = `https://cyberjapandata.gsi.go.jp/xyz/std/${key}.png`;
          this.tiles.set(key, tile); this.layer.append(tile);
        }
        tile.style.transform = `translate(${x * 256 - left}px, ${y * 256 - top}px)`;
      }
    }
    for (const [key, tile] of this.tiles) if (!visible.has(key)) { tile.remove(); this.tiles.delete(key); }
    // The footprint is the same 384 DEM pixels used by the terrain grid.
    const footprint = 384 * 2 ** (this.zoom - terrainZoom(this.zoom));
    this.element.querySelector('.map-footprint').style.width = `${footprint}px`;
    this.element.querySelector('.map-footprint').style.height = `${footprint}px`;
    this.updateNotice(); this.onChange({ ...this.center, zoom: terrainZoom(this.zoom) });
    document.querySelector('#map-zoom-in').disabled = this.zoom === 13;
    document.querySelector('#map-zoom-out').disabled = this.zoom === 4;
  }
  updateNotice() {
    const failed = [...this.tiles.values()].some(tile => tile.dataset.state === 'error');
    this.notice.hidden = !failed;
    this.notice.textContent = '地図の一部を読み込めません。拡大・縮小で再読み込みできます。';
  }
}
