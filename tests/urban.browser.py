"""Actual Cesium rendering with synthetic 3D Tiles; not live PLATEAU/Safari validation.
Download cesium@1.117.0 npm package and extract to /tmp/package before running.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import json, math, struct, mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
LIB=Path('/tmp/package/Build/Cesium')
assert (LIB/'Cesium.js').exists(), 'Extract npm cesium@1.117.0 into /tmp/package'
OUT=ROOT.parent/'terrain-stereo-preview'/'urban-phase-1';OUT.mkdir(parents=True,exist_ok=True)
# A small synthetic town, in metres in the local east/north/up frame.
vertices=[];indices=[]
for x in [-160,-80,0,80,160]:
    for y in [-120,-40,40,120]:
        start=len(vertices)//3;h=30+(x+160)//4+(y+120)//8
        for a,b,c in [(0,0,0),(40,0,0),(40,40,0),(0,40,0),(0,0,h),(40,0,h),(40,40,h),(0,40,h)]:vertices.extend([x+a,y+b,c])
        for face in [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]:indices.extend(start+i for i in face)
# Flat face normals make roofs and walls visibly distinct in screenshots.
old=vertices;vertices=[];normals=[]
for i in range(0,len(indices),3):
    triangle=[old[indices[j]*3:indices[j]*3+3] for j in range(i,i+3)]
    a=[triangle[1][k]-triangle[0][k] for k in range(3)];b=[triangle[2][k]-triangle[0][k] for k in range(3)]
    normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
    length=math.sqrt(sum(v*v for v in normal));normal=[v/length for v in normal]
    for point in triangle:vertices.extend(point);normals.extend(normal)
indices=list(range(len(vertices)//3))
positions=struct.pack('<'+'f'*len(vertices),*vertices);elements=struct.pack('<'+'H'*len(indices),*indices);normalbytes=struct.pack('<'+'f'*len(normals),*normals);blob=positions+elements+normalbytes
model={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}], 'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':2},'indices':1,'material':0}]}], 'materials':[{'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.85,.72,.45,1],'metallicFactor':0,'roughnessFactor':1}}], 'buffers':[{'byteLength':len(blob)}], 'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(positions),'target':34962},{'buffer':0,'byteOffset':len(positions),'byteLength':len(elements),'target':34963},{'buffer':0,'byteOffset':len(positions)+len(elements),'byteLength':len(normalbytes),'target':34962}], 'accessors':[{'bufferView':0,'componentType':5126,'count':len(vertices)//3,'type':'VEC3','min':[min(vertices[i::3]) for i in range(3)],'max':[max(vertices[i::3]) for i in range(3)]},{'bufferView':1,'componentType':5123,'count':len(indices),'type':'SCALAR'},{'bufferView':2,'componentType':5126,'count':len(normals)//3,'type':'VEC3'}]}
j=json.dumps(model,separators=(',',':')).encode();j+=b' '*((-len(j))%4);blob+=b'\0'*((-len(blob))%4)
glb=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(blob))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(blob),0x004e4942)+blob
lat=math.radians(35.6812);lon=math.radians(139.7671);n=6378137/math.sqrt(1-.00669437999014*math.sin(lat)**2)
x=n*math.cos(lat)*math.cos(lon);y=n*math.cos(lat)*math.sin(lon);z=n*(1-.00669437999014)*math.sin(lat)
transform=[-math.sin(lon),math.cos(lon),0,0,-math.sin(lat)*math.cos(lon),-math.sin(lat)*math.sin(lon),math.cos(lat),0,math.cos(lat)*math.cos(lon),math.cos(lat)*math.sin(lon),math.sin(lat),0,x,y,z,1]
metadata={'asset':{'version':'1.1','gltfUpAxis':'Z'},'geometricError':500,'root':{'boundingVolume':{'sphere':[0,0,50,350]},'geometricError':0,'transform':transform,'content':{'uri':'town.glb'}}}
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for width,height,touch in [(1440,900,False),(390,844,True),(844,390,True)]:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch)
        errors=[];missing={'on':True};cdn=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        def library(r):
            cdn.append(r.request.url);path=LIB/r.request.url.split('/Build/Cesium/')[1]
            r.fulfill(status=200,body=path.read_bytes(),content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream',headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://cdn.jsdelivr.net/npm/cesium@1.117.0/Build/Cesium/**',library)
        page.route('https://mreversegeocoder.gsi.go.jp/**',lambda r:r.fulfill(json={'results':{'muniCd':'13101'}},headers={'Access-Control-Allow-Origin':'*'}))
        def tiles(r):
            if missing['on']:r.fulfill(status=404,body='{}',headers={'Access-Control-Allow-Origin':'*'})
            elif r.request.url.endswith('.glb'):r.fulfill(body=glb,content_type='model/gltf-binary',headers={'Access-Control-Allow-Origin':'*'})
            else:r.fulfill(json=metadata,headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/**',tiles)
        page.route('https://cyberjapandata.gsi.go.jp/**',lambda r:r.fulfill(body=(','.join(['1200']*256)+'\n')*256,content_type='text/plain') if '/dem/' in r.request.url else r.abort())
        page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.urbanTest=urbanView;window.terrainTest={get data(){return data},get renderer(){return renderer}};",content_type='text/javascript'))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.wait_for_function("window.terrainTest && !document.querySelector('#quality').disabled")
        assert not cdn, 'Library must remain lazy'
        before=page.evaluate('({location:terrainTest.data.location,yaw:terrainTest.renderer.controls.yaw,mode:terrainTest.renderer.mode})')
        page.click('#expand-view');page.click('#urban-open')
        page.wait_for_function("document.querySelector('#urban-status').textContent.includes('見つかりません')")
        assert not cdn,'No library download for unavailable data'
        assert not page.locator('#urban-dialog').evaluate('e=>e.inert')
        page.click('#urban-close');missing['on']=False
        page.click('#urban-open');page.click('#urban-tokyo')
        page.wait_for_function("/PLATEAU LOD1|表示できません|時間がかかっています|読み込めませんでした/.test(document.querySelector('#urban-status').textContent)",timeout=90000)
        assert 'PLATEAU LOD1' in page.locator('#urban-status').inner_text()
        assert page.evaluate('urbanTest.viewer.scene.primitives.length')==1
        assert page.evaluate('urbanTest.viewer.scene.primitives.get(0)._statistics.numberOfTrianglesSelected')==240
        assert page.locator('#urban-map canvas').is_visible()
        page.wait_for_timeout(500)
        box=page.locator('#urban-map').bounding_box();assert box['height']>height*.5 and box['width']>min(width if width<=700 else width-24,1180)-5
        assert page.locator('#urban-close').bounding_box()['y']<height
        page.screenshot(path=str(OUT/f'{width}x{height}-buildings.png'))
        # Camera really responds to mouse input on the genuine Cesium canvas.
        initial=page.evaluate('urbanTest.viewer.camera.positionWC.toString()')
        page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down(button='right');page.mouse.move(box['x']+box['width']/2+60,box['y']+box['height']/2+20,steps=8);page.mouse.up(button='right');page.wait_for_timeout(200)
        assert page.evaluate('urbanTest.viewer.camera.positionWC.toString()')!=initial
        if touch:
            cdp=page.context.new_cdp_session(page)
            cx=box['x']+box['width']/2;cy=box['y']+box['height']/2
            position=page.evaluate('urbanTest.viewer.camera.positionWC.toString()')
            def fingers(radius):return [{'x':cx-radius,'y':cy,'id':1},{'x':cx+radius,'y':cy,'id':2}]
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':fingers(40)})
            for radius in [50,65,80]:
                cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':fingers(radius)})
                page.wait_for_timeout(80)
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(300)
            assert page.evaluate('urbanTest.viewer.camera.positionWC.toString()')!=position
            page.set_viewport_size({'width':height,'height':width});page.wait_for_timeout(500)
            assert page.locator('#urban-map canvas').is_visible();page.screenshot(path=str(OUT/f'{width}x{height}-rotated.png'))
        page.click('#urban-close');assert page.evaluate('urbanTest.viewer') is None
        after=page.evaluate('({location:terrainTest.data.location,yaw:terrainTest.renderer.controls.yaw,mode:terrainTest.renderer.mode})');assert before==after
        assert not errors,errors
        print('PASS',width,height,'genuine Cesium mesh rendering, unavailable coverage, lazy load, camera, close/state, rotation',flush=True)
        page.close()
    browser.close()
server.shutdown()
