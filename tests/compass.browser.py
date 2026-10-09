"""Clickable compass: real GSI DEM, north-up overhead and centered in Chromium/WebGL."""
from pathlib import Path
exec(Path(__file__).with_name('landmarks.browser.py').read_text().split('with sync_playwright() as p:')[0])
OUT=ROOT/'docs/screenshots/compass';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for w,h,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
  page=browser.new_page(viewport={'width':w,'height':h},is_mobile=touch,has_touch=touch);errors=[];dem=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if '/dem/' in r.request.url:
    dem.append(r.request.url)
    try:r.fulfill(status=200,body=real(r.request.url),content_type='text/plain',headers={'Access-Control-Allow-Origin':'*'})
    except Exception as e:r.fulfill(status=getattr(e,'code',502),body=str(e))
   else:
    f=CACHE/hashlib.sha256(r.request.url.encode()).hexdigest();r.fulfill(status=200 if f.exists() else 404,body=f.read_bytes() if f.exists() else b'',content_type='image/png')
  page.route('https://cyberjapandata.gsi.go.jp/**',route)
  page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},get busy(){return rangeBusy||loading},get base(){return viewRangeBase}};",content_type='text/javascript'))
  page.goto(URL);page.wait_for_function('window.uiTest&&uiTest.data&&!uiTest.busy',timeout=180000)
  page.evaluate("document.querySelector('#toggle-settings').getAttribute('aria-expanded')==='true'&&document.querySelector('#toggle-settings').click()")
  page.locator('#workspace').evaluate("e=>e.scrollIntoView({block:'start',behavior:'instant'})");page.wait_for_timeout(300)
  initial=page.evaluate('uiTest.data.location');count=len(dem)
  modes=['mono','parallel','cross','anaglyph'] if not touch else ['mono']
  for mode in modes:
   page.evaluate("mode=>{const s=document.querySelector('#view-mode');s.value=mode;s.dispatchEvent(new Event('change'));Object.assign(uiTest.renderer.controls,{yaw:1.6,pitch:.5,distance:9,target:[3,2,-2]});uiTest.renderer.requestDraw()}",mode)
   page.wait_for_timeout(150)
   button=page.locator('.compass-control').nth(1 if mode=='cross' else 0)
   if touch:button.tap()
   else:button.click()
   page.wait_for_timeout(150)
   pose=page.evaluate('({yaw:uiTest.renderer.controls.yaw,pitch:uiTest.renderer.controls.pitch,target:uiTest.renderer.controls.target})')
   assert pose['yaw']==0 and pose['pitch']==math.pi/2 and pose['target'][0]==0 and pose['target'][2]==0,pose
   geometry=page.evaluate("""async()=>{const r=uiTest.renderer; r.draw();const {projectPoint}=await import('./js/profile.js');const c=r.cameras(undefined,undefined,true)[0];const center=projectPoint(r.controls.target,c);const points=Array.from(new Set(r.mesh.indices),i=>projectPoint([...r.mesh.positions.slice(i*3,i*3+3)],c));return {center:[center.x/c.width,center.y/c.height],minX:Math.min(...points.map(p=>p.x/c.width)),maxX:Math.max(...points.map(p=>p.x/c.width)),minY:Math.min(...points.map(p=>p.y/c.height)),maxY:Math.max(...points.map(p=>p.y/c.height)),finite:[...c.view,...c.projection].every(Number.isFinite),error:r.gl.getError()}}""")
   assert geometry['finite'] and geometry['error']==0
   assert all(abs(v-.5)<1e-6 for v in geometry['center']),geometry
   assert geometry['minX']>=.04 and geometry['maxX']<=.96 and geometry['minY']>=.04 and geometry['maxY']<=.96,geometry
   assert page.evaluate('uiTest.data.location')==initial and len(dem)==count
   page.screenshot(path=str(OUT/f'{w}x{h}-{mode}.png'))
  # Native keyboard activation and ordinary camera controls after the reset.
  page.locator('.compass-control').first.focus();page.keyboard.press('Space')
  page.locator('#terrain').focus();before_view=page.evaluate('Array.from(uiTest.renderer.cameras()[0].view)');page.keyboard.press('ArrowLeft');assert page.evaluate('Array.from(uiTest.renderer.cameras()[0].view)')!=before_view
  page.keyboard.press('ArrowDown');assert page.evaluate('uiTest.renderer.controls.pitch')<math.pi/2
  page.locator('.compass-control').first.click();assert page.evaluate('uiTest.renderer.controls.pitch')==math.pi/2
  page.click('#flight-toggle');page.click('#tour-toggle');page.wait_for_timeout(300)
  page.locator('.compass-control').first.click();assert page.locator('#tour-toggle').get_attribute('aria-pressed')=='false'
  assert page.evaluate('uiTest.renderer.controls.pitch')==math.pi/2 and not errors,errors
  print(f'PASS {w}x{h}: compass click/tap, north, exact overhead, center/fit, no DEM fetch, stereo, keyboard, flight stop',flush=True)
  page.close()
 browser.close()
server.shutdown()
