"""Map/aerial texture regression using actual GSI tiles and Chromium, not iPhone Safari.
Requires Python Playwright and Chromium; no server or npm dependencies needed.
Run: python tests/texture.browser.py
Aerial: TEXTURE_SURFACE=photo python tests/texture.browser.py
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from concurrent.futures import ThreadPoolExecutor
import hashlib, math, os, urllib.request, json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
CACHE=Path('/tmp/terrain-ui-gsi-cache');CACHE.mkdir(exist_ok=True)
SURFACE=os.environ.get('TEXTURE_SURFACE','map')
SOURCE='seamlessphoto' if SURFACE=='photo' else 'std'
EXT='jpg' if SURFACE=='photo' else 'png'
ARTIFACTS=ROOT.parent/'terrain-stereo-preview'/f'{SURFACE}-texture-phase-1';ARTIFACTS.mkdir(parents=True,exist_ok=True)
def real(url):
    name=hashlib.sha256(url.encode()).hexdigest()
    for cache in [CACHE,Path('/tmp/japan-map-tiles')]:
        file=cache/name
        if file.exists():return file.read_bytes()
    with urllib.request.urlopen(url,timeout=25) as response:payload=response.read()
    (CACHE/name).write_bytes(payload)
    return payload
def preload(latitude,longitude,zoom=12,quality=0):
    # Production sampling is already covered by Node tests. These bounds preload fixtures.
    scale=2**quality;z=min(14,zoom+quality)
    x=(longitude+180)/360*256*2**zoom
    y=(1-math.asinh(math.tan(latitude*math.pi/180))/math.pi)/2*256*2**zoom
    half=192*scale;sx=math.floor(x)*scale-half;sy=math.floor(y)*scale-half
    urls=[f'https://cyberjapandata.gsi.go.jp/xyz/dem/{z}/{tx}/{ty}.txt'
          for ty in range(int(sy//256),int((sy+2*half)//256)+1)
          for tx in range(int(sx//256),int((sx+2*half)//256)+1)]
    with ThreadPoolExecutor(max_workers=4) as executor:list(executor.map(real,urls))
for lat,lon,quality in [(33.767,133.115,0),(33.767,133.115,1),(35.3606,138.7274,0)]:preload(lat,lon,quality=quality)
# Fetch map fixtures before browser execution so synchronous routing cannot delay DEM.
map_urls=[]
for lat,lon in [(33.767,133.115),(35.3606,138.7274)]:
    for z in [10,11]:
        x=(lon+180)/360*2**z;y=(1-math.asinh(math.tan(lat*math.pi/180))/math.pi)/2*2**z
        map_urls.extend(f'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{tx}/{ty}.png'
            for tx in range(math.floor(x)-4,math.floor(x)+5)
            for ty in range(math.floor(y)-4,math.floor(y)+5))
with ThreadPoolExecutor(max_workers=12) as executor:list(executor.map(real,map_urls))
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'

# Prefetch the atlas tiles at the production image zoom, with verified TLS.
for lat,lon in [(33.767,133.115),(35.3606,138.7274)]:
    z=13;scale=2
    x=(lon+180)/360*256*2**12;y=(1-math.asinh(math.tan(lat*math.pi/180))/math.pi)/2*256*2**12
    left=(math.floor(x)-192)*scale;top=(math.floor(y)-192)*scale;span=384*scale
    urls=[f'https://cyberjapandata.gsi.go.jp/xyz/{SOURCE}/{z}/{tx}/{ty}.{EXT}' for ty in range(math.floor(top/256),math.ceil((top+span)/256)) for tx in range(math.floor(left/256),math.ceil((left+span)/256))]
    with ThreadPoolExecutor(max_workers=4) as executor:list(executor.map(real,urls))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    results=[]
    for width,height,touch in [(1440,900,False),(1024,768,False),(768,1024,True),(320,568,True),(390,844,True),(844,390,True),(932,430,True),(667,375,True)]:
        page=browser.new_page(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch,device_scale_factor=2 if touch else 1)
        errors=[];requests=[];failure={'on':False}
        page.on('pageerror',lambda e:errors.append(str(e)))
        def route(r):
            u=r.request.url;requests.append(u)
            if failure['on'] and f'/{SOURCE}/13/' in u:r.fulfill(status=503,body='',headers={'Access-Control-Allow-Origin':'*'});return
            try:r.fulfill(status=200,body=real(u),content_type='image/jpeg' if u.endswith('.jpg') else 'image/png' if u.endswith('.png') else 'text/plain',headers={'Access-Control-Allow-Origin':'*'})
            except Exception as e:r.fulfill(status=404,body=str(e),headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://cyberjapandata.gsi.go.jp/**',route)
        page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},get map(){return map}};",content_type='text/javascript'))
        page.goto(url);page.wait_for_function("window.uiTest && !document.querySelector('#quality').disabled",timeout=120000)
        assert page.locator('#message').is_hidden()
        assert not any(f'/{SOURCE}/13/' in u for u in requests),'Atlas must be lazy'
        if page.locator('#surface').is_hidden():page.click('#toggle-settings')
        if width==1440:
            # Hold image fetches to exercise cancellation and timeout without real waits.
            page.evaluate("""window.savedFetch=window.fetch;window.pendingImages=0;window.fetch=(u,o)=>{
              if(!String(u).includes('/ATLAS_SOURCE/13/'))return savedFetch(u,o);
              pendingImages++;return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>{pendingImages--;reject(new DOMException('Aborted','AbortError'))},{once:true}));
            };""".replace("ATLAS_SOURCE",SOURCE))
            page.select_option('#surface',SURFACE);page.wait_for_function(f'pendingImages==={8 if SURFACE=="photo" else 4}')
            page.select_option('#surface','shading');page.wait_for_function('pendingImages===0')
            assert page.locator('#texture-retry').is_hidden() and page.evaluate('uiTest.renderer.surface')=='shading'
            page.evaluate('window.savedTimeout=window.setTimeout;window.setTimeout=(f,t,...a)=>savedTimeout(f,t===25000?50:t,...a)')
            page.select_option('#surface',SURFACE);page.wait_for_function("!document.querySelector('#texture-retry').hidden")
            assert 'タイムアウト' in page.locator('#texture-status').inner_text()
            page.select_option('#surface','elevation');page.evaluate('window.fetch=savedFetch;window.setTimeout=savedTimeout')
        before=page.evaluate('JSON.stringify(uiTest.renderer.controls.target)+uiTest.renderer.controls.yaw+uiTest.renderer.controls.pitch+uiTest.renderer.controls.distance')
        dem=sum('/dem/' in u for u in requests)
        failure['on']=True;page.select_option('#surface',SURFACE)
        page.wait_for_function("!document.querySelector('#texture-retry').hidden",timeout=40000)
        assert page.locator('#message').is_hidden() and page.evaluate('uiTest.renderer.surface')=='elevation'
        assert '503' in page.locator('#texture-status').inner_text()
        failure['on']=False;page.click('#texture-retry')
        page.wait_for_function(f"uiTest.renderer.surface==='{SURFACE}'",timeout=40000)
        assert sum('/dem/' in u for u in requests)==dem
        assert before==page.evaluate('JSON.stringify(uiTest.renderer.controls.target)+uiTest.renderer.controls.yaw+uiTest.renderer.controls.pitch+uiTest.renderer.controls.distance')
        assert page.locator('#elevation-legend').is_hidden()
        page.check('#contours');page.locator('#exaggeration').evaluate("e=>{e.value='2';e.dispatchEvent(new Event('input',{bubbles:true}))}")
        assert page.evaluate('uiTest.renderer.surface')==SURFACE
        image_count=len(requests)
        for surface in ['shading','elevation',SURFACE]:
            page.select_option('#surface',surface)
            page.wait_for_function('uiTest.renderer.frame===null')
        assert len(requests)==image_count,'Cached atlas switch must not fetch'
        for mode in ['mono','parallel','cross','anaglyph','mono']:
            page.select_option('#view-mode',mode);page.wait_for_function('uiTest.renderer.frame===null')
            assert page.evaluate('uiTest.renderer.gl.getError()')==0
            assert page.evaluate('uiTest.renderer.surface')==SURFACE
            page.click('#toggle-settings');page.locator('#workspace').evaluate('e=>e.scrollIntoView({block:"start"})')
            page.screenshot(path=str(ARTIFACTS/f'{width}x{height}-{mode}.png'));page.click('#toggle-settings')
        page.click('#toggle-settings');page.click('#expand-view')
        page.locator('#terrain').focus();page.keyboard.press('ArrowLeft');page.keyboard.press('ArrowUp')
        page.wait_for_function('uiTest.renderer.frame===null')
        yaw=page.evaluate('uiTest.renderer.controls.yaw')
        page.set_viewport_size({'width':height,'height':width});page.wait_for_function('uiTest.renderer.frame===null')
        assert page.evaluate('uiTest.renderer.surface')==SURFACE and page.evaluate('uiTest.renderer.controls.yaw')==yaw
        page.screenshot(path=str(ARTIFACTS/f'{width}x{height}-rotated.png'))
        page.set_viewport_size({'width':width,'height':height});page.wait_for_function('uiTest.renderer.frame===null')
        page.screenshot(path=str(ARTIFACTS/f'{width}x{height}-expanded.png'))
        page.click('#toggle-settings');page.screenshot(path=str(ARTIFACTS/f'{width}x{height}-settings.png'))
        if width in [1440,390]:
            count=len(requests);page.select_option('#quality','high')
            page.wait_for_function("!document.querySelector('#quality').disabled",timeout=120000)
            page.wait_for_function(f"uiTest.renderer.surface==='{SURFACE}'")
            assert not any(f'/{SOURCE}/13/' in u for u in requests[count:]),'DEM quality must reuse image'
            page.click('#expand-view');page.evaluate('uiTest.map.setCenter({latitude:35.3606,longitude:138.7274})');page.click('#show-terrain')
            page.wait_for_function("!document.querySelector('#quality').disabled",timeout=120000)
            page.wait_for_function(f"uiTest.renderer.surface==='{SURFACE}'",timeout=40000)
            assert page.evaluate('uiTest.data.location.latitude')==35.3606
            page.screenshot(path=str(ARTIFACTS/f'{width}x{height}-fuji.png'))
        assert not errors,errors
        assert page.evaluate('uiTest.renderer.gl.getError()')==0
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        results.append({'viewport':f'{width}x{height}','passed':True})
        print('PASS',SURFACE,'texture',width,height,flush=True);page.close()
    (ARTIFACTS/'results.json').write_text(json.dumps(results,indent=2));browser.close()
server.shutdown()
