import {gridSample,sectionSamples,projectPoint,gridPosition,pickSurface} from './profile.js?v=0.30.0';
const NS='http://www.w3.org/2000/svg';
function svg(parent,name,attributes,text='') {
  const element=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attributes))element.setAttribute(key,value);
  element.textContent=text;parent.append(element);return element;
}
export class SectionTool {
  constructor(renderer,viewerUI) {
    this.renderer=renderer;this.viewerUI=viewerUI;this.points=[];this.active=false;
    this.chart=document.querySelector('#profile-chart');this.overlay=document.querySelector('#profile-overlay');
    this.prompt=document.querySelector('#profile-prompt');this.status=document.querySelector('#profile-status');
    document.querySelector('#profile-clear').addEventListener('click',()=>this.clear());
    document.querySelector('#profile-cancel').addEventListener('click',()=>{this.clear();this.viewerUI.setSettingsOpen(true);document.querySelector('#profile-start').focus({preventScroll:true});});
    renderer.onDraw=()=>this.drawMarkers();
    const canvas=renderer.canvas, pointers=new Set();let tap=null;
    canvas.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse' && event.button!==0)return;
      pointers.add(event.pointerId);
      if(pointers.size===1 && event.button===0 && !event.shiftKey && !event.ctrlKey && !event.altKey && this.active)tap={id:event.pointerId,x:event.clientX,y:event.clientY};
      else tap=null;
    });
    canvas.addEventListener('pointermove',event=>{if(tap && Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>6)tap=null;});
    canvas.addEventListener('pointerup',event=>{
      const selection=tap?.id===event.pointerId && pointers.size===1 ? tap : null;
      tap=null;pointers.delete(event.pointerId);
      if(selection)this.select(event.clientX,event.clientY);
    });
    for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{tap=null;pointers.delete(event.pointerId);});
    canvas.addEventListener('keydown',event=>{
      if(!this.active)return;
      if(event.key==='Enter') {event.preventDefault();const r=canvas.getBoundingClientRect();const paired=renderer.mode==='parallel'||renderer.mode==='cross';this.select(r.left+r.width*(paired ? .25 : .5),r.top+r.height/2);}
      if(event.key==='Escape') {event.preventDefault();event.stopPropagation();this.clear();}
    });
  }
  setData(data) {
    const key=JSON.stringify([data.location.latitude,data.location.longitude,data.location.zoom]);
    if(this.key!==key)this.clear();
    this.key=key;this.data=data;
    if(this.points.length===2)this.drawChart();
    this.drawMarkers();
  }
  captureState() {
    return {points:this.points.map(point=>({...point})),active:this.active};
  }
  restoreState(state,data) {
    this.setData(data);
    this.points=state?.points?.map(point=>({...point}))||[];
    this.active=Boolean(state?.active&&this.points.length<2);
    this.prompt.hidden=!this.active;
    this.renderer.canvas.classList.toggle('section-selecting',this.active);
    document.querySelector('#workspace').classList.toggle('section-selecting',this.active);
    document.querySelector('#profile-clear').hidden=this.points.length!==2;
    document.querySelector('#profile-note').hidden=this.points.length!==2;
    document.querySelector('#profile-start').textContent=this.points.length===2?'選び直す':'2点を選ぶ';
    if(this.active)this.instruction();
    else this.prompt.hidden=true;
    if(this.points.length===2)this.drawChart();
    else {this.chart.setAttribute('hidden','');this.overlay.toggleAttribute('hidden',!this.points.length);this.drawMarkers();}
  }
  clear() {
    this.active=false;this.points=[];this.result=null;this.prompt.hidden=true;this.overlay.setAttribute('hidden','');this.chart.setAttribute('hidden','');
    document.querySelector('#profile-note').hidden=true;document.querySelector('#profile-clear').hidden=true;
    document.querySelector('#profile-start').textContent='2点を選ぶ';this.status.textContent='';
    this.renderer.canvas.classList.remove('section-selecting');document.querySelector('#workspace').classList.remove('section-selecting');
  }
  start() {
    this.clear();this.active=true;this.prompt.hidden=false;this.instruction();
    this.renderer.canvas.classList.add('section-selecting');document.querySelector('#workspace').classList.add('section-selecting');this.viewerUI.setSettingsOpen(false);
    document.querySelector('#workspace').scrollIntoView({block:'start'});this.renderer.canvas.focus({preventScroll:true});
  }
  instruction(message) {document.querySelector('#profile-instruction').textContent=message || (this.points.length ? '終点Bをタップ（Enterで中央）' : '始点Aをタップ（Enterで中央）');}
  select(clientX,clientY) {
    if(!this.active || !this.renderer.mesh || this.renderer.lost || !document.querySelector('#message').hidden)return;
    const renderer=this.renderer,r=renderer.canvas.getBoundingClientRect(),x=(clientX-r.left)*renderer.canvas.width/r.width,y=(clientY-r.top)*renderer.canvas.height/r.height;
    const camera=renderer.cameras(undefined,undefined,true).find(c=>x>=c.x&&x<c.x+c.width);
    const hit=camera && pickSurface(x,y,camera,renderer.mesh);
    if(!hit || !Number.isFinite(gridSample(this.data,hit.u,hit.v))) {this.instruction('地形のあるところをタップしてください');return;}
    if(this.points.length && Math.hypot(hit.u-this.points[0].u,hit.v-this.points[0].v)<1e-5) {this.instruction('Aから離れたところを選んでください');return;}
    this.points.push(hit);this.drawMarkers();
    if(this.points.length===1) {this.instruction();return;}
    this.active=false;this.prompt.hidden=true;renderer.canvas.classList.remove('section-selecting');document.querySelector('#workspace').classList.remove('section-selecting');
    this.drawChart();this.viewerUI.setSettingsOpen(true);
    document.querySelector('#profile-section').scrollIntoView({block:'nearest'});
    document.querySelector('#profile-start').focus({preventScroll:true});
  }
  drawMarkers() {
    this.overlay.replaceChildren();this.overlay.toggleAttribute('hidden',!this.points.length);
    if(!this.points.length || !this.renderer.mesh)return;
    const r=this.renderer,ratio=r.canvas.width/r.canvas.clientWidth;
    this.overlay.setAttribute('viewBox',`0 0 ${r.canvas.width} ${r.canvas.height}`);
    for(const [index,camera] of r.cameras(undefined,undefined,true).entries()) {
      const clip=svg(this.overlay,'clipPath',{id:`profile-clip-${index}`});svg(clip,'rect',{x:camera.x,y:0,width:camera.width,height:camera.height});
      const group=svg(this.overlay,'g',{'clip-path':`url(#profile-clip-${index})`});
      for(const [i,point] of this.points.entries()) {
        if(!Number.isFinite(gridSample(this.data,point.u,point.v)))continue;
        const p=projectPoint(gridPosition(r.mesh,point),camera);
        if(p.w<=0 || p.z<-1 || p.z>1)continue;
        svg(group,'circle',{cx:p.x,cy:p.y,r:5*ratio,fill:'#edf3d5',stroke:'#243e2c','stroke-width':1.5*ratio});
        svg(group,'text',{x:p.x+9*ratio,y:p.y-8*ratio,fill:'#fff','font-size':13*ratio,'font-weight':600,stroke:'#193124','stroke-width':2*ratio,'paint-order':'stroke'},i?'B':'A');
      }
    }
  }
  drawChart() {
    this.result=sectionSamples(this.data,...this.points);const {samples,length}=this.result;
    const finite=samples.filter(p=>Number.isFinite(p.height));
    this.chart.replaceChildren();this.chart.removeAttribute('hidden');document.querySelector('#profile-note').hidden=false;
    document.querySelector('#profile-clear').hidden=false;document.querySelector('#profile-start').textContent='選び直す';
    if(!finite.length) {this.chart.setAttribute('hidden','');this.status.textContent='この断面には標高データがありません。選び直してください。';return;}
    const minimum=Math.min(...finite.map(p=>p.height)),maximum=Math.max(...finite.map(p=>p.height)),pad=Math.max(10,(maximum-minimum)*.12),low=minimum-pad,high=maximum+pad;
    const x=t=>42+t*264,y=h=>142-(h-low)/(high-low)*110;
    svg(this.chart,'title',{},`AからBまで約${length.toFixed(2)} kmの地形断面。高さ強調前の標高。`);
    for(let i=0;i<3;i++) {
      const h=low+(high-low)*i/2,py=y(h);
      svg(this.chart,'line',{x1:42,x2:306,y1:py,y2:py,stroke:'#dce2d5'});
      svg(this.chart,'text',{x:36,y:py+4,'text-anchor':'end'},Math.round(h));
    }
    svg(this.chart,'text',{x:4,y:17},'標高 m');
    svg(this.chart,'line',{x1:42,x2:306,y1:142,y2:142,stroke:'#829275'});
    let path='',previous=null;
    for(const p of samples) {
      if(!Number.isFinite(p.height)) {previous=null;continue;}
      const middle=previous && (p.t+previous.t)/2;
      const connected=previous && Number.isFinite(gridSample(this.data,this.points[0].u+(this.points[1].u-this.points[0].u)*middle,this.points[0].v+(this.points[1].v-this.points[0].v)*middle));
      path+=`${connected?'L':'M'}${x(p.t).toFixed(2)},${y(p.height).toFixed(2)} `;previous=p;
    }
    svg(this.chart,'path',{d:path,fill:'none',stroke:'#587440','stroke-width':2});
    svg(this.chart,'text',{x:42,y:164,'text-anchor':'middle'},'A · 0');
    svg(this.chart,'text',{x:174,y:185,'text-anchor':'middle'},'Aからの水平距離 km');
    svg(this.chart,'text',{x:306,y:164,'text-anchor':'end'},`B · ${length.toFixed(2)}`);
    const altitude=p=>Number.isFinite(p.height)?`${Math.round(p.height)} m`:'データなし';
    this.status.textContent=`A：${altitude(samples[0])} → B：${altitude(samples.at(-1))}`;
    this.chart.setAttribute('aria-label',`地形断面図。${this.status.textContent}。水平距離約${length.toFixed(2)} km。${finite.length<samples.length?'データのない区間があります。':''}`);
  }
}
