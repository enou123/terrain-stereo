"""Geology point selection in Chromium; all remote data are fixtures, not live GSJ."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json,struct,zlib
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'terrain-stereo-preview'/'geology-selection';OUT.mkdir(parents=True,exist_ok=True)
def chunk(tag,data):return struct.pack('!I',len(data))+tag+data+struct.pack('!I',zlib.crc32(tag+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',256,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+bytes([127,155,114,255])*256)*256))+chunk(b'IEND',b'')
entries=[{'symbol':f's{i}','value':'7f9b72','title':f'区分{i}','formationAge_ja':'前期白亜紀','lithology_ja':f'岩相{i}'} for i in range(20)]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch)
        requests=[];errors=[];failure={'on':False}
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('https://cyberjapandata.gsi.go.jp/**',lambda r:r.fulfill(status=200,body=(','.join(['1200']*256)+'\n')*256 if '/dem/' in r.request.url else png,headers={'Access-Control-Allow-Origin':'*'}))
        def geology(r):
            requests.append(r.request.url)
            assert 'type=original' in r.request.url
            if 'point=' in r.request.url and failure['on']:r.fulfill(status=503,body='');return
            payload=json.dumps(entries[17] if 'point=' in r.request.url else entries) if 'legend.json' in r.request.url else png
            r.fulfill(status=200,body=payload,content_type='application/json' if 'legend.json' in r.request.url else 'image/png',headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://gbank.gsj.jp/**',geology)
        page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data}};",content_type='text/javascript'))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.wait_for_function("window.uiTest && !document.querySelector('#quality').disabled")
        if page.locator('#view-settings').is_hidden():page.click('#toggle-settings')
        page.select_option('#surface','geology')
        page.wait_for_function("document.querySelector('#texture-status').hidden")
        assert page.locator('#terrain').evaluate('e=>getComputedStyle(e).cursor')=='default'
        def click_terrain(mode='mono',eye=0):
            page.select_option('#view-mode',mode)
            # Hide settings before picking; selection must reopen them automatically.
            if page.locator('#view-settings').is_visible():page.click('#toggle-settings')
            page.locator('#terrain').scroll_into_view_if_needed()
            page.wait_for_timeout(100)
            pos=page.evaluate('''async eye=>{
              const m=await import('./js/profile.js');const r=uiTest.renderer,c=r.cameras(undefined,undefined,true)[eye];
              const a=m.projectPoint(m.gridPosition(r.mesh,{u:.5,v:.5}),c),rect=r.canvas.getBoundingClientRect();
              return {x:rect.left+a.x*rect.width/r.canvas.width,y:rect.top+a.y*rect.height/r.canvas.height};
            }''',eye)
            before=sum('point=' in u for u in requests)
            with page.expect_request(lambda r:'legend.json' in r.url and 'point=' in r.url):
                (page.touchscreen.tap if touch else page.mouse.click)(pos['x'],pos['y'])
            page.wait_for_function("document.querySelector('.geology-legend-item[aria-current=true]')?.dataset.symbol==='s17'")
            assert sum('point=' in u for u in requests)==before+1
            assert page.locator('#geology-legend-panel').is_visible()
            assert page.locator('.geology-legend-item').count()==20
            row=page.locator('.geology-legend-item[aria-current=true]')
            assert '選択した地点' in row.inner_text()
            page.wait_for_timeout(700)
            rect=row.bounding_box();assert rect['y']>=0 and rect['y']<height
            return pos
        click_terrain()
        page.screenshot(path=str(OUT/f'{width}x{height}-selected.png'))
        for mode in ['parallel','cross']:
            for eye in [0,1]:click_terrain(mode,eye)
        if not touch:
            pos=click_terrain();before=sum('point=' in u for u in requests)
            page.locator('#terrain').scroll_into_view_if_needed();page.mouse.move(pos['x'],pos['y']);page.mouse.down();page.mouse.move(pos['x']+30,pos['y']+20,steps=5);page.mouse.up();page.wait_for_timeout(150)
            assert sum('point=' in u for u in requests)==before,'Drag must not select geology'
            page.select_option('#surface','elevation');page.mouse.click(pos['x'],pos['y']);page.wait_for_timeout(100)
            assert sum('point=' in u for u in requests)==before
            page.select_option('#surface','geology');page.wait_for_function("document.querySelector('#texture-status').hidden")
            failure['on']=True
            # Restore the view so the flat terrain hit remains visible.
            page.click('#reset');page.wait_for_timeout(100)
            page.locator('#terrain').scroll_into_view_if_needed();page.mouse.click(pos['x'],pos['y'])
            page.wait_for_function("document.querySelector('#geology-legend-status').textContent.includes('取得できません')")
        assert not errors,errors
        print(f'PASS {width}x{height}: selection, exact symbol matching, scroll, stereo eyes'+(' and drag/error handling' if not touch else ''),flush=True)
        page.close()
    browser.close()
server.shutdown()
