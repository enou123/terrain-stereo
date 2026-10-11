"""Chromium location-search UI checks. CSIS responses and GSI terrain assets are explicit fixtures."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright
import json,os

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'terrain-stereo-preview'/'location-search';OUT.mkdir(parents=True,exist_ok=True)
image=Image.new('RGB',(256,256),(222,231,220));buffer=BytesIO();image.save(buffer,format='PNG');MAP_TILE=buffer.getvalue()
DEM_TILE=('\n'.join([','.join(['100']*256)]*256)).encode()
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start();URL=f'http://127.0.0.1:{server.server_port}/'
XML_ONE='''<?xml version="1.0"?><results><candidate><address>愛媛県/松山市</address><latitude>33.8392</latitude><longitude>132.7657</longitude><iLvl>7</iLvl></candidate></results>'''
XML_MULTI='''<?xml version="1.0"?><results><candidate><address>長野県/松本市</address><latitude>36.2381</latitude><longitude>137.9720</longitude></candidate><candidate><address>熊本県/松本町</address><latitude>32.86</latitude><longitude>130.81</longitude></candidate></results>'''
viewports=[(1440,900,False),(390,844,True),(844,390,True)]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for width,height,mobile in viewports:
  page=browser.new_page(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile,device_scale_factor=2 if mobile else 1)
  errors=[];dem=[];csis=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  def route_gsi(route):
   u=route.request.url
   if '/dem/' in u:dem.append(u);route.fulfill(status=200,body=DEM_TILE,content_type='text/plain',headers={'Access-Control-Allow-Origin':'*'})
   elif '/std/' in u:route.fulfill(status=200,body=MAP_TILE,content_type='image/png',headers={'Access-Control-Allow-Origin':'*'})
   else:route.fulfill(status=404,body='')
  page.route('https://cyberjapandata.gsi.go.jp/**',route_gsi)
  def route_csis(route):
   query=route.request.url
   csis.append(query)
   body=XML_MULTI if '%E9%95%B7%E9%87%8E' in query or '長野' in query else XML_ONE
   route.fulfill(status=200,body=body,content_type='application/xml',headers={'Access-Control-Allow-Origin':'*'})
  page.route('https://geocode.csis.u-tokyo.ac.jp/**',route_csis)
  page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.searchTest={get map(){return map},get selected(){return selectedLocation},get data(){return data},get loading(){return loading}};",content_type='text/javascript'))
  page.goto(URL);page.wait_for_function('window.searchTest&&!searchTest.loading&&!document.querySelector("#quality").disabled',timeout=120000)
  assert page.locator('#message').is_hidden(),page.locator('#status').inner_text()
  initial_dem=len(dem)
  page.locator('#location-search-input').fill('35.3606, 138.7274');page.locator('#location-search-form').press('Enter')
  assert '35.3606' in page.locator('#selected-location').inner_text();assert page.locator('#selected-place-label').inner_text()=='入力した座標'
  assert len(dem)==initial_dem,'Searching coordinates must not load terrain'
  page.locator('#location-search-input').fill('https://www.google.com/maps/place/Fuji/@35.2,138.4,10z/data=!3d35.3606!4d138.7274');page.click('#location-search-submit')
  assert '35.3606' in page.locator('#selected-location').inner_text()
  page.locator('#location-search-input').fill('https://www.google.com/maps/search/?api=1&query=35.3606%2C138.7274');page.click('#location-search-submit')
  assert '138.7274' in page.locator('#selected-location').inner_text()
  page.locator('#location-search-input').fill('https://maps.app.goo.gl/abcdef');page.click('#location-search-submit')
  assert '短縮URLはブラウザから展開できません' in page.locator('#location-search-status').inner_text()
  old=page.locator('#selected-location').inner_text()
  page.locator('#location-search-input').fill('138.7, 35.3');page.click('#location-search-submit')
  assert '緯度, 経度の順' in page.locator('#location-search-status').inner_text() and page.locator('#selected-location').inner_text()==old
  page.locator('#location-search-input').fill('48, 135');page.click('#location-search-submit')
  assert '対応していない地域' in page.locator('#location-search-status').inner_text()
  page.locator('#location-search-input').fill('https://evil.example/maps/@35,139,10z');page.click('#location-search-submit')
  assert 'GoogleマップのURLとして認識できません' in page.locator('#location-search-status').inner_text()
  # Reviewed local natural-name records and catalog names must not call CSIS.
  expected={
   '富士山':('35.36060','138.72740'), '四国カルスト':('33.46681','132.96131'),
   '姫鶴平':('33.46750','132.96250'), '石鎚山':('33.76700','133.11500'),
   '仁淀川':('33.45000','133.48333'), '祖谷渓':('33.90600','133.81300'),
   '阿蘇カルデラ':('32.93000','131.08000'), '桜島':('31.57722','130.65889'),
   '青ヶ島':('32.45700','139.76200'), '西之島':('27.25000','140.88000'),
   '鳥取砂丘':('35.54972','134.24472'), '富士五湖':('35.51767','138.76219'),
  }
  for query,coords in expected.items():
   page.locator('#location-search-input').fill(query);page.click('#location-search-submit')
   status=page.locator('#location-search-status').inner_text()
   assert coords[0] in status and coords[1] in status,(query,status)
   assert page.locator('.location-search-result').count()==1,query
   assert page.locator('.search-result-source').count()==1,query
   assert len(csis)==0,query
   if query in ('四国カルスト','姫鶴平') and (width,height) in [(1440,900),(390,844)]:
    page.locator('#place-picker').screenshot(path=str(OUT/f'{width}x{height}-{query}.png'))
  assert page.locator('#selected-place-label').inner_text()=='富士五湖'
  assert '石川県' not in page.locator('#location-search-results').inner_text()
  assert '和歌山県' not in page.locator('#location-search-results').inner_text()
  assert len(dem)==initial_dem,'Name searches must not load terrain'
  page.locator('#location-search-input').fill('長野県の松本');page.click('#location-search-submit')
  page.wait_for_selector('.location-search-result');assert page.locator('.location-search-result').count()==1
  assert '長野県 松本市' in page.locator('.location-search-result').inner_text()
  assert '32.86' not in page.locator('.location-search-result').inner_text()
  assert '候補' not in page.locator('#location-search-status').inner_text()
  page.locator('#location-search-input').fill('松山市');page.click('#location-search-submit')
  page.wait_for_function("document.querySelector('#location-search-status').textContent.includes('CSISシンプルジオコーディング実験')")
  assert 'CSISシンプルジオコーディング実験' in page.locator('#location-search-status').inner_text()
  page.locator('#location-search-input').fill('愛媛県松山市');page.click('#location-search-submit')
  page.wait_for_function("document.querySelector('#location-search-status').textContent.includes('CSISシンプルジオコーディング実験')")
  assert 'CSISシンプルジオコーディング実験' in page.locator('#location-search-status').inner_text()
  assert len(csis)==3 and len(dem)==initial_dem
  if mobile:
   metrics=page.evaluate('({body:document.body.scrollWidth,viewport:innerWidth,input:document.querySelector("#location-search-input").getBoundingClientRect().width,button:document.querySelector("#location-search-submit").getBoundingClientRect().width})')
   assert metrics['body']<=metrics['viewport'],metrics
  page.locator('#place-picker').screenshot(path=str(OUT/f'{width}x{height}-search.png'))
  page.locator('#show-terrain').click();page.wait_for_function('!searchTest.loading&&searchTest.data.location.latitude===33.8392',timeout=120000)
  assert page.locator('#message').is_hidden(),page.locator('#message').inner_text()
  assert not errors,errors
  page.close();print(f'PASS {width}x{height}: 12 required names, strict relevance, coordinate/maps, CSIS fixture and error states; DEM loads only after explicit button',flush=True)
 browser.close()
server.shutdown()
print('Fixtures/screenshots:',OUT,flush=True)
