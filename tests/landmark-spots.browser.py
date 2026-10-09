"""Real GSI DEM spot visits; no mock terrain. GSJ denial kept separate."""
from pathlib import Path
# Reuse real tile cache, fixtures (not used here), and local HTTP server.
exec(Path(__file__).with_name('landmarks.browser.py').read_text().split('with sync_playwright() as p:')[0])
OUT=Path(os.environ.get('SPOT_OUTPUT','/tmp/landmark-spots'));OUT.mkdir(parents=True,exist_ok=True)
SPOTS=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {LANDMARK_SPOTS} from './js/landmark-spots.js';console.log(JSON.stringify(LANDMARK_SPOTS))"],cwd=ROOT))
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
  requested=os.environ.get('SPOT_VIEWPORTS')
  if requested and f'{width}x{height}' not in requested.split(','):continue
  page=browser.new_page(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch,device_scale_factor=1)
  errors=[];requests=[];fail={'on':False}
  page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   u=r.request.url;requests.append(u)
   if fail['on'] and '/dem/' in u:r.fulfill(status=503,body='simulated DEM failure');return
   try:r.fulfill(body=real(u),content_type='text/plain' if '.txt' in u else 'application/json' if 'legend.json' in u else 'image/png',headers={'Access-Control-Allow-Origin':'*'})
   except Exception as e:r.fulfill(status=getattr(e,'code',502),body=str(e),headers={'Access-Control-Allow-Origin':'*'})
  page.route('https://cyberjapandata.gsi.go.jp/**',route);page.route('https://gbank.gsj.jp/**',route)
  page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},get guide(){return landmarkGuide},get tour(){return appTour},get loading(){return loading}};",content_type='text/javascript'))
  def ready():page.wait_for_function("window.uiTest&&!uiTest.loading&&!document.querySelector('#visit-landmark').disabled&&document.querySelector('#message').hidden",timeout=180000)
  def settings():
   if page.locator('#view-settings').is_hidden():page.click('#toggle-settings')
  def screen(name):
   if touch and page.locator('#view-settings').is_visible():page.click('#toggle-settings')
   page.locator('#workspace').scroll_into_view_if_needed();page.wait_for_timeout(100)
   page.locator('#viewer').screenshot(path=str(OUT/f'{width}x{height}-{name}.jpg'),type='jpeg',quality=88)
  def state():return page.evaluate("({location:uiTest.data.location,camera:{yaw:uiTest.renderer.controls.yaw,pitch:uiTest.renderer.controls.pitch,distance:uiTest.renderer.controls.distance,target:uiTest.renderer.controls.target},quality:uiTest.data.quality,height:document.querySelector('#exaggeration').value,interval:document.querySelector('#contour-interval').value,spot:uiTest.guide.spot})")
  page.goto(URL);ready();assert page.locator('#contour-interval').input_value()=='100'
  checked=[]
  for id,spots in SPOTS.items():
   place=next(p for p in PLACES if p['id']==id)
   page.select_option('#map-place',id);page.click('#visit-landmark');ready()
   overview=page.evaluate('uiTest.data.location');screen(f'{id}-overview')
   for spot in spots:
    page.select_option('#landmark-spot-select',spot['id']);assert spot['description']==page.locator('#landmark-spot-copy').inner_text()
    before=len(requests);page.click('#visit-landmark-spot');ready()
    expected={**spot['center'],'zoom':spot['settings']['zoom']}
    assert page.evaluate('uiTest.data.location')==expected
    assert page.evaluate('uiTest.guide.active.id')==id and page.evaluate('uiTest.guide.spot')==spot['id']
    assert spot['name'] in page.locator('#terrain-location').inner_text()
    assert page.locator('#contour-interval').input_value()==str(spot['settings']['contourInterval'])
    assert page.evaluate('uiTest.data.quality')=='high'
    metrics=page.evaluate("""async()=>{
     const r=uiTest.renderer,m=await import('./js/profile.js'),s=await import('./js/landmark-spots.js'),spot=s.findSpot(uiTest.guide.active.id,uiTest.guide.spot),f=s.observationFocus(spot,uiTest.data.location);r.draw();
     const c=r.cameras(undefined,undefined,true)[0],ids=[...new Set(r.mesh.indices)].filter(i=>{const u=i%r.mesh.size/(r.mesh.size-1),v=Math.floor(i/r.mesh.size)/(r.mesh.size-1);return u>=f[0]&&u<=f[2]&&v>=f[1]&&v<=f[3]});
     const min=a=>a.reduce((x,y)=>Math.min(x,y),Infinity),max=a=>a.reduce((x,y)=>Math.max(x,y),-Infinity);
     const ps=ids.map(i=>m.projectPoint(Array.from(r.mesh.positions.slice(i*3,i*3+3)),c)),hs=ids.map(i=>uiTest.data.heights[i]);
     return {minX:min(ps.map(p=>p.x/c.width)),maxX:max(ps.map(p=>p.x/c.width)),minY:min(ps.map(p=>p.y/c.height)),maxY:max(ps.map(p=>p.y/c.height)),minW:min(ps.map(p=>p.w)),relief:max(hs)-min(hs),eyeHeight:r.controls.eye[1],peak:max(Array.from(r.mesh.positions).filter((_,i)=>i%3===1)),spacing:uiTest.data.spacing*1000,range:(uiTest.data.size-1)*uiTest.data.spacing,error:r.gl.getError()};
    }""")
    assert metrics['error']==0 and metrics['minW']>0 and metrics['eyeHeight']>metrics['peak'],(id,spot['id'],metrics)
    assert metrics['minX']>.02 and metrics['maxX']<.98 and metrics['minY']>.02 and metrics['maxY']<.98,(id,spot['id'],metrics)
    assert max(metrics['maxX']-metrics['minX'],metrics['maxY']-metrics['minY'])>.30,(id,spot['id'],'too small',metrics)
    assert metrics['relief']>15,(id,spot['id'],'flat feature',metrics)
    screen(f'{id}-{spot["id"]}-real-dem')
    settings();page.check('#contours');page.select_option('#contour-interval',str(spot['settings']['contourInterval']))
    image_before=page.evaluate('(()=>{uiTest.renderer.draw();return uiTest.renderer.canvas.toDataURL()})()')
    screen(f'{id}-{spot["id"]}-contours-{spot["settings"]["contourInterval"]}m')
    settings();count=sum('/dem/' in u for u in requests);old=state()
    page.select_option('#contour-interval','200' if spot['settings']['contourInterval']!=200 else '10')
    assert page.evaluate('(()=>{uiTest.renderer.draw();return uiTest.renderer.canvas.toDataURL()})()')!=image_before
    assert sum('/dem/' in u for u in requests)==count and state()['camera']==old['camera']
    page.select_option('#contour-interval',str(spot['settings']['contourInterval']));page.uncheck('#contours')
    page.locator('#landmark-spots').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{width}x{height}-{id}-{spot["id"]}-controls.jpg'),type='jpeg',quality=82)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    checked.append({'place':id,'spot':spot['id'],'location':expected,'metrics':metrics,'newDemRequests':sum('/dem/' in u for u in requests[before:]),'intervalPixelsChanged':True})
    print('PASS real GSI',width,height,id,spot['id'],round(metrics['relief']), 'm relief',flush=True)
   # A geology switch must keep the spot, DEM and every manual setting.
   page.locator('#terrain').focus();page.keyboard.press('ArrowRight');old=state();count=sum('/dem/' in u for u in requests)
   page.click('[data-landmark-mode="geology"]');page.wait_for_function("!document.querySelector('[data-landmark-mode=geology]').disabled",timeout=60000)
   assert state()==old and sum('/dem/' in u for u in requests)==count
   live=page.evaluate('uiTest.renderer.surface')=='geology'
   if not live:assert '取得できません' in page.locator('#landmark-guide-status').inner_text()
   page.click('[data-landmark-mode="terrain"]');page.wait_for_function("!document.querySelector('[data-landmark-mode=terrain]').disabled")
   assert state()==old
   # Whole button reloads the whole extent and clears only the spot context.
   page.click('#landmark-overview');ready();assert page.evaluate('uiTest.data.location')==overview and page.evaluate('uiTest.guide.spot') is None
  # Tour must restore a close-up and non-default contour spacing too.
  page.select_option('#map-place','aogashima');page.click('#visit-landmark');ready()
  page.select_option('#landmark-spot-select','maruyama');page.click('#visit-landmark-spot');ready();settings();page.check('#contours');page.select_option('#contour-interval','10');old=state()
  page.click('#start-app-tour');page.wait_for_function('uiTest.tour.active');page.click('.app-tour-end');page.wait_for_function('!uiTest.tour.active',timeout=120000);ready()
  assert state()==old and page.locator('#contours').is_checked()
  # Explicit failed spot load retains old context/settings; retry succeeds.
  page.goto(URL);ready() # A fresh app cache makes the simulated network failure meaningful.
  page.select_option('#map-place','minamidaito');page.click('#visit-landmark');ready();old=state()
  fail['on']=True;page.select_option('#landmark-spot-select','western-rim');page.click('#visit-landmark-spot')
  page.wait_for_function("!uiTest.loading&&!document.querySelector('#visit-landmark-spot').disabled&&document.querySelector('#message').classList.contains('error')",timeout=60000)
  assert state()==old
  fail['on']=False;page.click('#visit-landmark-spot');ready();assert page.evaluate('uiTest.guide.spot')=='western-rim'
  # A shared close-up takes URL settings, including interval; no presets apply.
  page.goto(URL+'?lat=32.4525&lon=139.7664&z=14&h=1.7&yaw=.8&pitch=1.1&dist=8&surface=shading&quality=high&contours=1&ci=20');ready()
  assert page.locator('#landmark-guide').is_hidden() and page.locator('#contour-interval').input_value()=='20' and page.locator('#exaggeration').input_value()=='1.7'
  assert not errors,errors
  results.append({'viewport':f'{width}x{height}','spots':checked,'liveGSJ':live,'GSJFixtureUsed':False,'tourRestoresSpot':True,'failureRetainsContext':True,'sharedURLPriority':True,'errors':errors});page.close()
 browser.close();server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print('PASS spots browser:',OUT,flush=True)
