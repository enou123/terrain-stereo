"""Real GSI DEM/map landmark checks. GSJ fixtures are explicitly separate.
Requires Chromium, Python Playwright/Pillow and access to GSI tiles.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright
import hashlib,json,math,os,subprocess,urllib.request,urllib.error

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('LANDMARK_OUTPUT',str(ROOT/'docs/screenshots/landmarks')));OUT.mkdir(parents=True,exist_ok=True)
CACHE=Path('/tmp/terrain-ui-gsi-cache');CACHE.mkdir(exist_ok=True)
PLACES=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {LANDMARKS} from './js/landmarks.js';console.log(JSON.stringify(LANDMARKS))"],cwd=ROOT))
failures={}
def real(url):
    file=CACHE/hashlib.sha256(url.encode()).hexdigest()
    if file.exists():return file.read_bytes()
    if url in failures:raise failures[url]
    try:
        with urllib.request.urlopen(url,timeout=25) as response:payload=response.read()
    except Exception as error:failures[url]=error;raise
    file.write_bytes(payload);return payload
def dem_urls(place):
    z=place['settings']['terrain']['zoom'];lat=place['center']['latitude'];lon=place['center']['longitude']
    x=(lon+180)/360*256*2**z;y=(1-math.asinh(math.tan(lat*math.pi/180))/math.pi)/2*256*2**z
    return [f'https://cyberjapandata.gsi.go.jp/xyz/dem/{z}/{tx}/{ty}.txt' for tx in range((math.floor(x)-192)//256,(math.floor(x)+192)//256+1) for ty in range((math.floor(y)-192)//256,(math.floor(y)+192)//256+1)]
def warm(url):
    try:real(url)
    except Exception:pass # Production handles real 404s with its parent fallback.
with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(warm,[u for p in PLACES for u in dem_urls(p)]))
print('Real GSI DEM prefetched for 17 landmarks',flush=True)
# A distinct fixture for UI behavior only. Never a product fallback.
image=Image.new('RGBA',(256,256),(211,177,121,255));buf=BytesIO();image.save(buf,format='PNG');GEO_FIXTURE=buf.getvalue()
ENTRIES=[{'value':'d3b179','symbol':'fixture','title':'テスト用の区分','lithology_ja':'テスト用の岩石','formationAge_ja':'テスト用の年代','group_ja':'テスト用'}]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/'
PRIMARY=['akiyoshidai','aogashima','kurobe','itoigawa','kikaijima','minamidaito']
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--disable-crashpad','--disable-breakpad','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    sizes=[(1440,900,False),(390,844,True),(844,390,True)]
    requested=os.environ.get('LANDMARK_VIEWPORTS')
    if requested:sizes=[s for s in sizes if f'{s[0]}x{s[1]}' in requested.split(',')]
    for width,height,touch in sizes:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch,device_scale_factor=1)
        errors=[];requests=[];geo={'fixture':False};dem_fail={'on':False}
        page.on('pageerror',lambda e:errors.append(str(e)))
        def route(r):
            url=r.request.url;requests.append(url)
            if 'gbank.gsj.jp' in url and geo['fixture']:
                r.fulfill(status=200,body=json.dumps(ENTRIES[0] if 'point=' in url else ENTRIES) if 'legend.json' in url else GEO_FIXTURE,content_type='application/json' if 'legend.json' in url else 'image/png',headers={'Access-Control-Allow-Origin':'*'});return
            if '/dem/' in url and dem_fail['on']:r.fulfill(status=503,body='simulated DEM failure');return
            try:r.fulfill(status=200,body=real(url),content_type='application/json' if 'legend.json' in url else 'text/plain' if '.txt' in url else 'image/png',headers={'Access-Control-Allow-Origin':'*'})
            except Exception as e:r.fulfill(status=getattr(e,'code',502),body=str(e),headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://cyberjapandata.gsi.go.jp/**',route);page.route('https://gbank.gsj.jp/**',route)
        page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},get map(){return map},get guide(){return landmarkGuide},get tour(){return appTour},get loading(){return loading}};",content_type='text/javascript'))
        page.goto(URL);page.wait_for_function("window.uiTest && !uiTest.loading && document.querySelector('#message').hidden",timeout=180000)
        assert page.evaluate('uiTest.data.location.latitude')==33.767
        assert page.locator('#map-place option').count()==18
        page.select_option('#landmark-category','karst');page.select_option('#landmark-region','中国・四国')
        assert page.locator('#map-place option').all_text_contents()==['地図で自由に選択','秋吉台']
        page.select_option('#landmark-category','');page.select_option('#landmark-region','')
        checked=[]
        for place in (PLACES if not touch else [p for p in PLACES if p['id'] in PRIMARY]):
            page.select_option('#map-place',place['id']);assert place['name'] in page.locator('#landmark-preview-title').inner_text()
            if not touch:
                page.locator('.map-shell').scroll_into_view_if_needed();page.wait_for_timeout(150)
                page.locator('.map-shell').screenshot(path=str(OUT/f'{width}x{height}-{place["id"]}-real-map.jpg'),type='jpeg',quality=80)
            page.click('#visit-landmark')
            page.wait_for_function("!uiTest.loading && !document.querySelector('#visit-landmark').disabled && document.querySelector('#landmark-guide-status').textContent.includes('おすすめ設定で表示')",timeout=180000)
            loc=page.evaluate('uiTest.data.location');assert loc['latitude']==place['center']['latitude'] and loc['longitude']==place['center']['longitude'] and loc['zoom']==place['settings']['terrain']['zoom'],(place['id'],loc)
            assert page.locator('#exaggeration').input_value()==str(place['settings']['terrain']['exaggeration']).rstrip('0').rstrip('.')
            assert page.evaluate('uiTest.renderer.surface')==place['settings']['terrain']['surface']
            if touch:page.evaluate("document.querySelector('#toggle-settings').getAttribute('aria-expanded')==='true'&&document.querySelector('#toggle-settings').click()")
            page.locator('#workspace').scroll_into_view_if_needed();page.wait_for_timeout(150)
            bounds=page.evaluate("""async()=>{const r=uiTest.renderer,m=await import('./js/profile.js'),c=r.cameras(undefined,undefined,true)[0];r.draw();const ps=[...new Set(r.mesh.indices)].map(i=>m.projectPoint(Array.from(r.mesh.positions.slice(i*3,i*3+3)),c));return {minX:Math.min(...ps.map(p=>p.x/c.width)),maxX:Math.max(...ps.map(p=>p.x/c.width)),minY:Math.min(...ps.map(p=>p.y/c.height)),maxY:Math.max(...ps.map(p=>p.y/c.height)),minW:Math.min(...ps.map(p=>p.w)),error:r.gl.getError()};}""")
            assert bounds['error']==0 and bounds['minW']>0 and bounds['minX']>=.04 and bounds['maxX']<=.96 and bounds['minY']>=.04 and bounds['maxY']<=.96,(place['id'],bounds)
            assert max(bounds['maxX']-bounds['minX'],bounds['maxY']-bounds['minY'])>.30,(place['id'],'terrain too small',bounds)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            page.locator('#viewer').screenshot(path=str(OUT/f'{width}x{height}-{place["id"]}-real-dem.jpg'),type='jpeg',quality=85)
            if place['id'] in PRIMARY:
                # Capture explanation without obscuring the viewer: both stay in document flow.
                page.locator('#landmark-guide').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{width}x{height}-{place["id"]}-guide.jpg'),type='jpeg',quality=80)
            checked.append({'id':place['id'],'location':loc,'rangeKm':page.evaluate("(uiTest.data.size-1)*uiTest.data.spacing"),'bounds':bounds})
            print(f'PASS {width}x{height} {place["name"]} real GSI terrain',flush=True)
        # Actual network access to GSJ: verify real rendering OR an explicit failure,
        # never equate a fixture success with a live tile success.
        page.locator('#terrain').focus();page.keyboard.press('ArrowRight')
        page.evaluate("document.querySelector('#exaggeration').value='2.3';document.querySelector('#exaggeration').dispatchEvent(new Event('input',{bubbles:true}))")
        before=page.evaluate("JSON.stringify({location:uiTest.data.location,yaw:uiTest.renderer.controls.yaw,pitch:uiTest.renderer.controls.pitch,distance:uiTest.renderer.controls.distance,target:uiTest.renderer.controls.target,height:document.querySelector('#exaggeration').value,quality:uiTest.data.quality})")
        page.click('[data-landmark-mode=geology]');page.wait_for_function("!document.querySelector('[data-landmark-mode=geology]').disabled",timeout=60000)
        live=page.evaluate('uiTest.renderer.surface')=='geology'
        if not live:assert '取得できません' in page.locator('#landmark-guide-status').inner_text() and page.evaluate('uiTest.renderer.surface')=='elevation'
        assert page.evaluate("JSON.stringify({location:uiTest.data.location,yaw:uiTest.renderer.controls.yaw,pitch:uiTest.renderer.controls.pitch,distance:uiTest.renderer.controls.distance,target:uiTest.renderer.controls.target,height:document.querySelector('#exaggeration').value,quality:uiTest.data.quality})")==before
        assert page.locator('#landmark-age').inner_text()
        # Explicit fixture phase: legend, point selection and mode UI only.
        geo['fixture']=True
        page.click('[data-landmark-mode=terrain]');page.wait_for_function("!document.querySelector('[data-landmark-mode=terrain]').disabled")
        page.click('[data-landmark-mode=geology]');page.wait_for_function("!document.querySelector('[data-landmark-mode=geology]').disabled && uiTest.renderer.surface==='geology'",timeout=60000)
        page.click('#landmark-show-geology-key');page.wait_for_function("document.querySelector('#geology-legend-list').children.length>0")
        assert 'テスト用の岩石' in page.locator('#geology-legend-list').inner_text()
        page.locator('#landmark-guide').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{width}x{height}-geology-ui-FIXTURE.jpg'),type='jpeg',quality=80)
        # The demonstration tour temporarily leaves the chosen landmark and
        # filters, then restores its complete guide state with the original DEM.
        page.select_option('#landmark-category','karst');page.select_option('#landmark-region','中国・四国');page.select_option('#map-place','akiyoshidai');page.click('#visit-landmark')
        page.wait_for_function("!document.querySelector('#visit-landmark').disabled && uiTest.guide.active?.id==='akiyoshidai'")
        page.click('#start-app-tour');page.wait_for_function("document.querySelector('.app-tour-count').textContent==='1 / 10'")
        for step in range(2,9):
            page.click('.app-tour-next');page.wait_for_function(f"document.querySelector('.app-tour-count').textContent==='{step} / 10'")
        page.wait_for_function("!uiTest.loading && uiTest.data.location.latitude===35.3606",timeout=180000)
        page.click('.app-tour-end');page.wait_for_function('!uiTest.tour.active',timeout=180000)
        assert page.evaluate('uiTest.guide.active.id')=='akiyoshidai' and page.locator('#landmark-category').input_value()=='karst' and page.locator('#landmark-region').input_value()=='中国・四国'
        assert page.evaluate('uiTest.data.location.latitude')==34.25
        # Free map selection retains manual settings and removes the named guide.
        page.evaluate("uiTest.map.setView({latitude:33.767,longitude:133.115},11)");page.click('#show-terrain');page.wait_for_function("!uiTest.loading && document.querySelector('#message').hidden",timeout=180000)
        assert page.locator('#landmark-guide').is_hidden()
        # A failed new DEM must keep the last successful place, then allow retry.
        if not touch:
            last_location=page.evaluate('uiTest.data.location')
            page.select_option('#landmark-category','');page.select_option('#landmark-region','')
            dem_fail['on']=True;page.select_option('#map-place','kurobe');page.click('#visit-landmark')
            page.wait_for_function("!uiTest.loading && !document.querySelector('#visit-landmark').disabled && document.querySelector('#message').classList.contains('error')",timeout=60000)
            assert page.evaluate('uiTest.data.location')==last_location
            assert '読み込めません' in page.locator('#landmark-preview-setting').inner_text()
            dem_fail['on']=False;page.click('#visit-landmark');page.wait_for_function("!uiTest.loading && !document.querySelector('#visit-landmark').disabled && document.querySelector('#message').hidden",timeout=180000)
            assert page.evaluate('uiTest.data.location.latitude')==36.67
        # Known landmark shared links still own all initial camera/settings.
        page.goto(URL+'?lat=34.25&lon=131.31&z=12&yaw=1.2&pitch=.6&dist=24&h=1.1&surface=shading&mode=cross&quality=standard')
        page.wait_for_function("window.uiTest && !uiTest.loading && document.querySelector('#message').hidden",timeout=180000)
        assert page.evaluate('uiTest.renderer.controls.yaw')==1.2 and page.locator('#exaggeration').input_value()=='1.1' and page.evaluate('uiTest.renderer.mode')=='cross'
        assert page.locator('#landmark-guide').is_hidden()
        assert not errors,errors
        results.append({'viewport':f'{width}x{height}','realGSI':checked,'liveGSJ':live,'GSJFixtureOnly':'legend and UI tests; separate from real data','sharedLinkPriority':True,'freeMapSelection':True,'tourRestoresLandmarkAndFilters':True,'pageErrors':errors})
        page.close()
    browser.close();server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('PASS landmark browser checks:',OUT,flush=True)
