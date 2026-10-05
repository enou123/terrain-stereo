import { stereoCamera } from './stereo.js';
import { OrbitControls } from './controls.js';
const vertexSource = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uProjection;
uniform mat4 uView;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  vNormal = aNormal;
  vColor = aColor;
  gl_Position = uProjection * uView * vec4(aPosition, 1.0);
}`;
const fragmentSource = `
precision mediump float;
uniform float uMonochrome;
varying vec3 vColor;
varying vec3 vNormal;
void main() {
  float light = max(dot(normalize(vNormal), normalize(vec3(-0.6, 1.0, -0.4))), 0.0);
  vec3 color = vColor * (0.38 + 0.78 * light);
  color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))), uMonochrome);
  gl_FragColor = vec4(color, 1.0);
}`;
export class TerrainRenderer {
  constructor(canvas, onError) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) throw new Error('この端末では WebGL を利用できません。WebGL 対応ブラウザで開いてください。');
    this.gl = gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader); throw new Error('3D描画の初期化に失敗しました。');
      }
      return shader;
    };
    this.program = gl.createProgram();
    const shaders = [compile(gl.VERTEX_SHADER, vertexSource), compile(gl.FRAGMENT_SHADER, fragmentSource)];
    for (const shader of shaders) gl.attachShader(this.program, shader);
    gl.linkProgram(this.program);
    for (const shader of shaders) gl.deleteShader(shader);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('3D描画の初期化に失敗しました。');
    this.buffers = ['aPosition','aNormal','aColor'].map(name=>({ buffer: gl.createBuffer(), location: gl.getAttribLocation(this.program,name) }));
    this.indexBuffer = gl.createBuffer();
    this.projectionLocation = gl.getUniformLocation(this.program,'uProjection');
    this.viewLocation = gl.getUniformLocation(this.program,'uView');
    this.monochromeLocation = gl.getUniformLocation(this.program,'uMonochrome');
    this.mode = 'mono';
    this.strength = 1;
    this.controls = new OrbitControls(canvas,()=>this.requestDraw());
    gl.enable(gl.DEPTH_TEST);
    canvas.addEventListener('webglcontextlost', e=>{
      e.preventDefault(); this.lost=true;
      onError(new Error('3D描画が中断されました。ページを再読み込みしてください。'), false);
    });
    canvas.addEventListener('webglcontextrestored',()=>window.location.reload());
    this.observer = new ResizeObserver(()=>this.requestDraw());
    this.observer.observe(canvas);
  }
  setMesh(mesh) {
    const gl=this.gl;
    for (const [i,array] of [mesh.positions,mesh.normals,mesh.colors].entries()) {
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[i].buffer);
      gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    this.count=mesh.indices.length;
    this.requestDraw();
  }
  reset() { this.controls.reset(); this.requestDraw(); }
  setStereo(mode, strength) {
    this.mode = mode;
    this.strength = strength;
    this.requestDraw();
  }
  requestDraw() {
    if (this.frame || this.lost) return;
    this.frame=requestAnimationFrame(()=>{this.frame=null; this.draw();});
  }
  draw() {
    if (!this.count || this.lost) return;
    const gl=this.gl, canvas=this.canvas, ratio=Math.min(window.devicePixelRatio || 1,2);
    const width=Math.max(1,Math.round(canvas.clientWidth*ratio));
    const height=Math.max(1,Math.round(canvas.clientHeight*ratio));
    if (canvas.width!==width || canvas.height!==height) {canvas.width=width; canvas.height=height;}
    const paired = this.mode === 'parallel' || this.mode === 'cross';
    const anaglyph = this.mode === 'anaglyph';
    gl.colorMask(true,true,true,true);
    gl.viewport(0,0,width,height); gl.clearColor(0,0,0,anaglyph ? 1 : 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    for (const { buffer, location } of this.buffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);
    }
    gl.uniform1f(this.monochromeLocation,anaglyph ? 1 : 0);
    const leftWidth = Math.floor(width/2);
    const aspect = (paired ? leftWidth : width)/height;
    // Keep the full terrain in view on portrait screens without changing orbit state.
    const target=this.controls.target, fit=Math.max(1,1.15/aspect);
    const eye=this.controls.eye.map((value,i)=>target[i]+(value-target[i])*fit);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);
    const separation = Math.hypot(...eye.map((value,i)=>value-target[i])) * 0.025 * this.strength;
    const renderEye = (offset, x, viewportWidth) => {
      const camera = stereoCamera(eye,target,viewportWidth/height,offset);
      gl.viewport(x,0,viewportWidth,height);
      gl.uniformMatrix4fv(this.projectionLocation,false,camera.projection);
      gl.uniformMatrix4fv(this.viewLocation,false,camera.view);
      gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
    };
    if (paired) {
      const order = this.mode === 'cross' ? 1 : -1;
      renderEye(order*separation/2,0,leftWidth);
      renderEye(-order*separation/2,width-leftWidth,leftWidth);
    } else if (anaglyph) {
      gl.colorMask(true,false,false,true);
      renderEye(-separation/2,0,width);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.colorMask(false,true,true,true);
      renderEye(separation/2,0,width);
      gl.colorMask(true,true,true,true);
    } else {
      renderEye(0,0,width);
    }
  }
}
