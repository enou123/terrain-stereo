"""Actual offshore 404 regression; Chromium emulation, not iPhone Safari."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread,Lock
from functools import partial
from concurrent.futures import ThreadPoolExecutor
import urllib.request,urllib.error,hashlib,math,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
CACHE=Path('/tmp/terrain-ui-gsi-cache');CACHE.mkdir(exist_ok=True)
MAP_TEST=os.environ.get('TEXTURE_MAP_TEST')=='1'
OUT=ROOT.parent/'terrain-stereo-preview'/('map-texture-coastal' if MAP_TEST else 'surface-coastal');OUT.mkdir(parents=True,exist_ok=True)
fixtures={};lock=Lock()
def get(url):
    with lock:
        if url in fixtures:return fixtures[url]
    file=CACHE/hashlib.sha256(url.encode()).hexdigest()
    try:
        if file.exists():data=file.read_bytes()
        else:
            with urllib.request.urlopen(url,timeout=25) as r:data=r.read()
            file.write_bytes(data)
        result=(200,data)
    except urllib.error.HTTPError as e:
        if e.code!=404:raise
        result=(404,b'')
    with lock:fixtures[url]=result
    return result
lat,lon,z=33.2035,132.1812,9
cx=(lon+180)/360*256*2**z;cy=(1-math.asinh(math.tan(lat*math.pi/180))/math.pi)/2*256*2**z
def tile(z,x,y):
    url=f'https://cyberjapandata.gsi.go.jp/xyz/dem/{z}/{x}/{y}.txt'
    if get(url)[0]==404 and z>6:tile(z-1,x//2,y//2)
jobs=[]
for quality in range(3):
    scale=2**quality;half=192*scale;sx=math.floor(cx)*scale-half;sy=math.floor(cy)*scale-half
    jobs.extend((z+quality,x,y) for y in range(int(sy//256),int((sy+2*half)//256)+1) for x in range(int(sx//256),int((sx+2*half)//256)+1))
with ThreadPoolExecutor(4) as pool:list(pool.map(lambda args:tile(*args),jobs))
print('Real DEM fixtures:',len(fixtures),'404:',sum(code==404 for code,_ in fixtures.values()),flush=True)
if MAP_TEST:
    sx=(math.floor(cx)-192)*2;sy=(math.floor(cy)-192)*2
    images=[f'https://cyberjapandata.gsi.go.jp/xyz/std/10/{x}/{y}.png' for y in range(math.floor(sy/256),math.ceil((sy+768)/256)) for x in range(math.floor(sx/256),math.ceil((sx+768)/256))]
    with ThreadPoolExecutor(4) as pool:list(pool.map(get,images))
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
        page=browser.new_page(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch,device_scale_factor=2 if touch else 1)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        def route(r):
            u=r.request.url
            if '/dem/' in u:
                assert u in fixtures,u
                code,body=fixtures[u]
                r.fulfill(status=code,body=body,headers={'Access-Control-Allow-Origin':'*'})
            elif MAP_TEST and '/std/10/' in u:
                code,body=get(u);r.fulfill(status=code,body=body,content_type='image/png',headers={'Access-Control-Allow-Origin':'*'})
            else:r.fulfill(status=404,body='') # Selection map imagery is outside this focused check.
        page.route('https://cyberjapandata.gsi.go.jp/**',route)
        source=(ROOT/'js/app.js').read_text()
        # Only the initial location is changed in the test-served module.
        source=source.replace('requestedLocation={...LOCATION};','requestedLocation={latitude:33.2035,longitude:132.1812,zoom:9};')
        source+='\nwindow.fallbackTest={get data(){return data},get renderer(){return renderer}};'
        page.route('**/js/app.js*',lambda r:r.fulfill(body=source,content_type='text/javascript'))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.wait_for_function('window.fallbackTest && fallbackTest.data && !document.querySelector("#quality").disabled',timeout=120000)
        if page.locator('#view-settings').is_hidden():page.click('#toggle-settings')
        page.select_option('#surface','map' if MAP_TEST else 'shading')
        if MAP_TEST:page.wait_for_function('fallbackTest.renderer.surface==="map"',timeout=40000)
        page.check('#contours')
        view=page.evaluate('({yaw:fallbackTest.renderer.controls.yaw,pitch:fallbackTest.renderer.controls.pitch,location:fallbackTest.data.location})')
        extent=page.locator('#extent').inner_text()
        for quality in ['high','ultra','standard']:
            page.select_option('#quality',quality)
            page.wait_for_function('(q)=>fallbackTest.data.quality===q&&!document.querySelector("#quality").disabled',arg=quality,timeout=120000)
            assert page.locator('#message').is_hidden(),page.locator('#status').inner_text()
            assert page.locator('#extent').inner_text()==extent
            assert page.evaluate('({yaw:fallbackTest.renderer.controls.yaw,pitch:fallbackTest.renderer.controls.pitch,location:fallbackTest.data.location})')==view
            info=page.evaluate('({fallback:fallbackTest.data.fallbackTileCount,valid:fallbackTest.data.validCount,total:fallbackTest.data.heights.length})')
            if quality=='ultra':
                assert info['fallback']>0
                assert '補完' in page.locator('#quality-guide').inner_text()
            assert 0<info['valid']<info['total'],'Land survives and no-data sea remains absent'
            for mode in ['mono','parallel','cross','anaglyph','mono']:
                page.select_option('#view-mode',mode)
                page.wait_for_function('fallbackTest.renderer.frame===null')
                assert page.evaluate('fallbackTest.renderer.gl.getError()')==0
                assert page.evaluate('(surface)=>fallbackTest.renderer.contours && fallbackTest.renderer.surface===surface','map' if MAP_TEST else 'shading')
            page.locator('#workspace').evaluate('e=>e.scrollIntoView({block:"start"})')
            page.screenshot(path=str(OUT/f'{width}x{height}-{quality}.png'))
        assert not errors,errors
        print('PASS',width,height,'actual coastal 404 fallback, quality and all modes',flush=True)
        page.close()
    browser.close()
server.shutdown()
