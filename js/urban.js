const GEO_CODE_URL = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress';
const PLATEAU_API = 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles';
const CESIUM_BASE = 'https://cdn.jsdelivr.net/npm/cesium@1.117.0/Build/Cesium/';
let libraryPromise;

function loadCesium() {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (!libraryPromise) {
    window.CESIUM_BASE_URL = CESIUM_BASE;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = `${CESIUM_BASE}Widgets/widgets.css`;
    if (!document.querySelector('[data-cesium-css]')) { css.dataset.cesiumCss = 'true'; document.head.append(css); }
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => fail(), 30000);
      const fail = () => { clearTimeout(timeout); script.remove(); libraryPromise = null; reject(new Error('都市3Dの表示機能を読み込めませんでした。閉じてから再度お試しください。')); };
      script.src = `${CESIUM_BASE}Cesium.js`;
      script.onload = () => { clearTimeout(timeout); resolve(window.Cesium); };
      script.onerror = fail;
      document.head.append(script);
    });
  }
  return libraryPromise;
}

export async function fetchBuildingTiles(location, signal, fetchImpl = fetch) {
  const query = new URLSearchParams({ lat: String(location.latitude), lon: String(location.longitude) });
  const areaResponse = await fetchImpl(`${GEO_CODE_URL}?${query}`, { signal, mode: 'cors' });
  if (!areaResponse.ok) throw new Error(`場所を調べられませんでした（HTTP ${areaResponse.status}）。`);
  const area = await areaResponse.json();
  const cityCode = String(area?.results?.muniCd ?? '');
  if (!/^\d{5}$/.test(cityCode)) throw new Error('選択した場所の自治体を特定できませんでした。');
  const url = `${PLATEAU_API}/${cityCode}-bldg-lod1-latest/tileset.json`;
  const response = await fetchImpl(url, { signal, mode: 'cors' });
  if (response.status === 404) throw new Error('この自治体のLOD1建物モデルが見つかりません。地図で都市部を選んでお試しください。');
  if (!response.ok) throw new Error(`建物データを確認できませんでした（HTTP ${response.status}）。`);
  const tileset = await response.json();
  if (!tileset.asset?.version || !tileset.root?.boundingVolume) throw new Error('建物データの形式を確認できませんでした。');
  return { cityCode, url };
}

export class UrbanView {
  constructor() {
    this.dialog = document.querySelector('#urban-dialog');
    this.status = document.querySelector('#urban-status');
    this.container = document.querySelector('#urban-map');
    this.request = 0;
    document.querySelector('#urban-tokyo').addEventListener('click', () => this.open({ latitude: 35.6812, longitude: 139.7671 }));
    document.querySelector('#urban-close').addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.resize = new ResizeObserver(() => this.viewer?.resize());
    this.resize.observe(this.container);
  }

  async open(location) {
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
    this.close();
    const request = ++this.request;
    this.controller = new AbortController();
    this.dialog.showModal();
    this.status.textContent = '選択した場所のPLATEAU建物データを確認しています…';
    this.timer = setTimeout(() => {
      if (request !== this.request) return;
      this.controller.abort();
      this.status.textContent = '読み込みに時間がかかっています。閉じてから再度お試しください。';
      this.request++;
      this.viewer?.destroy(); this.viewer = null;
    }, 60000);
    try {
      const dataset = await fetchBuildingTiles(location, this.controller.signal);
      const C = await loadCesium();
      if (request !== this.request) return;
      this.status.textContent = '建物の3Dモデルを読み込んでいます…';
      let tileFailed = false;
      const viewer = this.viewer = new C.Viewer(this.container, {
        baseLayer: false, terrainProvider: new C.EllipsoidTerrainProvider(),
        animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
        homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, selectionIndicator: false, infoBox: false,
        requestRenderMode: true, maximumRenderTimeChange: Infinity
      });
      viewer.resolutionScale = Math.min(1, 1 / (window.devicePixelRatio || 1));
      const center = C.Cartesian3.fromDegrees(location.longitude, location.latitude);
      const lightDirection = C.Matrix4.multiplyByPointAsVector(C.Transforms.eastNorthUpToFixedFrame(center),
        new C.Cartesian3(0.3, -0.4, -0.85), new C.Cartesian3());
      viewer.scene.light = new C.DirectionalLight({ direction: lightDirection, intensity: 2 });
      viewer.scene.globe.baseColor = C.Color.fromCssColorString('#71836a');
      viewer.scene.renderError.addEventListener(() => {
        if (request !== this.request) return;
        clearTimeout(this.timer);
        tileFailed = true;
        this.status.textContent = '都市3Dの描画に失敗しました。閉じてから再度お試しください。';
      });
      viewer.scene.backgroundColor = C.Color.fromCssColorString('#172e24');
      const tiles = await C.Cesium3DTileset.fromUrl(dataset.url, { maximumScreenSpaceError: 12, cacheBytes: 64 * 1024 * 1024 });
      if (request !== this.request) { tiles.destroy(); return; }
      viewer.scene.primitives.add(tiles);
      tiles.tileFailed.addEventListener(() => {
        if (request !== this.request) return;
        tileFailed = true; clearTimeout(this.timer);
        this.status.textContent = '一部の建物を読み込めませんでした。通信状態を確認し、閉じてから再度お試しください。';
      });
      tiles.tileVisible.addEventListener(() => {
        if (request !== this.request || tileFailed) return;
        clearTimeout(this.timer);
        this.status.textContent = 'PLATEAU LOD1 · ドラッグで移動、右ドラッグで回転、ホイールで拡大。タッチは2本指で拡大・回転。';
      });
      viewer.camera.lookAt(C.Cartesian3.fromDegrees(location.longitude, location.latitude),
        new C.HeadingPitchRange(0, C.Math.toRadians(-45), 1500));
      viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
      viewer.scene.requestRender();
    } catch (error) {
      if (request !== this.request) return;
      clearTimeout(this.timer);
      this.viewer?.destroy(); this.viewer = null;
      this.status.textContent = error.name === 'AbortError' ? '読み込みを中断しました。' : `都市3Dを表示できません：${error.message || '通信に失敗しました。'}`;
    }
  }

  close() {
    this.request++;
    clearTimeout(this.timer);
    this.controller?.abort(); this.controller = null;
    this.viewer?.destroy(); this.viewer = null;
    if (this.dialog.open) this.dialog.close();
    this.container.replaceChildren();
  }
}
