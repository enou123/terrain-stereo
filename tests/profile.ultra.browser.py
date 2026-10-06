"""Highest-quality section picking with real GSI DEM and 32-bit mesh indices."""
from pathlib import Path
exec(Path(__file__).with_name('texture.browser.py').read_text().split('with sync_playwright() as p:')[0])
preload(33.767,133.115,quality=2)
OUT=ROOT.parent/'terrain-stereo-preview'/'section-ultra';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 results=[]
 for width,height in [(1440,900),(390,844)]:
  page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<1000,is_mobile=width<1000,device_scale_factor=2 if width<1000 else 1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   try:r.fulfill(body=real(r.request.url),content_type='image/png' if r.request.url.endswith('.png') else 'text/plain',headers={'Access-Control-Allow-Origin':'*'})
   except Exception:r.fulfill(status=404,body='')
  page.route('https://cyberjapandata.gsi.go.jp/**',route)
  page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},get profile(){return profile}};",content_type='text/javascript'))
  page.goto(url);page.wait_for_function('window.uiTest && !document.querySelector("#quality").disabled',timeout=120000)
  page.select_option('#quality','ultra');page.wait_for_function('!document.querySelector("#quality").disabled',timeout=120000)
  assert page.locator('#message').is_hidden()
  assert page.evaluate('uiTest.data.size')==769
  assert page.evaluate('uiTest.renderer.mesh.indices instanceof Uint32Array')
  # Look down steeply so both known reference points are visible, not hidden by nearer ridges.
  page.evaluate('uiTest.renderer.controls.pitch=1.3;uiTest.renderer.requestDraw()')
  page.click('#profile-start');page.wait_for_function('uiTest.profile?.active')
  for u in [.3,.7]:
   q=page.evaluate('''async u=>{const m=await import('./js/profile.js?v=0.12.0'),r=uiTest.renderer;r.draw();const p=m.projectPoint(m.gridPosition(r.mesh,{u,v:.7}),r.cameras()[0]),box=r.canvas.getBoundingClientRect();return {x:box.left+p.x*box.width/r.canvas.width,y:box.top+p.y*box.height/r.canvas.height};}''',u)
   if width<1000:page.touchscreen.tap(q['x'],q['y'])
   else:page.mouse.click(q['x'],q['y'])
  page.wait_for_function('uiTest.profile.points.length===2')
  for expected,hit in zip([.3,.7],page.evaluate('uiTest.profile.points')):
   assert abs(hit['u']-expected)<1e-4 and abs(hit['v']-.7)<1e-4,hit
  assert page.locator('#profile-chart').is_visible()
  page.locator('#profile-section').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{width}x{height}.png'))
  assert not errors,errors
  assert page.evaluate('uiTest.renderer.gl.getError()')==0
  results.append({'viewport':f'{width}x{height}','grid':769,'indices32bit':True,'sectionPicked':True,'errors':errors})
  print('PASS ultra section',width,height,flush=True);page.close()
 browser.close();server.shutdown();(OUT/'results.json').write_text(json.dumps(results,indent=2))
