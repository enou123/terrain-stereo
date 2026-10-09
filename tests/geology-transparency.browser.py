"""Official API's transparent/no-data semantics with explicitly synthetic PNGs."""
from pathlib import Path
exec(Path(__file__).with_name('contours.browser.py').read_text().split('with sync_playwright() as p:')[0])
from io import BytesIO
from PIL import Image
png=BytesIO();Image.new('RGBA',(256,256),(0,0,0,0)).save(png,format='PNG')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':650,'height':650});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/contours-test.html',lambda r:r.fulfill(body=html,content_type='text/html'))
 page.route('https://gbank.gsj.jp/**',lambda r:r.fulfill(body=png.getvalue(),content_type='image/png',headers={'Access-Control-Allow-Origin':'*'}))
 page.goto(f'http://127.0.0.1:{server.server_port}/contours-test.html');page.wait_for_function('window.ready')
 message=page.evaluate("""async()=>{const {loadMapTexture}=await import('./js/texture.js');try{await loadMapTexture({latitude:34.25,longitude:131.31,zoom:14},new AbortController().signal,'geology');return null}catch(e){return e.message}}""")
 assert '地質図データがありません' in message,message
 result=page.evaluate("""()=>{
  r.setContourInterval(100);r.setSurface('elevation');const off=read(false);
  const image=document.createElement('canvas');image.width=image.height=256;const ctx=image.getContext('2d');ctx.fillStyle='#d3b179';ctx.fillRect(128,0,128,256);
  r.setTexture(image,'geology');r.setSurface('geology');const on=read(false),pixel=x=>{const [px,py]=point(x),i=(py*600+px)*4;return Array.from(on.slice(i,i+4)).map((v,k)=>v-off[i+k]);};
  const missing=pixel(-3),data=pixel(3);if(r.gl.getError())throw Error('WebGL error');return {missing,data};
 }""")
 assert result['missing']==[0,0,0,0] and any(result['data']),result
 assert not errors,errors
 print('PASS synthetic GSJ PNGs: empty atlas reported; partial transparency retains underlying terrain',result,flush=True)
 browser.close();server.shutdown()
