// Terrain coordinates: east +X, north -Z. Project directions onto camera right/up.
// Translation and eye separation do not change these directions.
export function compassDirections(view) {
  return [['N',0,-1],['E',1,0],['S',0,1],['W',-1,0]].map(([label,x,z])=>({
    label, x:view[0]*x+view[8]*z, y:-(view[1]*x+view[9]*z)
  }));
}

export class ObservationOverlay {
  constructor(element) {
    this.element=element;
    const svgNS='http://www.w3.org/2000/svg';
    const svgElement=(name,attributes,parent)=>{
      const node=document.createElementNS(svgNS,name);
      for(const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
      parent.append(node); return node;
    };
    this.panes=[0,1].map(()=>{
      const pane=document.createElement('div'); pane.className='observation-pane';
      element.append(pane);
      const mark=document.createElement('span'); mark.className='alignment-mark'; pane.append(mark);
      const button=document.createElement('button');button.type='button';button.className='compass-control';
      button.setAttribute('aria-label','北を上にして地形を真上から表示');button.title='北を上にして地形を真上から表示';pane.append(button);
      button.addEventListener('click',()=>element.dispatchEvent(new CustomEvent('terrain-north-view',{bubbles:true})));
      const svg=svgElement('svg',{viewBox:'0 0 64 64',class:'compass','aria-hidden':'true'},button);
      svgElement('circle',{cx:32,cy:32,r:30,class:'compass-disc'},svg);
      const directions=['N','E','S','W'].map(label=>{
        const line=svgElement('line',{x1:32,y1:32,class:label==='N'?'north':'cardinal'},svg);
        const text=svgElement('text',{'text-anchor':'middle','dominant-baseline':'central',class:label==='N'?'north':'cardinal'},svg);
        text.textContent=label; return {line,text};
      });
      const arrow=svgElement('path',{d:'M 0 -3 L -2 2 L 2 2 Z',class:'north compass-arrow'},svg);
      return {pane,mark,directions,arrow};
    });
  }
  update(view,mode,width) {
    const paired=mode==='parallel'||mode==='cross';
    const directions=compassDirections(view), half=Math.floor(width/2);
    this.element.hidden=false;
    for(const [i,{pane,mark,directions:nodes,arrow}] of this.panes.entries()) {
      pane.hidden=i===1&&!paired; mark.hidden=!paired;
      pane.style.left=`${paired&&i===1?(width-half)/width*100:0}%`;
      pane.style.width=`${paired?half/width*100:100}%`;
      for(const [j,direction] of directions.entries()) {
        const x=32+direction.x*18,y=32+direction.y*18;
        nodes[j].line.setAttribute('x2',x); nodes[j].line.setAttribute('y2',y);
        // Move labels away from the axis tips so low camera angles stay readable.
        const sign=value=>Math.abs(value)<.01?0:Math.sign(value);
        nodes[j].text.setAttribute('x',x+sign(direction.x)*7);
        nodes[j].text.setAttribute('y',y+sign(direction.y)*7);
      }
      const north=directions[0];
      arrow.setAttribute('transform',`translate(${32+north.x*18} ${32+north.y*18}) rotate(${Math.atan2(north.y,north.x)*180/Math.PI+90})`);
    }
  }
}
