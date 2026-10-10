"""End-to-end real GMRT wide grid, real GSI land and responsive Chromium rendering."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import hashlib,urllib.request,urllib.error,json,os,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT.parent/'work'/'bathymetry-wide';OUT.mkdir(parents=True,exist_ok=True);CACHE=Path('/tmp/terrain-ui-gsi-cache');CACHE.mkdir(exist_ok=True)
def response(url):
 p=CACHE/hashlib.sha256(url.encode()).hexdigest()
 if p.with_suffix('.404').exists():return 404,b''
 if p.exists():return 200,p.read_bytes()
 try:
  with urllib.request.urlopen(url,timeout=30) as r:b=r.read()
  p.write_bytes(b);return 200,b
 except urllib.error.HTTPError as e:
  if e.code==404:p.with_suffix('.404').touch();return 404,b''
  raise
class QuietHandler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
hook='''window.wideTest={get data(){return data},get land(){return landData},get renderer(){return renderer},get busy(){return loading||bathymetryController!==null},share(){const c=renderer.controls;return createShareUrl(location.href,{location:data.location,camera:{yaw:c.yaw,pitch:c.pitch,distance:c.distance,target:c.target},exaggeration:Number(slider.value),mode:modeSelect.value,quality:data.quality,surface:surfaceSelect.value,strength:Number(strengthSlider.value),contours:contoursToggle.checked,contourInterval:Number(contourIntervalSelect.value),sunAzimuth:Number(sunAzimuth.value),sunAltitude:Number(sunAltitude.value),bathymetry:bathymetryToggle.checked})}};'''
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info'])
 for w,h,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
  page=browser.new_page(viewport={'width':w,'height':h},is_mobile=touch,has_touch=touch);errors=[];sea_requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:sea_requests.append(r.url) if '/data/bathymetry/' in r.url else None)
  page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+hook,content_type='text/javascript'))
  def gsi(route):
   u=route.request.url
   if '/dem/' not in u:route.fulfill(status=404,body='');return
   code,b=response(u);route.fulfill(status=code,body=b,headers={'Access-Control-Allow-Origin':'*'})
  page.route('https://cyberjapandata.gsi.go.jp/**',gsi)
  page.goto(base);page.wait_for_function('window.wideTest&&!wideTest.busy&&wideTest.data',timeout=120000)
  if page.locator('#view-settings').is_hidden():page.click('#toggle-settings')
  off_bytes=len(sea_requests);assert off_bytes==0;heap_before=page.evaluate('performance.memory?.usedJSHeapSize')
  t=time.monotonic();page.click('#bathymetry-archipelago');page.wait_for_function("!wideTest.busy&&wideTest.data?.bathymetry?.metadata.id==='hachijo-aogashima'",timeout=120000)
  elapsed=time.monotonic()-t;d=page.evaluate('''(()=>{const d=wideTest.data,r=wideTest.renderer;return {location:d.location,quality:d.quality,vertices:d.heights.length,landSamples:(()=>{const val=(lat,lon)=>{const z=d.location.zoom,S=256*2**z,px=(lon+180)/360*S,py=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*S,cx=(d.location.longitude+180)/360*S,cy=(1-Math.asinh(Math.tan(d.location.latitude*Math.PI/180))/Math.PI)/2*S,col=Math.round((px-cx+192)/2),row=Math.round((py-cy+192)/2);return d.heights[row*d.size+col]};return {hachijoFuji:val(33.139,139.7667),aogashima:val(32.457,139.76)}})(),stats:d.bathymetry,glError:r.gl.getError(),legend:getComputedStyle(document.querySelector('#bathymetry-colorbar')).background,legendShown:!document.querySelector('#bathymetry-info').hidden}})()''')
  assert d['location']['zoom']==9 and d['stats']['seaCount']>10000 and d['glError']==0 and d['legendShown'],d
  assert d['landSamples']['hachijoFuji']>500 and d['landSamples']['aogashima']>200,d['landSamples']
  assert page.evaluate('wideTest.renderer.count/3')==73728,'Unexpected mesh holes or triangles'
  assert len(sea_requests)==2,sea_requests
  page.locator('#terrain').screenshot(path=str(OUT/f'{w}x{h}-wide.png'))
  if not touch:
   share_url=page.evaluate('wideTest.share()');share=browser.new_page(viewport={'width':w,'height':h},is_mobile=touch,has_touch=touch);share_errors=[];share.on('pageerror',lambda e:share_errors.append(str(e)))
   share.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+hook,content_type='text/javascript'))
   share.route('https://cyberjapandata.gsi.go.jp/**',gsi);share.goto(share_url)
   share.wait_for_function("window.wideTest&&!wideTest.busy&&wideTest.data?.bathymetry?.metadata.id==='hachijo-aogashima'",timeout=120000)
   assert share.evaluate('wideTest.data.location.latitude')==32.78 and share.evaluate('wideTest.data.location.longitude')==139.78 and share.is_checked('#bathymetry') and not share_errors,share_errors
   share.close()
  page.locator('#bathymetry-colorbar').scroll_into_view_if_needed()
  page.screenshot(path=str(OUT/f'{w}x{h}-legend.png'))
  # Narrow preset reuses only the existing 0.52MB tile; the wide tile remains cached.
  page.click('#bathymetry-aogashima');page.wait_for_function("!wideTest.busy&&wideTest.data?.bathymetry?.metadata.id==='aogashima'",timeout=120000)
  assert len(sea_requests)==4,sea_requests
  page.locator('#terrain').screenshot(path=str(OUT/f'{w}x{h}-narrow.png'))
  page.click('#bathymetry-hachijo');page.wait_for_function("!wideTest.busy&&wideTest.data?.bathymetry?.metadata.id==='hachijo-aogashima'",timeout=120000)
  assert page.evaluate('wideTest.data.location.zoom')==12
  if (w,h)==(1440,900):page.locator('#terrain').screenshot(path=str(OUT/f'{w}x{h}-hachijo.png'))
  page.click('#bathymetry-archipelago');page.wait_for_function("!wideTest.busy&&wideTest.data?.bathymetry?.metadata.id==='hachijo-aogashima'",timeout=120000)
  assert len(sea_requests)==4,'cached wide grid re-downloaded'
  page.locator('#bathymetry').uncheck();assert page.locator('#bathymetry-info').is_hidden()
  page.locator('#bathymetry').check();page.wait_for_function('!wideTest.busy&&wideTest.data?.bathymetry',timeout=120000)
  assert len(sea_requests)==4,'OFF/ON data cache miss'
  assert not errors,errors
  results.append({'viewport':[w,h],'wideRenderSeconds':elapsed,'gridBytes':d['stats']['stats']['bytes'],'gridRequests':2,'seaVertices':d['stats']['seaCount'],'jsHeapBeforeBytes':heap_before,'jsHeapBytes':page.evaluate('performance.memory?.usedJSHeapSize'),'meshTriangles':page.evaluate('wideTest.renderer.count/3'),'legend':d['legend'],'errors':errors})
  print('PASS',w,h,json.dumps(results[-1],ensure_ascii=False),flush=True);page.close()
 browser.close()
server.shutdown();(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
