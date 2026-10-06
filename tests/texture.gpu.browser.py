"""Known quadrant texture projection checks in actual Chromium WebGL."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from functools import partial
import os,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'terrain-stereo-preview'/'texture-shader';OUT.mkdir(parents=True,exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
html='''<style>canvas{width:600px;height:600px}</style><canvas id="terrain"></canvas><div id="observation-overlay"></div>
<script type="module">
import {TerrainRenderer} from './js/renderer.js';import {createMesh} from './js/mesh.js';import {stereoCamera} from './js/stereo.js';
const r=new TerrainRenderer(document.querySelector('canvas'),e=>{throw e});r.controls.yaw=0;r.controls.pitch=1.4;
const data={heights:new Float32Array(9).fill(100),size:3,spacing:6.1};r.setMesh(createMesh(data,1));
const texture=document.createElement('canvas');texture.width=texture.height=1024;const ctx=texture.getContext('2d');
for(const [x,y,color] of [[0,0,'red'],[512,0,'lime'],[0,512,'blue'],[512,512,'yellow']]){ctx.fillStyle=color;ctx.fillRect(x,y,512,512);}
r.setTexture(texture);r.setSurface('photo');if(r.surface!=='elevation')throw Error('Map mistaken for photo');
r.setTexture(texture,'photo');r.setSurface('map');if(r.surface!=='elevation')throw Error('Photo mistaken for map');
r.setSurface('photo');if(r.surface!=='photo')throw Error('Photo not enabled');
window.run=()=>{
 const target=r.controls.target,eye=r.controls.eye.map((v,i)=>target[i]+(v-target[i])*1.15),c=stereoCamera(eye,target,1,0);
 const mul=(m,p)=>[0,1,2,3].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]*p[3]);
 r.draw();const colors=[];
 for(const [x,z,channels] of [[-3,-3,[1,0,0]],[3,-3,[0,1,0]],[-3,3,[0,0,1]],[3,3,[1,1,0]]]){
   const p=mul(c.projection,mul(c.view,[x,0,z,1])),a=new Uint8Array(4);
   r.gl.readPixels(Math.round((p[0]/p[3]+1)*300),Math.round((p[1]/p[3]+1)*300),1,1,r.gl.RGBA,r.gl.UNSIGNED_BYTE,a);
   for(let i=0;i<3;i++)if(channels[i]?a[i]<150:a[i]>5)throw Error('Texture orientation '+JSON.stringify([...a]));
   colors.push([...a]);
 }
 for(const mode of ['mono','parallel','cross','anaglyph','mono']){r.setStereo(mode,1);r.draw();if(r.gl.getError())throw Error('Texture stereo GL error');}
 data.heights[4]=NaN;r.setMesh(createMesh(data,1));r.setContours(true);r.draw();
 const a=new Uint8Array(4);r.gl.readPixels(300,300,1,1,r.gl.RGBA,r.gl.UNSIGNED_BYTE,a);if(a[3])throw Error('Map painted missing centre');
 const old=r.texture;r.setTexture(null);if(r.gl.isTexture(old))throw Error('GPU texture leaked');r.setSurface('elevation');r.draw();if(r.gl.getError())throw Error('Fallback GL error');
 return {northwestRedNortheastGreenSouthwestBlueSoutheastYellow:colors,missingAlpha:a[3],allModes:true,textureReleased:true};
};window.ready=true;
</script>'''
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=b.new_page(viewport={'width':650,'height':650});page.route('**/texture-test.html',lambda r:r.fulfill(body=html,content_type='text/html'))
    page.goto(f'http://127.0.0.1:{server.server_port}/texture-test.html');page.wait_for_function('window.ready===true')
    result=page.evaluate('run()');print('PASS texture orientation, missing data, stereo and GPU release',result,flush=True)
    (OUT/'results.json').write_text(json.dumps(result,indent=2));b.close()
server.shutdown()
