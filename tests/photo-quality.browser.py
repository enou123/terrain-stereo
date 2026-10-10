"""Real GSI aerial tile and WebGL comparison across representative places/qualities."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
from concurrent.futures import ThreadPoolExecutor
import hashlib, math, os, urllib.request, json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path('/workspace/photo-quality')
OUT.mkdir(parents=True,exist_ok=True)
CACHE=Path('/tmp/terrain-photo-quality-cache');CACHE.mkdir(exist_ok=True)
def real(url):
    path=CACHE/hashlib.sha256(url.encode()).hexdigest()
    if path.with_suffix('.404').exists():return None
    if path.exists():return path.read_bytes()
    try:
        with urllib.request.urlopen(url,timeout=30) as response:body=response.read()
    except urllib.error.HTTPError as error:
        if error.code==404:path.with_suffix('.404').touch();return None
        raise
    path.write_bytes(body);return body

def tile_urls(lat,lon,zoom,quality):
    # Match texturePlan() and loadElevation() for the production view footprint.
    n=2**zoom;x=(lon+180)/360*n;y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
    base=min(14,zoom+1);size=1024*2**{'standard':0,'high':1,'ultra':2}[quality]
    while True:
        photo_z=min(17,base+round(math.log2(size/1024)));scale=2**(photo_z-zoom)
        left=(math.floor(x)-192)*scale;top=(math.floor(y)-192)*scale;span=384*scale
        bounds=(math.floor(left/256),math.ceil((left+span)/256),math.floor(top/256),math.ceil((top+span)/256))
        if size<=2048 or (bounds[1]-bounds[0])*(bounds[3]-bounds[2])<=64:break
        size//=2
    urls=[f'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{photo_z}/{tx}/{ty}.jpg'
          for ty in range(bounds[2],bounds[3]) for tx in range(bounds[0],bounds[1])]
    source_z=min(14,zoom+{'standard':0,'high':1,'ultra':2}[quality]);dem_scale=2**(source_z-zoom)
    sx=math.floor(x)*dem_scale-192*dem_scale;sy=math.floor(y)*dem_scale-192*dem_scale;half=192*dem_scale
    urls.extend(f'https://cyberjapandata.gsi.go.jp/xyz/dem/{source_z}/{tx}/{ty}.txt'
        for ty in range(math.floor(sy/256),math.floor((sy+2*half)/256)+1)
        for tx in range(math.floor(sx/256),math.floor((sx+2*half)/256)+1))
    return urls

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/'
places=[('ishizuchi','石鎚山'),('fuji','富士山'),('aogashima','青ヶ島')]
qualities=['standard','high','ultra']
coordinates={'ishizuchi':(33.767,133.115,12),'fuji':(35.3606,138.7274,11),'aogashima':(32.457,139.762,13)}
warm=set()
for place_id,_ in places:
    lat,lon,z=coordinates[place_id]
    for quality in qualities:warm.update(tile_urls(lat,lon,z,quality))
warm.update(tile_urls(33.767,133.115,14,'ultra'))
print(f'Prefetching {len(warm)} unique official GSI DEM/photo tiles…',flush=True)
with ThreadPoolExecutor(max_workers=16) as pool:list(pool.map(real,warm))
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
    def route(request):
        try:
            body=real(request.request.url)
            if body is None:request.fulfill(status=404,body='',headers={'Access-Control-Allow-Origin':'*'});return
            content='image/jpeg' if request.request.url.endswith('.jpg') else 'image/png' if request.request.url.endswith('.png') else 'text/plain'
            request.fulfill(status=200,body=body,content_type=content,headers={'Access-Control-Allow-Origin':'*'})
        except Exception as error:request.fulfill(status=404,body=str(error),headers={'Access-Control-Allow-Origin':'*'})
    page.route('https://cyberjapandata.gsi.go.jp/**',route)
    def app_with_hook(request):
        source=(ROOT/'js/app.js').read_text()+"""
window.photoQualityTest=async(id,q,overrideZoom=null)=>{
 const place=LANDMARKS.find(item=>item.id===id);if(!place)throw Error('unknown place '+id);
 requestedLocation=observationLocation(place,'terrain');if(overrideZoom!==null)requestedLocation.zoom=overrideZoom;requestedQuality=q;
 qualitySelect.value=q;surfaceSelect.value='photo';resetView=true;
 const ok=await load();if(!ok)throw Error('terrain load failed '+message.textContent);
 if(!await texturePromise)throw Error('photo load failed '+textureStatus.textContent);
 renderer.draw();return {...textureCache.canvas.textureStats,glError:renderer.gl.getError()};
};"""
        request.fulfill(body=source,content_type='text/javascript')
    page.route('**/js/app.js*',app_with_hook)
    page.goto(url);page.wait_for_function('window.photoQualityTest!==undefined && !document.querySelector("#quality").disabled',timeout=120000)
    for place_id,place_name in places:
        for quality in qualities:
            stats=page.evaluate("([id,q])=>photoQualityTest(id,q)",[place_id,quality])
            assert stats['glError']==0,stats
            page.wait_for_timeout(300)
            shot=OUT/f'{place_id}-{quality}.png'
            page.locator('#terrain').screenshot(path=str(shot))
            results.append({'place':place_name,'quality':quality,**stats,'screenshot':shot.name})
            print(json.dumps(results[-1],ensure_ascii=False),flush=True)
    detailed=page.evaluate("([id,q,z])=>photoQualityTest(id,q,z)",['ishizuchi','ultra',14])
    assert detailed['glError']==0,detailed
    page.wait_for_timeout(300)
    detail_shot=OUT/'ishizuchi-zoom14-ultra-4096.png'
    page.locator('#terrain').screenshot(path=str(detail_shot))
    results.append({'place':'石鎚山・狭い範囲','quality':'ultra','requestedZoom':14,**detailed,'screenshot':detail_shot.name})
    print(json.dumps(results[-1],ensure_ascii=False),flush=True)
    assert not errors,errors
    browser_mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=3)
    mobile_errors=[];browser_mobile.on('pageerror',lambda err:mobile_errors.append(str(err)))
    browser_mobile.route('https://cyberjapandata.gsi.go.jp/**',route)
    browser_mobile.route('**/js/app.js*',app_with_hook)
    browser_mobile.goto(url);browser_mobile.wait_for_function('window.photoQualityTest!==undefined && !document.querySelector("#quality").disabled',timeout=120000)
    mobile_stats=browser_mobile.evaluate("([id,q])=>photoQualityTest(id,q)",['aogashima','ultra'])
    assert mobile_stats['width']<=2048,mobile_stats
    assert mobile_stats['glError']==0,mobile_stats
    mobile_shot=OUT/'aogashima-ultra-mobile.png';browser_mobile.locator('#terrain').screenshot(path=str(mobile_shot))
    results.append({'place':'青ヶ島','quality':'ultra-mobile',**mobile_stats,'screenshot':mobile_shot.name})
    print(json.dumps(results[-1],ensure_ascii=False),flush=True)
    assert not mobile_errors,mobile_errors
    browser_mobile.close()
    browser.close()
server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('SCREENSHOTS',OUT,flush=True)
