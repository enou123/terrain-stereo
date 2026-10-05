"""UI regression checks using actual GSI tiles and Chromium, not iPhone Safari.
Requires Python Playwright and Chromium; no server or npm dependencies needed.
Run: python tests/ui.browser.py
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
ARTIFACTS=ROOT.parent/'terrain-stereo-preview'/'ui-phase-1';ARTIFACTS.mkdir(parents=True,exist_ok=True)
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
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    results=[]
    for width,height,touch in [(1440,900,False),(1024,768,False),(768,1024,True),(320,568,True),(390,844,True),(844,390,True),(932,430,True),(667,375,True)]:
        page=browser.new_page(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch,device_scale_factor=2 if touch else 1)
        errors=[];dem=[];fail={'enabled':False}
        page.on('pageerror',lambda error:errors.append(str(error)))
        def route(request):
            u=request.request.url
            if '/dem/' in u:
                dem.append(u)
                if fail['enabled']:request.fulfill(status=503,body='');return
            try:request.fulfill(status=200,body=real(u),content_type='image/png' if u.endswith('.png') else 'text/plain',headers={'Access-Control-Allow-Origin':'*'})
            except Exception as error:request.fulfill(status=404,body=str(error))
        page.route('https://cyberjapandata.gsi.go.jp/**',route)
        # Expose existing objects only inside this test to verify view/data preservation.
        page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},get map(){return map}};",content_type='text/javascript'))
        page.goto(url)
        page.wait_for_function("window.uiTest && !document.querySelector('#quality').disabled",timeout=120000)
        assert page.locator('#message').is_hidden(),page.locator('#status').inner_text()
        def state():return page.evaluate('({target:uiTest.renderer.controls.target.slice(),yaw:uiTest.renderer.controls.yaw,pitch:uiTest.renderer.controls.pitch,distance:uiTest.renderer.controls.distance,location:uiTest.data.location,quality:uiTest.data.quality,mode:uiTest.renderer.mode,strength:uiTest.renderer.strength,height:document.querySelector("#exaggeration").value})')
        def stable():
            page.wait_for_function("(()=>{const c=document.querySelector('#terrain'),r=Math.min(devicePixelRatio,2);return c.width===Math.round(c.clientWidth*r)&&c.height===Math.round(c.clientHeight*r)})()")
            assert page.evaluate("uiTest.renderer.gl.getError()") == 0
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        landscape=width>height and height<=600 and width<=1100
        assert page.locator('#toggle-settings').get_attribute('aria-expanded')==('false' if landscape else 'true')
        page.locator('#workspace').evaluate("element=>element.scrollIntoView({block:'start',behavior:'instant'})");stable()
        page.screenshot(path=str(ARTIFACTS/f'{width}x{height}-normal.png'))
        canvas=page.locator('#terrain').bounding_box()
        if landscape:
            assert canvas['width']>=width*.9
            assert canvas['height']>=height*.75
        for button in ['#toggle-settings','#expand-view','#back-to-map']:
            assert page.locator(button).bounding_box()['height']>=44
        if page.locator('#view-settings').is_hidden():page.click('#toggle-settings')
        page.select_option('#view-mode','parallel')
        page.locator('#exaggeration').fill('2');page.locator('#exaggeration').dispatch_event('input')
        before=state();count=len(dem)
        page.set_viewport_size({'width':height,'height':width});stable()
        expected_closed=height>width and width<=600 and height<=1100
        assert page.locator('#toggle-settings').get_attribute('aria-expanded')==('false' if expected_closed else 'true')
        assert state()==before and len(dem)==count
        page.set_viewport_size({'width':width,'height':height});stable()
        assert state()==before and len(dem)==count
        page.click('#expand-view');stable()
        assert page.locator('#view-settings').is_hidden()
        assert page.locator('#workspace').get_attribute('aria-modal')=='true'
        assert page.evaluate("document.querySelector('#place-picker').inert")
        assert state()==before and len(dem)==count
        canvas=page.locator('#terrain').bounding_box()
        assert canvas['width']>=width*.98 and canvas['height']>=height-70
        # Actual mouse and touch input; pan/rotation/zoom must still operate in expanded view.
        x=canvas['x']+canvas['width']*.45;y=canvas['y']+canvas['height']*.5
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+25,y+15);page.mouse.up()
        assert state()['yaw']!=before['yaw']
        rotated=state();page.mouse.move(x,y);page.mouse.down(button='middle');page.mouse.move(x+20,y+10);page.mouse.up(button='middle')
        assert state()['target']!=rotated['target'] and state()['yaw']==rotated['yaw']
        distance=state()['distance'];page.mouse.wheel(0,-60);assert state()['distance']<distance
        if touch:
            cdp=page.context.new_cdp_session(page)
            start=state()
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':0}]})
            cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+20,'y':y+10,'id':0}]})
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            assert state()['yaw']!=start['yaw']
            start=state()
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x-30,'y':y,'id':0},{'x':x+30,'y':y,'id':1}]})
            cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-45,'y':y+10,'id':0},{'x':x+45,'y':y+10,'id':1}]})
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            assert state()['distance']!=start['distance'] and state()['target']!=start['target']
        moved=state();page.set_viewport_size({'width':height,'height':width});stable()
        assert state()==moved and len(dem)==count
        page.set_viewport_size({'width':width,'height':height});stable()
        page.click('#toggle-settings');assert page.locator('#view-settings').is_visible()
        for mode in ['mono','parallel','cross','anaglyph']:
            page.select_option('#view-mode',mode);page.wait_for_timeout(100);stable()
        page.select_option('#view-mode','mono')
        # Panel scroll and reset button remain usable, including short landscape screens.
        page.click('#reset');assert state()['distance']==19
        page.click('#toggle-settings')
        page.locator('#expand-view').focus();page.keyboard.press('Tab')
        assert page.evaluate('document.activeElement.id')=='terrain'
        page.locator('#terrain').focus();page.keyboard.press('Tab')
        assert page.evaluate('document.activeElement.id')=='back-to-map'
        page.keyboard.press('Shift+Tab');assert page.evaluate('document.activeElement.id')=='terrain'
        page.keyboard.press('Escape');assert page.locator('#workspace').get_attribute('aria-modal') is None
        assert not page.evaluate("document.querySelector('#place-picker').inert")
        assert page.evaluate('document.activeElement.id')=='expand-view'
        # Re-enter, take reviewable screenshots and verify returning to the map.
        page.click('#expand-view');stable();page.screenshot(path=str(ARTIFACTS/f'{width}x{height}-expanded.png'))
        page.click('#toggle-settings');page.screenshot(path=str(ARTIFACTS/f'{width}x{height}-settings.png'))
        page.click('#back-to-map');assert not page.evaluate("document.body.classList.contains('view-focused')")
        assert page.evaluate('document.activeElement.id')=='place-picker'
        if (width,height)==(390,844):
            # New location, loading failure/retry and quality are existing features, also exercised.
            page.select_option('#map-place','fuji');fail['enabled']=True
            page.click('#show-terrain');page.wait_for_function("!document.querySelector('#quality').disabled")
            assert page.locator('#message').is_visible() and '503' in page.locator('#status').inner_text()
            fail['enabled']=False;page.click('#retry');page.wait_for_function("document.querySelector('#message').hidden")
            assert state()['location']['latitude']==35.3606
            page.select_option('#map-place','ishizuchi');page.click('#show-terrain');page.wait_for_function("document.querySelector('#message').hidden")
            page.select_option('#quality','high');page.wait_for_function("!document.querySelector('#quality').disabled")
            assert page.locator('#message').is_hidden() and state()['quality']=='high'
            high=state();page.click('#expand-view');stable();assert state()==high
            page.click('#back-to-map')
            # Map pan/zoom is still functional and does not itself request DEM.
            count=len(dem);coord=page.locator('#selected-location').inner_text()
            page.locator('#location-map').focus();page.keyboard.press('ArrowRight')
            assert coord!=page.locator('#selected-location').inner_text()
            extent=page.locator('#selected-extent').inner_text();page.click('#map-zoom-out')
            assert extent!=page.locator('#selected-extent').inner_text() and len(dem)==count
        assert not errors,errors
        results.append({'viewport':f'{width}x{height}','touch_emulation':touch,'passed':True})
        print('PASS',width,height,'layout, settings, focus, resizing, stereo and existing controls',flush=True)
        page.close()
    browser.close()
server.shutdown()
(ARTIFACTS/'results.json').write_text(json.dumps(results,indent=2))
print('Screenshots and results:',ARTIFACTS)
