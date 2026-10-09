"""Section selection and chart regression: real DEM, Chromium, touch emulation."""
from pathlib import Path
exec(Path(__file__).with_name('texture.browser.py').read_text().split('with sync_playwright() as p:')[0])
OUT=ROOT.parent/'terrain-stereo-preview'/'section-phase-1';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 results=[]
 for width,height in [(1440,900),(320,568),(390,844),(844,390),(667,375)]:
  page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<1000,is_mobile=width<1000,device_scale_factor=2 if width<1000 else 1)
  modules=[];page.on('request',lambda r:modules.append(r.url) if '/js/' in r.url else None)
  errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   requests.append(r.request.url)
   try:r.fulfill(body=real(r.request.url),content_type='image/jpeg' if r.request.url.endswith('.jpg') else 'image/png' if r.request.url.endswith('.png') else 'text/plain',headers={'Access-Control-Allow-Origin':'*'})
   except Exception:r.fulfill(status=404,body='')
  page.route('https://cyberjapandata.gsi.go.jp/**',route)
  page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},set data(value){data=value},get profile(){return profile},get map(){return map}};",content_type='text/javascript'))
  page.goto(url);page.wait_for_function('window.uiTest && !document.querySelector("#quality").disabled',timeout=120000)
  assert page.locator('#message').is_hidden()
  assert not any('/profile' in u for u in modules)
  def settings():
   if page.locator('#view-settings').is_hidden():page.click('#toggle-settings')
  def point(u,v,pane=0):
   return page.evaluate('''async ([u,v,pane])=>{const m=await import('./js/profile.js?v=0.12.0'),r=uiTest.renderer;r.draw();const p=m.projectPoint(m.gridPosition(r.mesh,{u,v}),r.cameras(undefined,undefined,true)[pane]),box=r.canvas.getBoundingClientRect();return {x:box.left+p.x*box.width/r.canvas.width,y:box.top+p.y*box.height/r.canvas.height};}''',[u,v,pane])
  def tap(u,v,pane=0):
   q=point(u,v,pane)
   if width<1000:page.touchscreen.tap(q['x'],q['y'])
   else:page.mouse.click(q['x'],q['y'])
  settings();dem=sum('/dem/' in u for u in requests);page.click('#profile-start');page.wait_for_function('uiTest.profile?.active')
  page.screenshot(path=str(OUT/f'{width}x{height}-selection-prompt.png'))
  page.locator('#terrain').dispatch_event('pointerdown',{'pointerType':'mouse','button':2,'pointerId':99})
  # Drag must rotate without choosing an endpoint.
  q=point(.5,.5);before=page.evaluate('uiTest.renderer.controls.yaw')
  page.mouse.move(q['x'],q['y']);page.mouse.down();page.mouse.move(q['x']+30,q['y']+10,steps=4);page.mouse.up()
  assert page.evaluate('uiTest.profile.points.length')==0
  assert page.evaluate('uiTest.renderer.controls.yaw')!=before
  page.mouse.click(q['x'],q['y'],button='middle');assert page.evaluate('uiTest.profile.points.length')==0
  if width<1000:
   session=page.context.new_cdp_session(page)
   session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':q['x']-20,'y':q['y'],'id':1},{'x':q['x']+20,'y':q['y'],'id':2}]})
   session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':q['x']-30,'y':q['y']+8,'id':1},{'x':q['x']+30,'y':q['y']+8,'id':2}]})
   session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   assert page.evaluate('uiTest.profile.points.length')==0
   session.detach()
  page.evaluate('uiTest.renderer.reset()');page.wait_for_timeout(150)
  # Background must not invent an elevation.
  box=page.locator('#terrain').bounding_box();page.mouse.click(box['x']+4,box['y']+100)
  assert page.evaluate('uiTest.profile.points.length')==0
  page.click('#profile-cancel')
  for mode in ['mono','parallel','cross','anaglyph','mono']:
   settings();page.select_option('#view-mode',mode);page.click('#profile-start');page.wait_for_timeout(100)
   tap(.3,.6)
   assert page.evaluate('uiTest.profile.points.length')==1,(width,height,mode,page.locator('#profile-instruction').inner_text())
   tap(.7,.6,1 if mode in ['parallel','cross'] else 0)
   page.wait_for_function('uiTest.profile.points.length===2 && !uiTest.profile.active')
   assert page.locator('#profile-chart').is_visible()
   points=page.evaluate('uiTest.profile.points')
   assert abs(points[0]['u']-.3)<1e-4 and abs(points[1]['u']-.7)<1e-4,points
   assert abs(points[0]['v']-.6)<1e-4 and abs(points[1]['v']-.6)<1e-4,points
   section=page.evaluate('JSON.stringify(uiTest.profile.result)')
   # Height/camera/surface affect view, not real profile.
   page.locator('#exaggeration').evaluate("e=>{e.value='3';e.dispatchEvent(new Event('input',{bubbles:true}));}")
   page.select_option('#surface','shading');page.check('#contours')
   page.evaluate('uiTest.renderer.controls.yaw+=.7;uiTest.renderer.controls.pitch=1;uiTest.renderer.requestDraw()')
   page.wait_for_timeout(100);assert page.evaluate('JSON.stringify(uiTest.profile.result)')==section
   page.locator('#profile-section').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{width}x{height}-{mode}-chart.png'))
   page.click('#toggle-settings');page.locator('#terrain').scroll_into_view_if_needed();page.wait_for_timeout(100)
   count=page.locator('#profile-overlay circle').count();assert count==(4 if mode in ['parallel','cross'] else 2)
   page.screenshot(path=str(OUT/f'{width}x{height}-{mode}-terrain.png'))
   page.evaluate('uiTest.renderer.reset()');page.wait_for_timeout(100)
  assert sum('/dem/' in u for u in requests)==dem
  if width in [1440,390]:
   settings();old=page.evaluate('uiTest.profile.points');page.select_option('#quality','high')
   page.wait_for_function('!document.querySelector("#quality").disabled',timeout=120000)
   assert page.evaluate('uiTest.profile.points')==old and page.evaluate('uiTest.profile.data.size')==385
   assert page.evaluate('uiTest.profile.result.samples.length')>100
  if width==1440:
   unchanged=page.evaluate('JSON.stringify(uiTest.profile.result)');page.select_option('#surface','photo');page.wait_for_function('uiTest.renderer.surface==="photo"',timeout=40000)
   assert page.evaluate('JSON.stringify(uiTest.profile.result)')==unchanged
   saved=page.evaluate('JSON.stringify(uiTest.profile.result)');old=page.evaluate('uiTest.profile.points')
   page.route('**/xyz/dem/**',lambda r:r.fulfill(status=503,body=''))
   page.select_option('#quality','ultra');page.wait_for_function('!document.querySelector("#quality").disabled',timeout=120000)
   assert not page.locator('#message').is_hidden()
   assert page.evaluate('uiTest.profile.points')==old and page.evaluate('JSON.stringify(uiTest.profile.result)')==saved
   page.unroute('**/xyz/dem/**');page.select_option('#quality','standard');page.wait_for_function('!document.querySelector("#quality").disabled',timeout=120000)
   assert page.locator('#message').is_hidden()
  # Expanded display and portrait/landscape rotation retain section and settings.
  page.click('#expand-view');saved=page.evaluate('JSON.stringify(uiTest.profile.result)')
  page.set_viewport_size({'width':height,'height':width});page.wait_for_timeout(200)
  assert page.evaluate('JSON.stringify(uiTest.profile.result)')==saved
  settings();page.locator('#profile-section').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{width}x{height}-rotated-expanded.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.click('#profile-start');page.wait_for_timeout(100);page.locator('#terrain').press('Escape')
  assert not page.evaluate('uiTest.profile.active') and page.locator('#profile-overlay').is_hidden()
  # Enter chooses the visible central terrain; cancel/clear leave orbit usable.
  settings();page.click('#profile-start');page.locator('#terrain').press('Enter');assert page.evaluate('uiTest.profile.points.length')==1
  page.click('#profile-cancel');assert page.evaluate('uiTest.profile.points.length')==0
  if width==1440:
   page.click('#profile-start');page.locator('#terrain').press('Enter');page.locator('#terrain').press('ArrowLeft');page.locator('#terrain').press('Enter')
   assert page.evaluate('uiTest.profile.points.length')==2
   page.click('#expand-view');page.click('#back-to-map');page.select_option('#map-place','fuji');page.click('#show-terrain')
   page.wait_for_function('!document.querySelector("#quality").disabled',timeout=120000)
   assert page.evaluate('uiTest.profile.points.length')==0
  # Synthetic coastal gap: actual taps must reject missing terrain and graph must split.
  # Starting the tool synchronizes it with app data. Install the fixture there
  # as well as in the renderer, so the real DEM cannot replace the missing gap.
  page.evaluate("""async ()=>{const {createMesh}=await import('./js/mesh.js?v=0.12.0');const r=uiTest.renderer;window.sectionFixture={size:9,spacing:1,location:uiTest.data.location,heights:new Float32Array(81)};for(let row=0;row<9;row++)for(let c=0;c<9;c++)sectionFixture.heights[row*9+c]=c===4?NaN:100+c*30;uiTest.data=sectionFixture;r.setMesh(createMesh(sectionFixture,1));r.reset();r.controls.pitch=1.1;r.requestDraw();uiTest.profile.setData(sectionFixture);} """)
  settings();page.click('#profile-start');page.wait_for_timeout(100)
  tap(.5,.6);assert page.evaluate('uiTest.profile.points.length')==0
  tap(.1,.6);tap(.9,.6)
  if page.evaluate('uiTest.profile.points.length')!=2:
   print('gap selection',width,page.evaluate('({points:uiTest.profile.points,prompt:document.querySelector("#profile-instruction").textContent})'),flush=True);page.screenshot(path=str(OUT/f'{width}-failure.png'))
  page.wait_for_function('uiTest.profile.points.length===2')
  assert page.evaluate('uiTest.profile.result.samples.some(p=>!Number.isFinite(p.height))')
  assert page.locator('#profile-chart path').get_attribute('d').count('M')>=2
  page.locator('#profile-section').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{width}x{height}-missing-gap.png'))
  # A retained endpoint can become missing when DEM quality changes.
  page.evaluate("""async ()=>{const {createMesh}=await import('./js/mesh.js?v=0.12.0');const tool=uiTest.profile;tool.data.heights[37]=NaN;uiTest.renderer.setMesh(createMesh(tool.data,1));tool.setData(tool.data);uiTest.renderer.draw();}""")
  assert page.locator('#profile-overlay circle').count()==1
  assert 'A：データなし' in page.locator('#profile-status').inner_text()
  page.click('#profile-clear');assert page.locator('#profile-chart').is_hidden() and page.locator('#profile-overlay').is_hidden()
  assert not errors,errors
  assert page.evaluate('uiTest.renderer.gl.getError()')==0
  results.append({'viewport':f'{width}x{height}','allModes':True,'accurateSelection':True,'dragNotSelection':True,'heightInvariant':True,'rotationRetained':True,'errors':errors})
  print('PASS section',width,height,flush=True);page.close()
 browser.close();server.shutdown();(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
