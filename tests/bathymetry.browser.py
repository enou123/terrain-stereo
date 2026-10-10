"""Actual GMRT snapshot + official GSI DEM; Chromium mobile emulation, not Safari."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from concurrent.futures import ThreadPoolExecutor
import json,hashlib,urllib.request,urllib.error,time,math,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT.parent/'work'/'bathymetry-browser';OUT.mkdir(parents=True,exist_ok=True)
CACHE=Path('/tmp/terrain-ui-gsi-cache');CACHE.mkdir(exist_ok=True)
def real(url):
 p=CACHE/hashlib.sha256(url.encode()).hexdigest()
 if p.with_suffix('.404').exists():return 404,b''
 if p.exists():return 200,p.read_bytes()
 try:
  with urllib.request.urlopen(url,timeout=25) as r:b=r.read()
  p.write_bytes(b);return 200,b
 except urllib.error.HTTPError as e:
  if e.code!=404:raise
  p.with_suffix('.404').touch();return 404,b''
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
hook='''
window.bathyTest={get data(){return data},get land(){return landData},get renderer(){return renderer},get busy(){return loading||bathymetryController!==null},get guide(){return landmarkGuide},async location(lat,lon,z,q='standard'){requestedLocation={latitude:lat,longitude:lon,zoom:z};requestedQuality=q;qualitySelect.value=q;resetView=false;return load()},async texture(){return texturePromise},async profile(){return getProfileTool()},share(){return createShareUrl(location.href,{location:data.location,camera:cameraPose(),exaggeration:Number(slider.value),mode:modeSelect.value,quality:data.quality,surface:surfaceSelect.value,strength:Number(strengthSlider.value),contours:contoursToggle.checked,contourInterval:Number(contourIntervalSelect.value),sunAzimuth:Number(sunAzimuth.value),sunAltitude:Number(sunAltitude.value),bathymetry:bathymetryToggle.checked})}};
'''
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-precise-memory-info'])
 for w,h,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
  page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=touch,has_touch=touch)
  errors=[];requests=[];page.on('pageerror',lambda err:errors.append(str(err)))
  page.on('request',lambda req:requests.append(req.url) if '/data/bathymetry/' in req.url else None)
  page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+hook,content_type='text/javascript'))
  def gsi(r):
   u=r.request.url
   if '/dem/' not in u:r.fulfill(status=404,body='');return
   code,b=real(u);r.fulfill(status=code,body=b,headers={'Access-Control-Allow-Origin':'*'})
  page.route('https://cyberjapandata.gsi.go.jp/**',gsi)
  t=time.monotonic();page.goto(url+'?lat=32.457&lon=139.762&z=12&pitch=.72&yaw=.38&dist=19&h=1.5');page.wait_for_function('window.bathyTest&&!bathyTest.busy&&bathyTest.data',timeout=120000)
  off_time=time.monotonic()-t;assert not requests,requests
  if page.locator('#view-settings').is_hidden():page.click('#toggle-settings')
  before=page.evaluate('''(()=>{const r=bathyTest.renderer;r.draw();window.landBefore=r.mesh.positions.slice();window.poseBefore=JSON.stringify({yaw:r.controls.yaw,pitch:r.controls.pitch,distance:r.controls.distance,target:r.controls.target});return {vertices:bathyTest.data.heights.length,triangles:r.count/3,heap:performance.memory?.usedJSHeapSize}})()''')
  page.locator('#terrain').screenshot(path=str(OUT/f'{w}x{h}-off.png'))
  t=time.monotonic();page.locator('#bathymetry').check();page.wait_for_function('bathyTest.data.bathymetry&&!bathyTest.busy',timeout=45000)
  on_time=time.monotonic()-t
  stats=page.evaluate('''(()=>{const d=bathyTest.data,r=bathyTest.renderer;r.draw();if(JSON.stringify({yaw:r.controls.yaw,pitch:r.controls.pitch,distance:r.controls.distance,target:r.controls.target})!==window.poseBefore)throw Error('camera changed');for(let i=0;i<d.heights.length;i++)if(Number.isFinite(bathyTest.land.heights[i]))for(let k=0;k<3;k++)if(r.mesh.positions[i*3+k]!==landBefore[i*3+k])throw Error('land position changed');return {sea:d.bathymetry,vertices:d.heights.length,triangles:r.count/3,heap:performance.memory?.usedJSHeapSize,glError:r.gl.getError()}})()''')
  assert stats['sea']['seaCount']>10000 and stats['sea']['seaMin']<-500 and stats['glError']==0,stats
  assert len(requests)==2,requests
  page.locator('#terrain').screenshot(path=str(OUT/f'{w}x{h}-on.png'))
  page.locator('#bathymetry-settings').scroll_into_view_if_needed()
  page.screenshot(path=str(OUT/f'{w}x{h}-settings.png'))
  if page.locator('#view-settings').is_hidden():page.click('#toggle-settings')
  for _ in range(3):
   page.locator('#bathymetry').uncheck();page.wait_for_function('!bathyTest.data.bathymetry');assert page.evaluate('bathyTest.renderer.seabedBuffer===null')
   page.locator('#bathymetry').check();page.wait_for_function('bathyTest.data.bathymetry&&!bathyTest.busy')
  assert len(requests)==2,'uncached toggle requests'
  # Stereo + contours + height preserve the geographic grid and depths.
  for mode in ['parallel','cross','anaglyph','mono']:
   page.select_option('#view-mode',mode);assert page.evaluate('bathyTest.renderer.gl.getError()')==0
  page.check('#contours');page.select_option('#contour-interval','200')
  page.locator('#exaggeration').evaluate("e=>{e.value='2';e.dispatchEvent(new Event('input',{bubbles:true}))}")
  assert page.evaluate('bathyTest.data.bathymetry.seaMin')==stats['sea']['seaMin']
  # Water remains blue when a land surface is changed to shading.
  page.select_option('#surface','shading');assert page.evaluate('bathyTest.data.bathymetry.seaCount')>0
  tool_stats=page.evaluate('''async()=>{const tool=await bathyTest.profile();tool.points=[{u:.1,v:.5},{u:.9,v:.5}];tool.drawChart();return {text:document.querySelector('#profile-status').textContent,shown:!document.querySelector('#profile-chart').hidden}}''')
  assert tool_stats['shown'],tool_stats
  page.evaluate('bathyTest.profile().then(p=>p.clear())')
  # Short flight test: manual orbit/zoom must continue while flight is active.
  page.click('#flight-toggle');page.click('#tour-toggle');page.click('[data-flight-laps="infinite"]');page.wait_for_timeout(300)
  assert '連続' in page.locator('#flight-toggle').inner_text()
  page.locator('#terrain').evaluate("e=>e.dispatchEvent(new WheelEvent('wheel',{deltaY:-30,bubbles:true,cancelable:true}))")
  page.wait_for_timeout(200);assert '停止' in page.locator('#flight-toggle').inner_text();page.click('#flight-toggle')
  # Sharing restores sea state and the view; old links remain off.
  shared_url=page.evaluate('bathyTest.share()');assert 'sea=1' in shared_url
  # Same source across qualities, no new bathymetry requests.
  if not touch:
   for q in ['high','ultra']:
    ok=page.evaluate('(q)=>bathyTest.location(32.457,139.762,12,q)',q);assert ok
    page.wait_for_function('!bathyTest.busy');assert page.evaluate('bathyTest.data.bathymetry.metadata.actualSpacingMeters[0]')>200
    assert len(requests)==2
    page.locator('#terrain').screenshot(path=str(OUT/f'{w}x{h}-{q}-on.png'))
  # A shared link restores the actual source and settings in a fresh document.
  if not touch:
   page.goto(shared_url);page.wait_for_function('window.bathyTest&&!bathyTest.busy&&bathyTest.data?.bathymetry',timeout=120000)
   assert page.is_checked('#bathymetry')
   # A wholly offshore view uses numeric GMRT, even with no valid GSI land.
   assert page.evaluate('bathyTest.location(32.459,139.65,14)')
   assert page.evaluate('bathyTest.data.bathymetry.seaCount')>30000
  # Outside supported range: report explicitly, no bathymetry network.
  assert page.evaluate('bathyTest.location(33.767,133.115,12)');assert not page.evaluate('!!bathyTest.data.bathymetry')
  assert '未対応' in page.locator('#bathymetry-status').inner_text();assert len(requests)==(4 if not touch else 2)
  assert not errors,errors
  results.append(dict(viewport=[w,h],offInitialSeconds=off_time,onSeconds=on_time,off=before,on=stats,requests=len(requests),errors=errors))
  print('PASS',w,h,json.dumps({'on':stats['sea']['stats'],'offSeconds':off_time,'onSeconds':on_time,'landPreserved':True},ensure_ascii=False),flush=True)
  page.close()
 # A failed fetch must preserve land and expose retry; an OFF during a delayed
 # real response must never apply the stale sea mesh.
 page=browser.new_page(viewport={'width':1440,'height':900})
 page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+hook,content_type='text/javascript'))
 page.route('https://cyberjapandata.gsi.go.jp/**',gsi)
 page.route('**/data/bathymetry/*.bin',lambda r:r.fulfill(status=503,body='unavailable'))
 page.goto(url+'?lat=32.457&lon=139.762&z=12');page.wait_for_function('window.bathyTest&&!bathyTest.busy&&bathyTest.data',timeout=120000)
 page.check('#bathymetry');page.wait_for_function('!bathyTest.busy');assert not page.evaluate('!!bathyTest.data.bathymetry')
 assert '503' in page.locator('#bathymetry-status').inner_text();assert page.is_visible('#bathymetry-retry')
 page.unroute('**/data/bathymetry/*.bin')
 page.click('#bathymetry-retry');page.wait_for_function('bathyTest.data.bathymetry&&!bathyTest.busy')
 page.reload();page.wait_for_function('window.bathyTest&&!bathyTest.busy&&bathyTest.data')
 def delayed(r):
  page.locator('#bathymetry').evaluate("e=>{e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}))}")
  r.continue_()
 page.route('**/data/bathymetry/*.bin',delayed)
 page.check('#bathymetry');page.wait_for_timeout(500)
 assert not page.evaluate('!!bathyTest.data.bathymetry');assert page.evaluate('bathyTest.renderer.seabedBuffer===null')
 print('PASS failure/retry and stale OFF cancellation',flush=True)
 page.close()
 browser.close()
server.shutdown();(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
