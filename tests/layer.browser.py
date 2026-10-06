"""Real image layer ownership and unavailable aerial imagery regression."""
from pathlib import Path
# Reuse fixture/server bootstrap; matrix remains in texture.browser.py.
exec((Path(__file__).with_name('texture.browser.py')).read_text().split('with sync_playwright() as p:')[0])
OUT=ROOT.parent/'terrain-stereo-preview'/'image-layer-switch';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 results=[]
 for width,height in [(1440,900),(390,844),(844,390)]:
  page=b.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));failure={'on':True}
  def route(r):
   if failure['on'] and '/seamlessphoto/' in r.request.url:r.fulfill(status=404,body='',headers={'Access-Control-Allow-Origin':'*'});return
   try:r.fulfill(body=real(r.request.url),content_type='image/jpeg' if r.request.url.endswith('.jpg') else 'image/png' if r.request.url.endswith('.png') else 'text/plain',headers={'Access-Control-Allow-Origin':'*'})
   except Exception:r.fulfill(status=404,body='')
  page.route('https://cyberjapandata.gsi.go.jp/**',route)
  page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data}};",content_type='text/javascript'))
  page.goto(url);page.wait_for_function('window.uiTest && !document.querySelector("#quality").disabled',timeout=120000)
  if page.locator('#surface').is_hidden():page.click('#toggle-settings')
  page.select_option('#surface','map');page.wait_for_function('uiTest.renderer.surface==="map"',timeout=40000)
  page.select_option('#surface','photo');page.wait_for_function('!document.querySelector("#texture-retry").hidden',timeout=40000)
  assert page.evaluate('uiTest.renderer.surface')=='elevation' and '404' in page.locator('#texture-status').inner_text()
  assert page.locator('#message').is_hidden()
  page.select_option('#surface','map');page.wait_for_function('uiTest.renderer.surface==="map"')
  failure['on']=False
  # Resolve a stale photo even after cancellation; it must never replace the map.
  page.evaluate('''window.savedFetch=fetch;window.releasePhotos=[];window.fetch=(u,o)=>String(u).includes('/seamlessphoto/')?new Promise(resolve=>releasePhotos.push(()=>savedFetch(u).then(resolve))):savedFetch(u,o);''')
  page.select_option('#surface','photo');page.wait_for_function('releasePhotos.length===4')
  assert page.evaluate('uiTest.renderer.surface')=='elevation'
  page.select_option('#surface','map');page.evaluate('releasePhotos.forEach(f=>f())')
  page.wait_for_timeout(500);assert page.evaluate('uiTest.renderer.surface')=='map'
  assert page.locator('#texture-retry').is_hidden()
  page.evaluate('window.fetch=savedFetch');page.select_option('#surface','photo');page.wait_for_function('uiTest.renderer.surface==="photo"',timeout=40000)
  page.select_option('#surface','map');page.wait_for_function('uiTest.renderer.surface==="map"',timeout=40000)
  page.select_option('#surface','photo');page.wait_for_function('uiTest.renderer.surface==="photo"',timeout=40000)
  page.click('#toggle-settings');page.locator('#workspace').evaluate('e=>e.scrollIntoView({block:"start"})')
  page.screenshot(path=str(OUT/f'{width}x{height}.png'))
  assert not errors,errors
  assert page.evaluate('uiTest.renderer.gl.getError()')==0
  results.append({'viewport':f'{width}x{height}','404Fallback':True,'stalePhotoIgnored':True,'layerRoundTrip':True})
  print('PASS layer ownership, 404 and stale requests',width,height,flush=True);page.close()
 (OUT/'results.json').write_text(json.dumps(results,indent=2));b.close()
server.shutdown()
