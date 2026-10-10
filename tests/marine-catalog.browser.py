"""Catalog/UI smoke checks only; does not claim the not-yet-downloaded GMRT grids render."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
from playwright.sync_api import sync_playwright
import json,os
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'work'/'marine-catalog-browser';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
  page=browser.new_page(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.route('https://**/*',lambda route:route.abort())
  page.goto(url,wait_until='domcontentloaded');page.wait_for_function("document.querySelectorAll('#map-place option').length===48",timeout=15000)
  page.select_option('#landmark-category','marineVolcano')
  assert page.locator('#map-place option').count()==14
  assert '伊豆大島と周辺海底' in page.locator('#map-place option').all_text_contents()
  page.select_option('#landmark-category','trench')
  assert page.locator('#map-place option').count()==8
  assert '日本海溝周辺' in page.locator('#map-place option').all_text_contents()
  page.select_option('#landmark-category','');page.select_option('#landmark-region','伊豆・小笠原諸島')
  assert '伊豆・小笠原諸島の広域海底' in page.locator('#map-place option').all_text_contents()
  page.select_option('#map-place','sea-izu-oshima')
  assert '実水深データも読み込み' in page.locator('#landmark-preview').inner_text()
  page.locator('#landmark-preview').screenshot(path=str(OUT/f'{width}x{height}-catalog.png'))
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  assert not errors,errors
  print('PASS',width,height,json.dumps({'places':47,'marineVolcanoEntries':13,'trenchEntries':7,'preview':'伊豆大島と周辺海底','catalogScreenshot':str(OUT/f'{width}x{height}-catalog.png')},ensure_ascii=False))
  page.close()
 browser.close();server.shutdown()
