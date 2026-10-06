"""GPU contour checks with known elevations; Chromium, not physical Safari."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import os,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'terrain-stereo-preview'/'surface-shader';OUT.mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
html='''<!doctype html><style>canvas {width:600px;height:600px}</style><canvas id="terrain"></canvas><div id="observation-overlay"></div>
<script type="module">
import {TerrainRenderer} from './js/renderer.js';
import {createMesh} from './js/mesh.js';
import {stereoCamera} from './js/stereo.js';
window.r=new TerrainRenderer(document.querySelector('canvas'),e=>{throw e});
r.controls.yaw=0;r.controls.pitch=1.4;
window.mesh={positions:new Float32Array([-6.1,0,-6.1,6.1,0,-6.1,-6.1,0,6.1,6.1,0,6.1]),
 normals:new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0]),colors:new Float32Array(12).fill(.6),
 elevations:new Float32Array([-610,610,-610,610]),indices:new Uint16Array([0,2,1,1,2,3])};
r.setMesh(mesh);
window.read=(enabled)=>{r.setContours(enabled);r.draw();const a=new Uint8Array(600*600*4);r.gl.readPixels(0,0,600,600,r.gl.RGBA,r.gl.UNSIGNED_BYTE,a);return a};
window.point=(x,z=0)=>{
 const target=r.controls.target,eye=r.controls.eye.map((v,i)=>target[i]+(v-target[i])*1.15);
 const c=stereoCamera(eye,target,1,0);
 const mul=(m,p)=>[0,1,2,3].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]*p[3]);
 const p=mul(c.projection,mul(c.view,[x,0,z,1]));return [Math.round((p[0]/p[3]+1)*300),Math.round((p[1]/p[3]+1)*300)];
};
window.run=()=>{
 mesh.elevations.set([-610,610,-610,610]);r.setMesh(mesh);
 const off=read(false),on=read(true),back=read(false);
 if(!off.every((v,i)=>v===back[i]))throw Error('OFF restore changed pixels');
 const diff=(x)=>{const [px,py]=point(x);let max=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
 const i=((py+dy)*600+px+dx)*4;max=Math.max(max,off[i]-on[i]);}return max};
 const lines=[-4,-3,-2,-1,0,1,2,3,4].map(diff),between=[-3.5,-2.5,-1.5,.5,1.5,2.5,3.5].map(diff);
 if(!lines.every(v=>v>20)||!between.every(v=>v<5))throw Error(JSON.stringify({lines,between}));
 mesh.elevations.fill(100);r.setMesh(mesh);
 const flatOff=read(false),flatOn=read(true);
 if(!flatOff.every((v,i)=>v===flatOn[i]))throw Error('Flat 100m plateau became a contour');
 const data={heights:new Float32Array([100,200,300,400,NaN,600,700,800,900]),size:3,spacing:6.1};
 r.setMesh(createMesh(data,1));r.setContours(true);r.draw();
 const [x,y]=point(0),pixel=new Uint8Array(4);r.gl.readPixels(x,y,1,1,r.gl.RGBA,r.gl.UNSIGNED_BYTE,pixel);
 if(pixel[3]!==0)throw Error('Missing centre painted');
 if(r.gl.getError()!==0)throw Error('WebGL error');
 return {lines,between,flatUnchanged:true,missingAlpha:pixel[3]};
};
window.surfaceCheck=()=>{
 mesh.elevations.set([-610,610,-610,610]);r.setMesh(mesh);r.setContours(false);
 const equal=(a,b)=>a.every((v,i)=>v===b[i]);
 const original=read(false);r.setSurface('shading');const gray=read(false);
 if(equal(original,gray))throw Error('Surface switch did not change pixels');
 let solid=0;
 for(let i=0;i<gray.length;i+=4)if(gray[i+3]===255){solid++;if(gray[i]!==gray[i+1]||gray[i+1]!==gray[i+2])throw Error('Shading not neutral gray');}
 if(solid<10000)throw Error('No visible test terrain');
 mesh.colors.fill(.2);r.setMesh(mesh);
 if(!equal(read(false),gray))throw Error('Shading changed with altitude colors');
 mesh.normals.set([0,-1,0,0,-1,0,0,-1,0,0,-1,0]);r.setMesh(mesh);
 if(equal(read(false),gray))throw Error('Shading ignores slope direction');
 mesh.normals.set([0,1,0,0,1,0,0,1,0,0,1,0]);mesh.colors.fill(.6);r.setMesh(mesh);
 r.setSurface('elevation');if(!equal(read(false),original))throw Error('Original surface failed to restore');
 for(const mode of ['mono','parallel','cross','anaglyph','mono']){
   r.setStereo(mode,1);r.setSurface('elevation');const a=read(true);
   r.setSurface('shading');const b=read(true);
   if(equal(a,b))throw Error('No surface switch in '+mode);
   r.setSurface('elevation');if(!equal(a,read(true)))throw Error('Restore failed in '+mode);
   if(r.gl.getError()!==0)throw Error('WebGL surface error');
 }
 r.setStereo('mono',1);return {neutralGray:true,colorIndependent:true,slopeResponsive:true,restoresPixels:true,allModes:true};
};window.ready=true;
</script>'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':650,'height':650})
    page.route('**/contours-test.html',lambda r:r.fulfill(body=html,content_type='text/html'))
    url=f'http://127.0.0.1:{server.server_port}/contours-test.html'
    page.goto(url);page.wait_for_function('window.ready===true')
    surface=page.evaluate('surfaceCheck()');print('PASS surface shader',surface,flush=True)
    result=page.evaluate('({elevation:(r.setSurface("elevation"),run()),shading:(r.setSurface("shading"),run())})');print('PASS GPU contour altitudes, flat plateau and missing centre in both surfaces',result,flush=True)
    page.close()
    page=browser.new_page(viewport={'width':650,'height':650})
    page.add_init_script("const get=WebGLRenderingContext.prototype.getExtension;WebGLRenderingContext.prototype.getExtension=function(name){return name==='OES_standard_derivatives'?null:get.call(this,name)}")
    page.route('**/contours-test.html',lambda r:r.fulfill(body=html,content_type='text/html'))
    page.goto(url);page.wait_for_function('window.ready===true')
    unsupported=page.evaluate("(()=>{r.setContours(true);r.setSurface('shading');r.draw();return {supported:r.contoursSupported,enabled:r.contours,error:r.gl.getError(),triangles:r.count}})()")
    assert unsupported=={'supported':False,'enabled':False,'error':0,'triangles':6},unsupported
    print('PASS missing derivative extension retains 3D',flush=True)
    (OUT/'results.json').write_text(json.dumps({'surface':surface,'gpu':result,'unsupported':unsupported},indent=2))
    page.close()
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    page.add_init_script("const get=WebGLRenderingContext.prototype.getExtension;WebGLRenderingContext.prototype.getExtension=function(name){return name==='OES_standard_derivatives'?null:get.call(this,name)}")
    tile='\n'.join([','.join(['100']*256)]*256)
    page.route('https://cyberjapandata.gsi.go.jp/**',lambda r:r.fulfill(status=200 if '/dem/' in r.request.url else 404,body=tile if '/dem/' in r.request.url else '',headers={'Access-Control-Allow-Origin':'*'}))
    page.goto(f'http://127.0.0.1:{server.server_port}/')
    page.wait_for_function("document.querySelector('#message').hidden")
    assert page.locator('#contours').is_disabled() and not page.locator('#contours').is_checked()
    assert 'この端末は等高線の描画に対応していません' in page.locator('#contours-guide').inner_text()
    page.select_option('#surface','shading')
    assert page.locator('#elevation-legend').is_hidden()
    page.locator('#terrain').focus();page.keyboard.press('ArrowLeft')
    assert page.locator('#message').is_hidden()
    print('PASS unsupported device shows disabled toggle and retains usable viewer',flush=True)
    browser.close()
server.shutdown()
