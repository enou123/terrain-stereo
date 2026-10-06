export class OrbitControls {
  constructor(canvas, redraw) {
    this.canvas = canvas;
    this.redraw = redraw;
    this.pointers = new Map();
    this.reset();
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      if (e.pointerType === 'mouse' && e.button === 1) e.preventDefault();
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.pointerType === 'mouse' && e.button === 1 });
    });
    // Prevent the browser's middle-button autoscroll while moving the terrain.
    canvas.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    canvas.addEventListener('pointermove', e => {
      const previous = this.pointers.get(e.pointerId);
      if (!previous) return;
      const before = [...this.pointers.values()];
      this.pointers.set(e.pointerId, { ...previous, x: e.clientX, y: e.clientY });
      const after = [...this.pointers.values()];
      if (before.length === 2) {
        const distance = p => Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
        const oldDistance = distance(before), newDistance = distance(after);
        if (newDistance > 1 && oldDistance > 1) this.zoom(oldDistance / newDistance);
        this.pan((after[0].x+after[1].x-before[0].x-before[1].x)/2,
          (after[0].y+after[1].y-before[0].y-before[1].y)/2);
      } else if (before.length === 1) {
        const dx = e.clientX-previous.x, dy = e.clientY-previous.y;
        if (previous.pan || e.shiftKey) this.pan(dx,dy);
        else { this.yaw -= dx * 0.007; this.pitch += dy * 0.007; }
      }
      this.clamp(); this.redraw();
    });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, e=>this.pointers.delete(e.pointerId));
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);
      this.zoom(Math.exp(Math.max(-200, Math.min(200,pixels))*0.0015));
      this.redraw();
    }, { passive: false });
    canvas.addEventListener('keydown', e => {
      switch(e.key) {
        case 'ArrowLeft': this.yaw-=0.1; break;
        case 'ArrowRight': this.yaw+=0.1; break;
        case 'ArrowUp': this.pitch+=0.08; break;
        case 'ArrowDown': this.pitch-=0.08; break;
        case '+': case '=': this.zoom(0.9); break;
        case '-': this.zoom(1.1); break;
        case 'w': case 'W': if (!this.flightMode) return; this.fly('forward'); break;
        case 's': case 'S': if (!this.flightMode) return; this.fly('backward'); break;
        case 'a': case 'A': if (!this.flightMode) return; this.fly('left'); break;
        case 'd': case 'D': if (!this.flightMode) return; this.fly('right'); break;
        case 'q': case 'Q': if (!this.flightMode) return; this.fly('up'); break;
        case 'e': case 'E': if (!this.flightMode) return; this.fly('down'); break;
        case 'r': case 'R': this.reset(); break;
        default: return;
      }
      e.preventDefault(); this.clamp(); this.redraw();
    });
  }
  reset() { this.yaw=0.38; this.pitch=0.75; this.distance=19; this.target=[0,1.1,0]; }
  clamp() { this.pitch=Math.max(0.12,Math.min(1.48,this.pitch)); this.distance=Math.max(4,Math.min(45,this.distance)); }
  zoom(factor) { this.distance*=factor; this.clamp(); }
  setFlightMode(enabled) { this.flightMode=Boolean(enabled); }
  fly(direction) {
    const step=0.65, forward=[-Math.sin(this.yaw),-Math.cos(this.yaw)], right=[Math.cos(this.yaw),-Math.sin(this.yaw)];
    if(direction==='forward'||direction==='backward') {
      const sign=direction==='forward'?1:-1;
      this.target[0]+=forward[0]*step*sign; this.target[2]+=forward[1]*step*sign;
    } else if(direction==='left'||direction==='right') {
      const sign=direction==='right'?1:-1;
      this.target[0]+=right[0]*step*sign; this.target[2]+=right[1]*step*sign;
    } else if(direction==='up') this.target[1]+=0.22;
    else if(direction==='down') this.target[1]-=0.22;
    else return;
    this.target[0]=Math.max(-12,Math.min(12,this.target[0]));
    this.target[1]=Math.max(0.1,Math.min(8,this.target[1]));
    this.target[2]=Math.max(-12,Math.min(12,this.target[2]));
    this.redraw();
  }
  pan(dx,dy) {
    const scale=this.distance*0.0015;
    this.target[0]+=(-dx*Math.cos(this.yaw)-dy*Math.sin(this.yaw))*scale;
    this.target[2]+=(dx*Math.sin(this.yaw)-dy*Math.cos(this.yaw))*scale;
    this.target[0]=Math.max(-12,Math.min(12,this.target[0]));
    this.target[2]=Math.max(-12,Math.min(12,this.target[2]));
  }
  get eye() {
    return [this.target[0]+this.distance*Math.cos(this.pitch)*Math.sin(this.yaw),
      this.target[1]+this.distance*Math.sin(this.pitch),
      this.target[2]+this.distance*Math.cos(this.pitch)*Math.cos(this.yaw)];
  }
}
