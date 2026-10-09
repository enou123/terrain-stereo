"""Real GSI DEM range commits; desktop and iPhone-size Chromium/WebGL."""
from pathlib import Path
exec(Path(__file__).with_name('landmarks.browser.py').read_text().split('with sync_playwright() as p:')[0])
OUT=ROOT/'docs/screenshots/view-range';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for w,h,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
  if os.environ.get('RANGE_VIEWPORTS') and f'{w}x{h}' not in os.environ['RANGE_VIEWPORTS'].split(','):continue
  page=browser.new_page(viewport={'width':w,'height':h},has_touch=touch,is_mobile=touch);errors=[];fail={'on':False}
  page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if '/dem/' in r.request.url and fail['on']:r.fulfill(status=503,body='intentional test failure');return
   if '/dem/' not in r.request.url:
    cached=CACHE/hashlib.sha256(r.request.url.encode()).hexdigest()
    r.fulfill(status=200 if cached.exists() else 404,body=cached.read_bytes() if cached.exists() else b'',content_type='image/png');return
   try:r.fulfill(status=200,body=real(r.request.url),headers={'Access-Control-Allow-Origin':'*'},content_type='text/plain' if '.txt' in r.request.url else 'image/png')
   except Exception as e:r.fulfill(status=getattr(e,'code',502),body=str(e))
  page.route('https://cyberjapandata.gsi.go.jp/**',route)
  page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},get base(){return viewRangeBase},get busy(){return rangeBusy||loading},get map(){return map},get tour(){return appTour}};",content_type='text/javascript'))
  page.goto(URL);page.wait_for_function('window.uiTest&&uiTest.data&&!uiTest.busy',timeout=180000)
  page.evaluate("document.querySelector('#toggle-settings').getAttribute('aria-expanded')==='true'&&document.querySelector('#toggle-settings').click()")
  page.locator('#workspace').evaluate("e=>e.scrollIntoView({block:'start',behavior:'instant'})");page.wait_for_timeout(300)
  page.click('#flight-toggle');page.wait_for_timeout(500);initial=page.evaluate('({...uiTest.data.location})')
  box=page.locator('#terrain').bounding_box();x=box['x']+box['width']*.85;y=box['y']+box['height']*(.65 if touch and h>500 else .18)
  page.mouse.move(x,y);page.keyboard.down('Shift');page.mouse.down();page.mouse.move(x-90,y+25,steps=8);page.mouse.up();page.keyboard.up('Shift');page.wait_for_timeout(100)
  page.wait_for_function("!document.querySelector('#range-move').disabled");assert not page.locator('#range-move').is_disabled(),(w,h,box,page.evaluate('uiTest.renderer.controls.target'),page.evaluate('uiTest.base'))
  assert page.evaluate('uiTest.data.location')==initial
  # Keep pending zoom when committing a pan.
  page.mouse.move(x,y);page.mouse.wheel(0,-200);page.wait_for_timeout(50);page.mouse.wheel(0,-200);page.wait_for_timeout(100)
  print(f'{w}: commit move',flush=True);page.click('#range-move');page.wait_for_function('!uiTest.busy',timeout=180000)
  moved=page.evaluate('({...uiTest.data.location})');assert moved['zoom']==initial['zoom'] and moved['longitude']!=initial['longitude']
  assert page.evaluate('uiTest.renderer.controls.target[0]===0&&uiTest.renderer.controls.target[2]===0')
  assert not page.locator('#range-scale').is_disabled()
  print(f'{w}: commit scale',page.evaluate('({pose:uiTest.renderer.controls.distance,base:uiTest.base.distance,box:document.querySelector("#terrain").getBoundingClientRect().toJSON()})'),flush=True);page.click('#range-scale');page.wait_for_function('!uiTest.busy',timeout=180000)
  scaled=page.evaluate('({...uiTest.data.location})');assert scaled['latitude']==moved['latitude'] and scaled['longitude']==moved['longitude'] and scaled['zoom']==moved['zoom']+1,(scaled,moved,page.evaluate('uiTest.base'))
  assert page.evaluate('uiTest.map.zoom')==scaled['zoom']-1
  # Scale ignores another pending pan, as requested.
  box=page.locator('#terrain').bounding_box();x=box['x']+box['width']*.85;y=box['y']+box['height']*(.65 if touch and h>500 else .18)
  page.mouse.move(x,y);page.keyboard.down('Shift');page.mouse.down();page.mouse.move(x-70,y,steps=6);page.mouse.up();page.keyboard.up('Shift');page.mouse.move(x,y);page.mouse.wheel(0,200);page.wait_for_timeout(50);page.mouse.wheel(0,200);page.wait_for_timeout(100)
  print(f'{w}: commit scale',page.evaluate('({pose:uiTest.renderer.controls.distance,base:uiTest.base.distance,box:document.querySelector("#terrain").getBoundingClientRect().toJSON()})'),flush=True);page.click('#range-scale');page.wait_for_function('!uiTest.busy',timeout=180000)
  assert page.evaluate('uiTest.data.location.latitude')==scaled['latitude']
  assert page.evaluate('uiTest.data.location.longitude')==scaled['longitude']
  page.screenshot(path=str(OUT/f'{w}x{h}-range-panel.png'))
  # Failure keeps the prior resident terrain and offers a retry.
  previous=page.evaluate('uiTest.data.location');fail['on']=True
  page.evaluate("uiTest.renderer.controls.target[0]=12;document.querySelector('#terrain').dispatchEvent(new PointerEvent('pointerup'))");page.wait_for_timeout(100)
  print(f'{w}: commit move',flush=True);page.click('#range-move');page.wait_for_function('!uiTest.busy',timeout=180000)
  assert page.evaluate('uiTest.data.location')==previous
  assert '元の地形' in page.locator('#range-status').inner_text();fail['on']=False
  page.screenshot(path=str(OUT/f'{w}x{h}-failure-panel.png'))
  pad=page.locator('#flight-pad').bounding_box();assert pad['x']>=0 and pad['y']>=0 and pad['x']+pad['width']<=w+1 and pad['y']+pad['height']<=h+1,pad
  assert page.locator('[data-flight]').count()==0
  if touch:
   session=page.context.new_cdp_session(page);before=page.evaluate('uiTest.renderer.controls.target.slice()')
   points=[{'x':x-30,'y':y,'id':1},{'x':x,'y':y,'id':2}]
   session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':points})
   session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{**q,'x':q['x']-15} for q in points]})
   session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   assert page.evaluate('uiTest.renderer.controls.target.slice()')!=before
   session.detach()
  page.click('#tour-toggle');page.click('[data-flight-laps="1"]');yaw=page.evaluate('uiTest.renderer.controls.yaw');page.wait_for_timeout(500);assert page.evaluate('uiTest.renderer.controls.yaw')!=yaw
  page.mouse.click(x,y);assert page.locator('#flight-toggle').inner_text()=='閉じる'
  assert page.evaluate('uiTest.renderer.gl.getError()')==0 and not errors,errors
  print(f'PASS {w}x{h}: real DEM pan/scale, independent commits, rollback, flight, WebGL',flush=True)
  page.close()
 browser.close()
server.shutdown()
