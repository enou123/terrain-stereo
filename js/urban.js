const BUILDING_TILES_URL = 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/all-bldg-lod1-latest/tileset.json';
const TERRAIN_URL = 'https://tile.plateauview.mlit.go.jp/terrain';
const ORTHO_URL = 'https://tile.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/{z}/{x}/{y}.png';
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

export async function fetchBuildingTiles(_location, signal, fetchImpl = fetch) {
  const response = await fetchImpl(BUILDING_TILES_URL, { signal, mode: 'cors' });
  if (response.status === 404) throw new Error('全国のLOD1建物データが見つかりません。');
  if (!response.ok) throw new Error(`建物データを確認できませんでした（HTTP ${response.status}）。`);
  const tileset = await response.json();
  if (!tileset.asset?.version || !tileset.root?.boundingVolume) throw new Error('建物データの形式を確認できませんでした。');
  return { url: BUILDING_TILES_URL };
}

export class UrbanView {
  constructor() {
    this.dialog = document.querySelector('#urban-dialog');
    this.status = document.querySelector('#urban-status');
    this.container = document.querySelector('#urban-map');
    this.homeButton = document.querySelector('#urban-home');
    this.request = 0;
    this.homeButton.addEventListener('click', () => this.flyHome());
    document.querySelector('#urban-tokyo').addEventListener('click', () => this.open({ latitude: 35.6812, longitude: 139.7671 }));
    document.querySelector('#urban-close').addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.resize = new ResizeObserver(() => this.viewer?.resize());
    this.resize.observe(this.container);
  }

  flyHome() {
    if (!this.viewer || !this.location) return;
    const C = window.Cesium;
    this.viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(this.location.longitude, this.location.latitude, 5000),
      orientation: { heading: 0, pitch: C.Math.toRadians(-70), roll: 0 }, duration: 1
    });
  }

  async open(location) {
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
    this.close();
    const request = ++this.request;
    this.location = { ...location };
    this.controller = new AbortController();
    this.dialog.showModal();
    this.homeButton.hidden = false;
    this.status.textContent = '日本全国の建物・地形・航空写真データを確認しています…';
    this.timer = setTimeout(() => {
      if (request !== this.request) return;
      this.controller.abort();
      this.status.textContent = '建物データの読み込みに時間がかかっています。通信状態を確認して再度お試しください。';
      this.request++;
      this.viewer?.destroy(); this.viewer = null;
    }, 90000);
    try {
      const dataset = await fetchBuildingTiles(location, this.controller.signal);
      const C = await loadCesium();
      if (request !== this.request) return;
      this.status.textContent = '全国の建物と地形を読み込んでいます…';
      let tileFailed = false;
      const viewer = this.viewer = new C.Viewer(this.container, {
        baseLayer: false, terrainProvider: new C.EllipsoidTerrainProvider(),
        animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
        homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, selectionIndicator: false, infoBox: false,
        requestRenderMode: true, maximumRenderTimeChange: Infinity
      });
      viewer.resolutionScale = Math.min(1, 1 / (window.devicePixelRatio || 1));
      viewer.scene.globe.baseColor = C.Color.fromCssColorString('#71836a');
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.backgroundColor = C.Color.fromCssColorString('#172e24');
      viewer.scene.renderError.addEventListener(() => {
        if (request !== this.request) return;
        this.status.textContent = '都市3Dの描画に失敗しました。閉じてから再度お試しください。';
      });

      // Imagery and elevation are independent optional layers. Either may fail while buildings remain usable.
      try {
        const imagery = new C.UrlTemplateImageryProvider({ url: ORTHO_URL, minimumLevel: 10, maximumLevel: 19 });
        viewer.imageryLayers.addImageryProvider(imagery);
        imagery.errorEvent.addEventListener(() => {
          if (request === this.request) this.status.textContent = '航空写真を取得できません。地形と建物の表示を続けます。';
        });
      } catch { /* Keep the terrain and buildings available if imagery setup fails. */ }
      C.CesiumTerrainProvider.fromUrl(TERRAIN_URL, { requestVertexNormals: true }).then(terrain => {
        if (request !== this.request) return;
        viewer.terrainProvider = terrain;
        viewer.scene.requestRender();
      }).catch(() => {
        if (request === this.request && !viewer.scene.primitives.length) this.status.textContent = '地形データを取得できません。建物と航空写真の表示を続けます。';
      });
      const tiles = await C.Cesium3DTileset.fromUrl(dataset.url, { maximumScreenSpaceError: 12, cacheBytes: 96 * 1024 * 1024 });
      if (request !== this.request) { tiles.destroy(); return; }
      viewer.scene.primitives.add(tiles);
      clearTimeout(this.timer);
      this.status.textContent = '全国PLATEAU LOD1 · ドラッグで移動、右ドラッグで回転、ホイールで拡大。選択地へ戻るには「選択地」ボタン。';
      tiles.tileFailed.addEventListener(() => {
        if (request !== this.request) return;
        tileFailed = true; clearTimeout(this.timer);
        this.status.textContent = '表示範囲内の一部の建物タイルを取得できません。別の場所へ移動してお試しください。';
      });
      tiles.tileVisible.addEventListener(() => {
        if (request !== this.request || tileFailed) return;
        this.status.textContent = '全国PLATEAU LOD1 · ドラッグで移動、右ドラッグで回転、ホイールで拡大。選択地へ戻るには「選択地」ボタン。';
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
    this.location = null;
    if (this.dialog.open) this.dialog.close();
    this.container.replaceChildren();
    this.container.append(this.homeButton);
  }
}
