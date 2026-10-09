"""End-to-end feature-tour run with real GSI DEM/map/aerial tiles in Chromium.
Requires Python Playwright, Chromium, and network access for uncached GSI tiles.
Run: python tests/tour.browser.py
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, math, os, struct, urllib.request, zlib
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('TERRAIN_TOUR_OUTPUT','/tmp/terrain-tour-output'))
OUT.mkdir(parents=True,exist_ok=True)
CACHE=Path('/tmp/terrain-ui-gsi-cache');CACHE.mkdir(exist_ok=True)
def real(url):
    name=hashlib.sha256(url.encode()).hexdigest()
    for cache in [CACHE,Path('/tmp/japan-map-tiles')]:
        file=cache/name
        if file.exists():return file.read_bytes()
    with urllib.request.urlopen(url,timeout=25) as response:payload=response.read()
    (CACHE/name).write_bytes(payload);return payload

def preload_dem(lat,lon,zoom=12):
    x=(lon+180)/360*256*2**zoom;y=(1-math.asinh(math.tan(lat*math.pi/180))/math.pi)/2*256*2**zoom
    half=192;sx=math.floor(x)-half;sy=math.floor(y)-half
    urls=[f'https://cyberjapandata.gsi.go.jp/xyz/dem/{zoom}/{tx}/{ty}.txt'
          for ty in range(int(sy//256),int((sy+2*half)//256)+1)
          for tx in range(int(sx//256),int((sx+2*half)//256)+1)]
    with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(real,urls))

def prefetch_imagery(lat,lon):
    for source,ext,z in [('std','png',13),('seamlessphoto','jpg',13)]:
        world=256*2**12;x=(lon+180)/360*world;y=(1-math.asinh(math.tan(lat*math.pi/180))/math.pi)/2*world
        scale=2;left=(math.floor(x)-192)*scale;top=(math.floor(y)-192)*scale;span=384*scale
        urls=[f'https://cyberjapandata.gsi.go.jp/xyz/{source}/{z}/{tx}/{ty}.{ext}'
              for ty in range(math.floor(top/256),math.ceil((top+span)/256))
              for tx in range(math.floor(left/256),math.ceil((left+span)/256))]
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(real,urls))

for lat,lon in [(33.767,133.115),(35.3606,138.7274)]:
    preload_dem(lat,lon);prefetch_imagery(lat,lon)

# Stable test geology image; DEM, standard maps, and aerial images above are live GSI data.
def png_fixture():
    def chunk(tag,data):return struct.pack('!I',len(data))+tag+data+struct.pack('!I',zlib.crc32(tag+data)&0xffffffff)
    rows=[b'\x00'+b''.join(bytes((40+(x//32)%180,90+(y//32)%140,120,255)) for x in range(256)) for y in range(256)]
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',256,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
GEOLOGY_PNG=png_fixture()
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/'

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--disable-crashpad','--disable-breakpad','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    results=[]
    sizes=[(1440,900,False),(390,844,True),(844,390,True)]
    selected=os.environ.get('TERRAIN_TOUR_VIEWPORTS')
    if selected:sizes=[size for size in sizes if f'{size[0]}x{size[1]}' in selected.split(',')]
    for width,height,touch in sizes:
        page=browser.new_page(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch,device_scale_factor=2 if touch else 1)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        def route(req):
            u=req.request.url
            try:
                if 'gbank.gsj.jp' in u:
                    if 'legend.json' in u:req.fulfill(status=200,body='[]',content_type='application/json',headers={'Access-Control-Allow-Origin':'*'})
                    else:req.fulfill(status=200,body=GEOLOGY_PNG,content_type='image/png',headers={'Access-Control-Allow-Origin':'*'})
                else:req.fulfill(status=200,body=real(u),content_type='image/jpeg' if u.endswith('.jpg') else 'image/png' if u.endswith('.png') else 'text/plain',headers={'Access-Control-Allow-Origin':'*'})
            except Exception as error:req.fulfill(status=404,body=str(error),headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://cyberjapandata.gsi.go.jp/**',route)
        page.route('https://gbank.gsj.jp/**',route)
        page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},get profile(){return profile},get map(){return map},get tour(){return appTour},get loading(){return loading}};",content_type='text/javascript'))
        page.goto(url);page.wait_for_function('window.uiTest && !document.querySelector("#quality").disabled',timeout=120000)
        page.wait_for_function("!uiTest.loading && uiTest.renderer.mesh && document.querySelector('#message').hidden",timeout=120000)
        assert page.locator('#message').is_hidden(),page.locator('#status').inner_text()
        if width==1440:
            page.evaluate("window.tourMetric={heights:[],sun:[],surfaces:[],surfaceTimes:[],modes:[]};document.querySelector('#exaggeration').addEventListener('input',e=>tourMetric.heights.push(+e.target.value));document.querySelector('#sun-azimuth').addEventListener('input',e=>tourMetric.sun.push(+e.target.value));document.querySelector('#surface').addEventListener('change',e=>{tourMetric.surfaces.push(e.target.value);tourMetric.surfaceTimes.push(performance.now())});document.querySelector('#view-mode').addEventListener('change',e=>tourMetric.modes.push(e.target.value));")
            page.locator('#start-app-tour').click()
            page.wait_for_function("document.querySelector('#app-tour-title').textContent==='尾根と谷を立体で眺める'")
            sample=(8,50)
            before=page.evaluate('({yaw:uiTest.renderer.controls.yaw,distance:uiTest.renderer.controls.distance})')
            page.evaluate("window.cameraTrace=[{yaw:uiTest.renderer.controls.yaw,distance:uiTest.renderer.controls.distance}];(function sample(){if(uiTest.tour.active){cameraTrace.push({yaw:uiTest.renderer.controls.yaw,distance:uiTest.renderer.controls.distance});requestAnimationFrame(sample)}})()")
            page.locator('.app-tour-pause').click();paused_yaw=page.evaluate('uiTest.renderer.controls.yaw');page.wait_for_timeout(700)
            assert abs(page.evaluate('uiTest.renderer.controls.yaw')-paused_yaw)<1e-8,'camera must pause with the tour'
            viewer_before=Image.open(BytesIO(page.locator('#viewer').screenshot())).convert('RGB').getpixel(sample)
            page.screenshot(path=str(OUT/'01-desktop-terrain-paused.png'))
            page.locator('.app-tour-pause').click()
            page.wait_for_function("document.querySelector('.app-tour-status').textContent.includes('実演を終えました')",timeout=25000)
            trace=page.evaluate('cameraTrace');assert max(p['yaw'] for p in trace)-min(p['yaw'] for p in trace)>1 and min(p['distance'] for p in trace)<before['distance']*.9
            page.locator('.app-tour-next').click()
            page.wait_for_function("document.querySelector('.app-tour-status').textContent.includes('高さ強調を上げて')",timeout=15000)
            heights=page.evaluate('tourMetric.heights');assert max(heights)>2.9 and min(heights)<1.6
            viewer_during=Image.open(BytesIO(page.locator('#viewer').screenshot())).convert('RGB').getpixel(sample)
            luma=lambda rgb:sum(rgb)/3
            assert luma(viewer_during)>=luma(viewer_before)*.9,(viewer_before,viewer_during,sample)
            page.screenshot(path=str(OUT/'02-desktop-height.png'));page.locator('.app-tour-next').click()
            page.wait_for_function("document.querySelector('.app-tour-status').textContent.includes('斜面の明暗')",timeout=15000)
            sun=page.evaluate('tourMetric.sun');assert max(sun)-min(sun)>150
            page.screenshot(path=str(OUT/'03-desktop-shading.png'));page.locator('.app-tour-next').click()
            page.wait_for_function("document.querySelector('.app-tour-status').textContent.includes('各表示をゆっくり')||document.querySelector('.app-tour-status').textContent.includes('一部の画像')",timeout=90000)
            surfaces=page.evaluate('tourMetric.surfaces');assert surfaces[-6:]==['elevation','shading','map','photo','geology','elevation'],surfaces
            surface_times=page.evaluate('tourMetric.surfaceTimes')[-6:];assert all(b-a>=2300 for a,b in zip(surface_times,surface_times[1:])),surface_times
            assert page.locator('#surface').input_value()=='elevation'
            assert page.evaluate("uiTest.renderer.surface==='elevation'")
            page.screenshot(path=str(OUT/'04-desktop-surfaces.png'));page.locator('.app-tour-next').click()
            assert page.locator('#surface').input_value()=='elevation'
            page.wait_for_function("document.querySelector('.app-tour-status').textContent.includes('切り替えました')",timeout=20000)
            modes=page.evaluate('tourMetric.modes');assert all(name in modes for name in ['mono','parallel','cross','anaglyph']),modes
            assert page.evaluate("uiTest.renderer.mode==='anaglyph'")
            page.screenshot(path=str(OUT/'05-desktop-stereo.png'));page.locator('.app-tour-next').click()
            page.wait_for_function("document.querySelector('.app-tour-status').textContent.includes('等高線を重ね')",timeout=20000)
            assert page.locator('#contours').is_checked() and page.evaluate('uiTest.renderer.contours')
            page.screenshot(path=str(OUT/'06-desktop-contours.png'));page.locator('.app-tour-next').click()
            page.wait_for_function("document.querySelector('#profile-chart').getAttribute('hidden')===null",timeout=25000)
            assert page.evaluate('uiTest.profile.points.length===2 && !uiTest.profile.active')
            page.screenshot(path=str(OUT/'07-desktop-profile.png'));page.locator('.app-tour-next').click()
            page.wait_for_function("Math.abs(uiTest.data.location.latitude-35.3606)<0.0001 && document.querySelector('#message').hidden",timeout=120000)
            page.screenshot(path=str(OUT/'08-desktop-fuji.png'));page.locator('.app-tour-next').click()
            flight_before=page.evaluate('uiTest.renderer.controls.yaw')
            page.wait_for_function("document.querySelector('.app-tour-status').textContent.includes('遊覧飛行を終え')",timeout=25000)
            assert abs(page.evaluate('uiTest.renderer.controls.yaw')-flight_before)>4
            page.screenshot(path=str(OUT/'09-desktop-flight.png'))
            flight_pixel=Image.open(BytesIO(page.locator('#viewer').screenshot())).convert('RGB').getpixel(sample)
            assert luma(flight_pixel)>=luma(viewer_before)*.9,(viewer_before,flight_pixel,'flight')
            page.locator('.app-tour-next').click()
            page.wait_for_function("document.querySelector('#app-tour-title').textContent==='見つけた地形を持ち帰る'")
            page.screenshot(path=str(OUT/'10-desktop-share.png'))
            share_pixel=Image.open(BytesIO(page.locator('#viewer').screenshot())).convert('RGB').getpixel(sample)
            assert luma(share_pixel)>=luma(viewer_before)*.9,(viewer_before,share_pixel,'share')
            page.locator('.app-tour-auto').click()
            page.wait_for_function("!uiTest.tour.active",timeout=15000)
            assert abs(page.evaluate('uiTest.data.location.latitude')-33.767)<.0001
            assert page.evaluate("uiTest.renderer.mode==='mono' && uiTest.renderer.contours===false && document.querySelector('#surface').value==='elevation'")
            assert page.evaluate('uiTest.renderer.gl.getError()')==0
            assert not errors,errors
            results.append({'viewport':'1440x900','allTenDemos':True,'autoFinishedAndRestored':True,'webglError':0,'pageErrors':errors})
        else:
            page.locator('#start-app-tour').click();page.wait_for_function('uiTest.tour.active')
            page.wait_for_timeout(600)
            card=page.locator('.app-tour-card').bounding_box();assert card['height']<height*.52,(width,height,card)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.screenshot(path=str(OUT/f'{width}x{height}-tour-start.png'))
            page.locator('.app-tour-next').click();page.wait_for_function("document.querySelector('#app-tour-title').textContent==='高さを強調して起伏を比べる'")
            page.wait_for_timeout(800)
            scene=page.locator('#viewer').bounding_box();assert page.evaluate("document.body.classList.contains('app-tour-mini-scene')") and scene and scene['height']>40,(width,height,scene)
            for button in ['.app-tour-next','.app-tour-end']:
                box=page.locator(button).bounding_box();assert box and 0<=box['y'] and box['y']+box['height']<=height,(width,height,button,box)
            page.screenshot(path=str(OUT/f'{width}x{height}-tour-height.png'))
            for selector,name in [('#flight-toggle','flight'),('#share-view','share')]:
                assert page.evaluate(f"uiTest.tour.focus('{selector}')")
                assert page.evaluate("document.body.classList.contains('app-tour-mini-scene')"),name
                assert page.evaluate("getComputedStyle(document.querySelector('#viewer')).position==='fixed'"),name
                layout=page.evaluate("({sceneBottom:document.querySelector('#viewer').getBoundingClientRect().bottom,cardTop:document.querySelector('.app-tour-card').getBoundingClientRect().top})")
                assert layout['cardTop']>=layout['sceneBottom']-1,(name,layout)
                page.wait_for_timeout(350)
                page.screenshot(path=str(OUT/f'{width}x{height}-tour-{name}-control.png'))
            page.locator('.app-tour-end').click();page.wait_for_function('!uiTest.tour.active')
            assert not errors,errors
            results.append({'viewport':f'{width}x{height}','tourStartAndManualSkip':True,'cardHeight':card['height'],'pinnedLiveTerrainDuringSettings':True,'pageErrors':errors})
        page.close()
    browser.close();server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('PASS feature tour in Chromium; screenshots and results:',OUT)
