export const BUILDING_TILES_URL = 'https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/all-bldg-lod1-latest/tileset.json';
const TERRAIN_URL = 'https://tile.plateauview.mlit.go.jp/terrain';
const ORTHO_URL = 'https://tile.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/{z}/{x}/{y}.png';
const GSI_IMAGERY_URL = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
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
      destination: C.Cartesian3.fromDegrees(this.location.longitude, this.location.latitude, this.initialHeight),
      orientation: { heading: 0, pitch: C.Math.toRadians(-80), roll: 0 }, duration: 1
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
    this.status.textContent = '地形・航空写真・建物モデルを読み込んでいます…';
    try {
      const C = await loadCesium();
      if (request !== this.request) return;
      this.status.textContent = '全国の建物と地形を読み込んでいます…';
      let tileFailed = false;
      let buildingVisible = false;
      const baseImagery = new C.UrlTemplateImageryProvider({
        url: GSI_IMAGERY_URL, maximumLevel: 18, tilingScheme: new C.WebMercatorTilingScheme()
      });
      const mobile = matchMedia('(max-width: 700px)').matches || (window.deviceMemory && window.deviceMemory <= 4);
      const viewer = this.viewer = new C.Viewer(this.container, {
        baseLayer: false, terrainProvider: new C.EllipsoidTerrainProvider(),
        animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
        homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, selectionIndicator: false, infoBox: false
        // Cesium's demand-render mode can leave the globe quadtree idle while terrain and
        // imagery providers settle (especially inside a newly opened mobile dialog).
        // Keep the modal rendering so terrain/imagery tiles are selected and requested.
      });
      viewer.resolutionScale = Math.min(1, 1 / (window.devicePixelRatio || 1));
      viewer.scene.globe.baseColor = C.Color.fromCssColorString('#71836a');
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.maximumScreenSpaceError = mobile ? 5 : 4;
      viewer.scene.backgroundColor = C.Color.fromCssColorString('#172e24');
      viewer.imageryLayers.addImageryProvider(baseImagery);
      let baseImageryFailed = false;
      baseImagery.errorEvent.addEventListener(() => {
        if (request !== this.request || baseImageryFailed) return;
        baseImageryFailed = true;
        this.status.textContent = '地表地図タイルを取得できません。建物表示は続けますが、地面が暗く見えることがあります。';
      });
      viewer.scene.renderError.addEventListener(() => {
        if (request !== this.request) return;
        this.status.textContent = '都市3Dの描画に失敗しました。閉じてから再度お試しください。';
      });

      // Imagery and elevation are independent optional layers. Either may fail while buildings remain usable.
      // Keep the lightweight GSI basemap underneath; PLATEAU Ortho can be unavailable.
      try {
        const imagery = new C.UrlTemplateImageryProvider({
          url: ORTHO_URL, maximumLevel: 19, tilingScheme: new C.WebMercatorTilingScheme()
        });
        const imageryLayer = viewer.imageryLayers.addImageryProvider(imagery);
        let imageryFailed = false;
        imagery.errorEvent.addEventListener(() => {
          if (request !== this.request || imageryFailed) return;
          imageryFailed = true;
          // Stop requesting thousands of failed aerial-photo tiles; GSI remains underneath.
          viewer.imageryLayers.remove(imageryLayer, false);
          if (!buildingVisible) this.status.textContent = '航空写真を取得できません。地理院地図と地形・建物の表示を続けます。';
        });
      } catch { /* Keep the terrain and buildings available if imagery setup fails. */ }
      C.CesiumTerrainProvider.fromUrl(TERRAIN_URL, { requestVertexNormals: true }).then(terrain => {
        if (request !== this.request) return;
        let terrainFailed = false;
        terrain.errorEvent.addEventListener(() => {
          if (request !== this.request || terrainFailed) return;
          terrainFailed = true;
          // A provider can load layer.json successfully while its terrain tiles fail.
          // Keep the globe renderable so the GSI imagery layer can serve as the base map.
          viewer.terrainProvider = new C.EllipsoidTerrainProvider();
          viewer.scene.requestRender();
          if (!buildingVisible) this.status.textContent = '地形タイルを取得できません。地理院地図と建物の表示を続けます。';
        });
        viewer.terrainProvider = terrain;
        viewer.scene.requestRender();
        if (!buildingVisible) this.status.textContent = '地形を表示中です。建物モデルを読み込んでいます…';
      }).catch(() => {
        if (request === this.request && !buildingVisible) this.status.textContent = '地形データを取得できません。地理院地図と建物の表示を続けます。';
      });
      this.status.textContent = '地形・航空写真を表示しています。建物モデルを読み込んでいます…';
      this.timer = setTimeout(() => {
        if (request === this.request && !buildingVisible) this.status.textContent = '建物データの応答を待っています。地形・航空写真は操作できます。少し待つか、別の場所へ移動してください。';
      }, 45000);
      const tilesetOptions = {
        maximumScreenSpaceError: mobile ? 80 : 60,
        cacheBytes: (mobile ? 32 : 64) * 1024 * 1024,
        maximumCacheOverflowBytes: (mobile ? 16 : 32) * 1024 * 1024
      };
      C.Cesium3DTileset.fromUrl(BUILDING_TILES_URL, tilesetOptions).then(tiles => {
        if (request !== this.request) { tiles.destroy(); return; }
        viewer.scene.primitives.add(tiles);
        this.status.textContent = '建物モデルを読み込んでいます… 表示範囲内に建物がない場合は、地形・画像だけを表示します。';
        tiles.tileFailed.addEventListener(() => {
          if (request !== this.request) return;
          tileFailed = true;
          this.status.textContent = '建物タイルの一部を取得できません。地形・航空写真の表示は続きます。';
        });
        tiles.tileVisible.addEventListener(() => {
          if (request !== this.request || tileFailed) return;
          buildingVisible = true;
          clearTimeout(this.timer);
          this.status.textContent = 'PLATEAU LOD1 · ドラッグで移動、右ドラッグで回転、ホイールで拡大。選択地へ戻るには「選択地」ボタン。';
        });
      }).catch(error => {
        if (request !== this.request) return;
        clearTimeout(this.timer);
        this.status.textContent = `建物データに接続できません（${error.message || '通信エラー'}）。地形・航空写真は表示を続けます。`;
      });
      this.initialHeight = mobile ? 3500 : 4500;
      viewer.camera.setView({
        destination: C.Cartesian3.fromDegrees(location.longitude, location.latitude, this.initialHeight),
        orientation: { heading: 0, pitch: C.Math.toRadians(-85), roll: 0 }
      });
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
