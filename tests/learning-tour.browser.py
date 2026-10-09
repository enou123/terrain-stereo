"""End-to-end learning-tour behavior on GSI terrain; geology tiles are explicit fixtures."""
from pathlib import Path
exec(Path(__file__).with_name('landmarks.browser.py').read_text().split('with sync_playwright() as p:')[0])

OUT=ROOT/'docs/screenshots/learning-tour';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--disable-crashpad','--disable-breakpad','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    checks=[]
    sizes=[(1440,900,False),(390,844,True),(844,390,True)]
    requested=os.environ.get('LEARNING_VIEWPORTS')
    if requested:sizes=[size for size in sizes if f'{size[0]}x{size[1]}' in requested.split(',')]
    for width,height,touch in sizes:
        page=browser.new_page(viewport={'width':width,'height':height},has_touch=touch,is_mobile=touch,device_scale_factor=1)
        errors=[];fixture={'on':True}
        page.on('pageerror',lambda e:errors.append(str(e)))
        def route(r):
            url=r.request.url
            if 'gbank.gsj.jp' in url:
                payload=json.dumps(ENTRIES[0] if 'point=' in url else ENTRIES) if 'legend.json' in url else GEO_FIXTURE
                r.fulfill(status=200,body=payload,content_type='application/json' if 'legend.json' in url else 'image/png',headers={'Access-Control-Allow-Origin':'*'});return
            try:r.fulfill(status=200,body=real(url),content_type='application/json' if 'legend.json' in url else 'text/plain' if '.txt' in url else 'image/png',headers={'Access-Control-Allow-Origin':'*'})
            except Exception as e:r.fulfill(status=getattr(e,'code',502),body=str(e),headers={'Access-Control-Allow-Origin':'*'})
        page.route('https://cyberjapandata.gsi.go.jp/**',route);page.route('https://gbank.gsj.jp/**',route)
        page.route('**/js/app.js*',lambda r:r.fulfill(body=(ROOT/'js/app.js').read_text()+"\nwindow.uiTest={get renderer(){return renderer},get data(){return data},get guide(){return landmarkGuide},get loading(){return loading}};",content_type='text/javascript'))
        page.goto(URL);page.wait_for_function("window.uiTest&&!uiTest.loading&&document.querySelector('#message').hidden",timeout=180000)
        for id in ['akiyoshidai','aogashima','itoigawa']:
            page.select_option('#map-place',id);page.click('#visit-landmark')
            page.wait_for_function("!uiTest.loading&&!document.querySelector('#visit-landmark').disabled&&uiTest.guide.active",timeout=180000)
            page.click('#learning-tour-start')
            titles=[]
            steps=int(page.locator('#learning-tour-count').inner_text().split('/')[-1].strip())
            for index in range(steps):
                page.wait_for_function("!document.querySelector('#learning-tour-next').disabled",timeout=120000)
                title=page.locator('#learning-tour-title').inner_text();titles.append(title)
                expected=page.evaluate("({spot:uiTest.guide.spot,mode:uiTest.guide.mode,surface:uiTest.renderer.surface,location:uiTest.data.location,gl:uiTest.renderer.gl.getError()})")
                assert expected['mode'] in ('terrain','geology') and expected['gl']==0,(id,title,expected)
                assert (expected['surface']=='geology')== (expected['mode']=='geology'),(id,title,expected)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                page.locator('#workspace').scroll_into_view_if_needed();page.locator('#viewer').screenshot(path=str(OUT/f'{width}x{height}-{id}-{index+1}.jpg'),type='jpeg',quality=84)
                if expected['mode']=='geology':
                    assert not page.locator('#learning-tour-legend').is_hidden()
                    page.click('#learning-tour-legend');page.wait_for_function("document.querySelector('#geology-legend-list').children.length>0")
                    assert 'テスト用の岩石' in page.locator('#geology-legend-list').inner_text()
                if index<steps-1:
                    before=expected['location'];page.click('#learning-tour-next')
                    page.wait_for_function(f"!document.querySelector('#learning-tour-next').disabled&&document.querySelector('#learning-tour-count').textContent.includes('{index+2} /')",timeout=120000)
                    after=page.evaluate('uiTest.data.location')
                    spot=page.evaluate('uiTest.guide.spot')
                    if id=='akiyoshidai' and index==1: assert spot=='chojagamori' and after!=before
                    if id=='aogashima' and index==0: assert spot=='ikenosawa' and after!=before
            assert page.locator('#learning-tour-next').inner_text()=='ツアーを終える'
            page.click('#learning-tour-prev');page.wait_for_timeout(2500)
            back=page.evaluate("({count:document.querySelector('#learning-tour-count').textContent,nextDisabled:document.querySelector('#learning-tour-next').disabled,status:document.querySelector('#landmark-guide-status').textContent,spot:uiTest.guide.spot,mode:uiTest.guide.mode,loading:uiTest.loading,message:document.querySelector('#message').textContent})")
            assert f'{steps-1} /' in back['count'] and not back['nextDisabled'],(id,back)
            page.click('#learning-tour-close');assert page.locator('#learning-tour').is_hidden()
            assert page.locator('#landmark-guide').is_visible() and not errors,errors
            checks.append({'viewport':f'{width}x{height}','place':id,'steps':titles,'geologyFixture':True,'webglErrors':0,'jsErrors':errors})
            page.goto(URL);page.wait_for_function("!uiTest.loading&&document.querySelector('#message').hidden",timeout=180000)
        print(f'PASS learning tour {width}x{height}',flush=True);page.close()
    browser.close();server.shutdown()
(OUT/'results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print('PASS all learning tour viewports',flush=True)
