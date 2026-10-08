const STEPS = [
  { title:'尾根と谷を立体で眺める', target:'#terrain', hold:6,
    copy:'実際の標高から作られた地形です。地形がゆっくり回り、山へ近づいてから高度を変えます。手で操作するときはドラッグで回転、ホイールや2本指で拡大・縮小できます。',
    run:'demoTerrain' },
  { title:'高さを強調して起伏を比べる', target:'#exaggeration', hold:5,
    copy:'高さ強調を1.0倍から3.0倍へ上げると、谷の深さや尾根の連なりが目に入りやすくなります。最後に元の倍率へ戻します。',
    run:'demoHeight' },
  { title:'太陽の向きを動かして陰影を見る', target:'#sun-azimuth', hold:5,
    copy:'光の向きを変えると、同じ斜面でも明るく見える面と影になる面が入れ替わります。山の起伏を別の角度から読み取れます。',
    run:'demoSun' },
  { title:'地形表面を見比べる', target:'#surface', hold:6,
    copy:'同じ山に、標高の色・陰影・地理院地図・航空写真・地質図を順番に重ね、各表示をゆっくり見比べます。紹介の後は標高の色に戻して次へ進みます。',
    run:'demoSurfaces' },
  { title:'立体視で奥行きを楽しむ', target:'#view-mode', hold:6,
    copy:'通常3Dから左右画像の平行法・交差法、赤シアンへ切り替えます。平行法は遠くを見るように、交差法は視線を交差させて左右の画像を重ねます。赤シアンには対応する眼鏡が必要です。',
    run:'demoStereo' },
  { title:'等高線を地形に重ねる', target:'#contours', hold:5,
    copy:'チェックを入れると、実標高100 mごとの線が3D地形に現れます。斜面の傾きや尾根と谷の間隔を、立体の形と合わせて見てみましょう。',
    run:'demoContours' },
  { title:'地形を切って断面を見る', target:'#profile-start', hold:6,
    copy:'地形上の2点を自動で選び、断面図を作ります。横軸は始点からの水平距離、縦軸は高さ強調前の標高です。山を越える高さの変化を確かめましょう。',
    run:'demoProfile' },
  { title:'別の山へ移動する', target:'#map-place', hold:5,
    copy:'地図や山の一覧から見たい場所を選べます。ここでは石鎚山から富士山へ移動し、火山の大きな山体と周辺の地形を表示します。地形データの読み込みが終わるまで待ちます。',
    run:'demoLocation' },
  { title:'山の上を遊覧飛行する', target:'#flight-toggle', hold:4,
    copy:'地形の上を一周する遊覧飛行を実演します。カメラが周囲を回りながら近づき、高度を変えます。次へ進むか終了すると、その場で飛行を止めます。',
    run:'demoFlight' },
  { title:'見つけた地形を持ち帰る', target:'#share-view', hold:6,
    copy:'共有リンクには場所・視点・表示設定が入ります。PNGでは今の3D地形を画像にできます。これでツアーは終了です。終了すると、始める前の場所や表示設定へ戻ります。',
    run:async()=>({}) },
];

export function setupAppTour(actions) {
  const launch=document.querySelector('#start-app-tour');
  if(!launch)return null;
  const root=document.createElement('div');root.className='app-tour-scrim';root.hidden=true;
  root.innerHTML=`<svg class="app-tour-dim" aria-hidden="true" focusable="false"><defs><mask id="app-tour-dim-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:luminance"><rect class="app-tour-mask-base" fill="white"></rect><rect class="app-tour-mask-target" fill="black"></rect><rect class="app-tour-mask-viewer" fill="black"></rect></mask></defs><rect class="app-tour-dim-field" fill="#0d1a1599" mask="url(#app-tour-dim-mask)"></rect></svg><div class="app-tour-spotlight" aria-hidden="true"></div><section class="app-tour-card" role="dialog" aria-modal="true" aria-labelledby="app-tour-title" aria-describedby="app-tour-copy"><div class="app-tour-kicker">地形探訪 · 機能紹介ツアー</div><div class="app-tour-meta"><span class="app-tour-count"></span><button class="app-tour-close" type="button" aria-label="ツアーを終了">×</button></div><h2 id="app-tour-title"></h2><p id="app-tour-copy"></p><p class="app-tour-status" aria-live="polite"></p><button class="app-tour-retry" type="button" hidden>もう一度試す</button><div class="app-tour-timer" aria-hidden="true"><span></span></div><div class="app-tour-controls"><button class="app-tour-back" type="button">← 戻る</button><button class="app-tour-auto" type="button" aria-pressed="false">▶ 自動で進む</button><button class="app-tour-pause" type="button" aria-pressed="false">⏸ 一時停止</button><div class="app-tour-spacer"></div><button class="app-tour-next" type="button">次へ →</button><button class="app-tour-end" type="button">終了</button></div></section>`;
  document.body.append(root);
  const spotlight=root.querySelector('.app-tour-spotlight'),card=root.querySelector('.app-tour-card');
  const maskBase=root.querySelector('.app-tour-mask-base'),maskTarget=root.querySelector('.app-tour-mask-target'),maskViewer=root.querySelector('.app-tour-mask-viewer');
  const count=root.querySelector('.app-tour-count'),title=root.querySelector('#app-tour-title'),copy=root.querySelector('#app-tour-copy');
  const status=root.querySelector('.app-tour-status'),retry=root.querySelector('.app-tour-retry');
  const back=root.querySelector('.app-tour-back'),next=root.querySelector('.app-tour-next');
  const auto=root.querySelector('.app-tour-auto'),pause=root.querySelector('.app-tour-pause'),end=root.querySelector('.app-tour-end');
  const bar=root.querySelector('.app-tour-timer span');
  let active=false,index=0,target=null,controller=null,autoPlay=false,paused=false,stepReady=false,timerFrame=0,timerRemaining=0,timerLast=0,starting=false,initialRetry=false,previousFocus=null,completionText='',lastTimerSecond=-1;

  function position(){
    if(!active||!target||!target.isConnected||!target.getClientRects().length)return;
    const r=target.getBoundingClientRect(),pad=7;
    const setHole=(el,box,padding=0)=>{el.setAttribute('x',Math.max(0,box.left-padding));el.setAttribute('y',Math.max(0,box.top-padding));el.setAttribute('width',Math.max(0,Math.min(innerWidth,box.right+padding)-Math.max(0,box.left-padding)));el.setAttribute('height',Math.max(0,Math.min(innerHeight,box.bottom+padding)-Math.max(0,box.top-padding)));el.setAttribute('rx',padding?Math.max(5,parseFloat(getComputedStyle(target).borderRadius)||5):10);};
    [maskBase,root.querySelector('.app-tour-dim-field')].forEach(el=>{el.setAttribute('width',innerWidth);el.setAttribute('height',innerHeight);});
    root.querySelector('.app-tour-dim').setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    setHole(maskTarget,r,pad);
    const viewer=document.querySelector('#viewer'),vr=viewer?.getBoundingClientRect();
    if(innerWidth>900&&vr&&vr.width&&vr.height)setHole(maskViewer,vr);else setHole(maskViewer,{left:0,top:0,right:0,bottom:0});
    spotlight.style.left=`${Math.max(6,r.left-pad)}px`;spotlight.style.top=`${Math.max(6,r.top-pad)}px`;
    spotlight.style.width=`${Math.max(12,Math.min(innerWidth-12,r.width+pad*2))}px`;
    spotlight.style.height=`${Math.max(12,Math.min(innerHeight-12,r.height+pad*2))}px`;
    spotlight.style.borderRadius=getComputedStyle(target).borderRadius||'10px';
    card.classList.toggle('app-tour-card-left',innerWidth>760&&r.left+r.width/2>innerWidth*.58);
    const cardHeight=card.getBoundingClientRect().height;
    card.classList.toggle('app-tour-card-top',r.bottom>innerHeight-cardHeight-22&&r.top>cardHeight+18);
  }
  function focus(selector){
    const nextTarget=document.querySelector(selector);if(!nextTarget)return false;
    target?.classList.remove('app-tour-highlight');target=nextTarget;target.classList.add('app-tour-highlight');
    document.body.classList.toggle('app-tour-mini-scene',matchMedia('(max-width:900px)').matches&&document.querySelector('#view-settings').contains(target));
    target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest',inline:'nearest'});
    requestAnimationFrame(position);return true;
  }
  function timerTick(now){
    if(!active||!autoPlay||!stepReady)return;
    if(!timerLast)timerLast=now;
    if(!paused)timerRemaining=Math.max(0,timerRemaining-(now-timerLast));
    timerLast=now;bar.style.transform=`scaleX(${Math.max(0,timerRemaining/(STEPS[index].hold*1000))})`;
    const seconds=Math.ceil(timerRemaining/1000);
    if(seconds!==lastTimerSecond){lastTimerSecond=seconds;status.textContent=paused?'一時停止中':`自動で次の紹介へ · ${seconds}秒`;}
    if(timerRemaining<=0){timerFrame=0;if(index===STEPS.length-1)finish();else show(index+1);return;}
    timerFrame=requestAnimationFrame(timerTick);
  }
  function stopTimer(){if(timerFrame)cancelAnimationFrame(timerFrame);timerFrame=0;timerLast=0;}
  function beginTimer(){
    stopTimer();if(!autoPlay||!stepReady||paused)return;
    timerRemaining=STEPS[index].hold*1000;timerLast=0;timerFrame=requestAnimationFrame(timerTick);
  }
  function renderStep(){
    const s=STEPS[index];completionText='';lastTimerSecond=-1;count.textContent=`${index+1} / ${STEPS.length}`;title.textContent=s.title;copy.innerHTML=s.copy;
    back.disabled=index===0;next.textContent=index===STEPS.length-1?'完了':'次へ →';
    next.disabled=false;
    bar.style.transform='scaleX(1)';status.textContent='実演を準備しています…';retry.hidden=true;
    auto.setAttribute('aria-pressed',String(autoPlay));auto.textContent=autoPlay?'⏸ 自動を止める':'▶ 自動で進む';
    pause.setAttribute('aria-pressed',String(paused));pause.textContent=paused?'▶ 続ける':'⏸ 一時停止';
  }
  async function show(nextIndex){
    if(!active)return;
    stopTimer();controller?.abort();actions.stopDemo?.();
    index=Math.max(0,Math.min(STEPS.length-1,nextIndex));stepReady=false;paused=false;actions.setPaused?.(false);
    const s=STEPS[index];renderStep();actions.prepare?.(s.target);focus(s.target);
    controller=new AbortController();const signal=controller.signal;
    try{
      status.textContent='3D地形を動かしています…';
      const api={focus,isPaused:()=>paused,wait:ms=>wait(ms,signal)};
      const result=typeof s.run==='string'?await actions[s.run](api,signal):await s.run(api,signal);
      if(!active||signal.aborted)return;
      stepReady=true;completionText=result?.message||'実演しました。次へ進むか、自動で続けられます。';status.textContent=completionText;
      retry.hidden=true;beginTimer();
    }catch(error){
      if(!active||signal.aborted)return;
      stepReady=false;status.textContent=`この場面を実演できませんでした。${error.message||'読み込みや操作に失敗しました。'}`;
      retry.hidden=false;stopTimer();
    }
  }
  function wait(ms,signal){
    return new Promise((resolve,reject)=>{
      let left=ms,last=performance.now();
      const tick=()=>{
        if(signal.aborted){reject(new DOMException('Tour step stopped','AbortError'));return;}
        const now=performance.now();if(!paused)left-=now-last;last=now;
        if(left<=0){resolve();return;}setTimeout(tick,32);
      };tick();
    });
  }
  async function start(){
    if(active||starting)return;starting=true;previousFocus=document.activeElement;
    root.hidden=false;document.body.classList.add('app-tour-active');active=true;index=0;
    status.textContent='現在の3D地形を準備しています…';title.textContent='地形を準備しています';copy.textContent='標高データの読み込みが終わるまでお待ちください。';count.textContent='';
    next.disabled=true;
    root.querySelector('.app-tour-close').focus({preventScroll:true});
    try{
      const ready=await actions.waitForReady();
      if(!active)return;
      if(!ready){initialRetry=true;status.textContent='3D地形を読み込めませんでした。通信を確認して、再試行してください。';retry.hidden=false;return;}
      await actions.capture();
      starting=false;await show(0);
    }catch(error){starting=false;if(active){status.textContent=`ツアーを開始できませんでした。${error.message||''}`;retry.hidden=false;}}
  }
  async function finish(){
    if(!active)return;stopTimer();controller?.abort();actions.stopDemo?.();stepReady=false;
    title.textContent='通常の表示に戻しています';status.textContent='ツアー中に変えた場所と設定を戻しています…';next.disabled=true;back.disabled=true;auto.disabled=true;pause.disabled=true;end.disabled=true;
    try{await actions.restore();}
    catch(error){status.textContent=`元の表示へ戻せませんでした。${error.message||''}`;next.disabled=false;end.disabled=false;return;}
    active=false;starting=false;paused=false;actions.setPaused?.(false);target?.classList.remove('app-tour-highlight');target=null;
    document.body.classList.remove('app-tour-active','app-tour-mini-scene');root.hidden=true;window.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);
    previousFocus?.focus?.({preventScroll:true});
  }
  function setAuto(value){autoPlay=value;auto.setAttribute('aria-pressed',String(value));auto.textContent=value?'⏸ 自動を止める':'▶ 自動で進む';if(value&&stepReady){lastTimerSecond=-1;beginTimer();}else{stopTimer();if(stepReady)status.textContent=completionText;}}
  function setPause(value){paused=value;actions.setPaused?.(value);pause.setAttribute('aria-pressed',String(value));pause.textContent=value?'▶ 続ける':'⏸ 一時停止';timerLast=0;lastTimerSecond=-1;if(value&&autoPlay&&stepReady)status.textContent='自動進行を一時停止中';if(!value&&autoPlay&&stepReady&&!timerFrame)timerFrame=requestAnimationFrame(timerTick);}
  launch.addEventListener('click',start);
  root.querySelector('.app-tour-close').addEventListener('click',finish);end.addEventListener('click',finish);
  back.addEventListener('click',()=>{if(index>0)show(index-1);});
  next.addEventListener('click',()=>{if(index===STEPS.length-1)finish();else show(index+1);});
  auto.addEventListener('click',()=>setAuto(!autoPlay));pause.addEventListener('click',()=>setPause(!paused));
  retry.addEventListener('click',async()=>{
    retry.hidden=true;
    if(initialRetry){status.textContent='地形データを再読み込みしています…';const ok=await actions.retry();if(!active)return;if(ok){initialRetry=false;await actions.capture();starting=false;await show(0);}else{status.textContent='読み込みに失敗しました。もう一度お試しください。';retry.hidden=false;}}
    else {status.textContent='この場面をもう一度実演しています…';await show(index);}
  });
  window.addEventListener('scroll',position,true);window.addEventListener('resize',position);
  document.addEventListener('keydown',e=>{
    if(!active)return;
    if(e.key==='Escape'){e.preventDefault();finish();}
    else if(e.key==='ArrowRight'&&stepReady){e.preventDefault();next.click();}
    else if(e.key==='ArrowLeft'&&index>0){e.preventDefault();back.click();}
    else if(e.key===' '&&!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||'')){e.preventDefault();setPause(!paused);}
    else if(e.key==='Tab'){
      const items=[...card.querySelectorAll('button:not(:disabled):not([hidden])')];const first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  return {get active(){return active},get paused(){return paused},focus};
}
