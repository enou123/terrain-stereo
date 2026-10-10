"""Render every marine preset against recovered GMRT grids in Chromium."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import hashlib, json, os, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'work'/'marine-regions-browser'; OUT.mkdir(parents=True,exist_ok=True)
CACHE=Path('/tmp/terrain-ui-gsi-cache'); CACHE.mkdir(exist_ok=True)

def gsi_response(url):
    path=CACHE/hashlib.sha256(url.encode()).hexdigest()
    if path.with_suffix('.404').exists(): return 404,b''
    if path.exists(): return 200,path.read_bytes()
    try:
        with urllib.request.urlopen(url,timeout=30) as response: body=response.read()
        path.write_bytes(body); return 200,body
    except urllib.error.HTTPError as error:
        if error.code==404: path.with_suffix('.404').touch(); return 404,b''
        raise

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/'
hook='''window.marineTest={get data(){return data},get renderer(){return renderer},get busy(){return loading||bathymetryController!==null},get guide(){return landmarkGuide}};'''
capture_ids={'sea-torishima','sea-izu-bonin-wide','sea-kikai-caldera','sea-okinawa-trough','sea-japan-trench','sea-suruga-sagami'}
mobile_ids={'sea-torishima','sea-izu-bonin-wide','sea-japan-trench'}
results=[]

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info'])
    marine_ids=None
    for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,is_mobile=touch,has_touch=touch)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.route('https://**/*',lambda route:route.abort())
        page.route('**/js/app.js*',lambda route:route.fulfill(body=(ROOT/'js/app.js').read_text()+hook,content_type='text/javascript'))
        def route_gsi(route):
            url=route.request.url
            if '/dem/' not in url: route.fulfill(status=404,body=''); return
            status,body=gsi_response(url);route.fulfill(status=status,body=body,headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://cyberjapandata.gsi.go.jp/**',route_gsi)
        page.goto(base,wait_until='domcontentloaded')
        page.wait_for_function('window.marineTest&&!marineTest.busy&&marineTest.data',timeout=120000)
        if marine_ids is None:
            marine_ids=page.evaluate("async()=>((await import('/js/bathymetry-spots.js')).BATHYMETRY_SPOTS).map(s=>s.id)")
            assert len(marine_ids)==30, len(marine_ids)
        ids=marine_ids if not touch else [i for i in marine_ids if i in mobile_ids]
        for index,spot_id in enumerate(ids,1):
            page.select_option('#map-place',spot_id)
            page.click('#visit-landmark')
            page.wait_for_function("!marineTest.busy&&marineTest.data?.bathymetry?.seaCount>0",timeout=120000)
            state=page.evaluate('''()=>({id:marineTest.guide.snapshot().id,location:marineTest.data.location,seaCount:marineTest.data.bathymetry.seaCount,seaMin:marineTest.data.bathymetry.seaMin,grids:marineTest.data.bathymetry.grids.map(x=>x.id),gl:marineTest.renderer.gl.getError(),triangles:marineTest.renderer.count/3})''')
            assert state['id']==spot_id and state['seaCount']>0 and state['gl']==0 and state['triangles']>50000,(spot_id,state)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),spot_id
            if not touch and spot_id in capture_ids: page.locator('#terrain').screenshot(path=str(OUT/f'{width}x{height}-{spot_id}.png'))
            if touch and spot_id in mobile_ids: page.locator('#terrain').screenshot(path=str(OUT/f'{width}x{height}-{spot_id}.png'))
            result={'viewport':[width,height],'spot':spot_id,'regions':state['grids'],'seaSamples':state['seaCount'],'deepestM':round(-state['seaMin']),'triangles':state['triangles'],'glError':state['gl']}
            results.append(result);print('PASS',json.dumps(result,ensure_ascii=False),flush=True)
        assert not errors,errors
        page.close()
    browser.close()
server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('PASS all marine spots in desktop; selected priorities in mobile portrait and landscape; results:',OUT/'results.json')
