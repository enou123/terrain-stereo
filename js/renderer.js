import { lookAt } from './math.js?v=0.11.1';
import { ObservationOverlay } from './observation.js?v=0.11.1';
import { fitMeshPositions } from './mesh.js?v=0.11.1';
import { stereoCamera } from './stereo.js?v=0.11.1';
import { OrbitControls } from './controls.js?v=0.11.1';
const vertexSource = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute float aElevation;
attribute vec2 aUV;
uniform mat4 uProjection;
uniform mat4 uView;
varying vec2 vUV;
varying vec3 vColor;
varying vec3 vNormal;
varying float vContourHeight;
void main() {
  vUV = aUV;
  vNormal = aNormal;
  vColor = aColor;
  vContourHeight = aElevation / 100.0;
  gl_Position = uProjection * uView * vec4(aPosition, 1.0);
}`;
const fragmentSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uMonochrome;
uniform float uShading;
uniform float uTextureEnabled;
uniform sampler2D uTexture;
uniform float uContours;
uniform float uPixelRatio;
varying vec2 vUV;
varying vec3 vColor;
varying vec3 vNormal;
varying float vContourHeight;
void main() {
  float light = max(dot(normalize(vNormal), normalize(vec3(-0.6, 1.0, -0.4))), 0.0);
  vec3 color = mix(vColor, vec3(0.68), uShading) * (0.38 + 0.78 * light);
  if (uTextureEnabled > 0.5) color = texture2D(uTexture, vUV).rgb * (0.65 + 0.35 * light);
  #ifdef CONTOUR_DERIVATIVES
  if (uContours > 0.5) {
    // One contour every 100 real metres; derivatives maintain a thin screen-space line.
    float slope = fwidth(vContourHeight);
    float distanceToLine = abs(fract(vContourHeight + 0.5) - 0.5);
    float lineWidth = max(slope * 0.7 * uPixelRatio, 0.00001);
    float line = 1.0 - smoothstep(lineWidth * 0.4, lineWidth, distanceToLine);
    // Flat surfaces are not contours; fade unresolved dense lines when zoomed out.
    line *= smoothstep(0.000001, 0.00001, slope) * (1.0 - smoothstep(0.3, 0.7, slope * uPixelRatio));
    color *= 1.0 - 0.52 * line;
  }
#endif
  color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))), uMonochrome);
  gl_FragColor = vec4(color, 1.0);
}`;
export class TerrainRenderer {
  constructor(canvas, onError) {
    this.canvas = canvas;
    this.observation = new ObservationOverlay(document.querySelector('#observation-overlay'));
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) throw new Error('この端末では WebGL を利用できません。WebGL 対応ブラウザで開いてください。');
    this.gl = gl;
    this.uintIndices = gl.getExtension('OES_element_index_uint');
    this.contoursSupported = Boolean(gl.getExtension('OES_standard_derivatives'));
    this.contours = false;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader); throw new Error('3D描画の初期化に失敗しました。');
      }
      return shader;
    };
    this.program = gl.createProgram();
    const shaders = [compile(gl.VERTEX_SHADER, vertexSource), compile(gl.FRAGMENT_SHADER, (this.contoursSupported ? '#extension GL_OES_standard_derivatives : enable\n#define CONTOUR_DERIVATIVES\n' : '') + fragmentSource)];
    for (const shader of shaders) gl.attachShader(this.program, shader);
    gl.linkProgram(this.program);
    for (const shader of shaders) gl.deleteShader(shader);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('3D描画の初期化に失敗しました。');
    this.buffers = ['aPosition','aNormal','aColor','aElevation'].map(name=>({ buffer: gl.createBuffer(), location: gl.getAttribLocation(this.program,name), size: name === 'aElevation' ? 1 : 3 }));
    this.uvBuffer = gl.createBuffer();
    this.uvLocation = gl.getAttribLocation(this.program,'aUV');
    this.textureLocation = gl.getUniformLocation(this.program,'uTexture');
    this.textureEnabledLocation = gl.getUniformLocation(this.program,'uTextureEnabled');
    this.texture = null;
    this.emptyTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.emptyTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    this.indexBuffer = gl.createBuffer();
    this.projectionLocation = gl.getUniformLocation(this.program,'uProjection');
    this.viewLocation = gl.getUniformLocation(this.program,'uView');
    this.monochromeLocation = gl.getUniformLocation(this.program,'uMonochrome');
    this.contoursLocation = gl.getUniformLocation(this.program,'uContours');
    this.pixelRatioLocation = gl.getUniformLocation(this.program,'uPixelRatio');
    this.shadingLocation = gl.getUniformLocation(this.program,'uShading');
    this.surface = 'elevation';
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
    if (mesh.indices instanceof Uint32Array && !this.uintIndices) throw new Error('この端末では高精細の描画に対応していません。標準を選んでください。');
    this.indexType=mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    const fittedPositions=fitMeshPositions(mesh);
    const side=Math.sqrt(mesh.positions.length/3), uv=new Float32Array(side*side*2);
    for(let row=0;row<side;row++) for(let col=0;col<side;col++) uv.set([col/(side-1),row/(side-1)],(row*side+col)*2);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.uvBuffer);gl.bufferData(gl.ARRAY_BUFFER,uv,gl.STATIC_DRAW);
    for (const [i,array] of [fittedPositions,mesh.normals,mesh.colors,mesh.elevations].entries()) {
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[i].buffer);
      gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    this.count=mesh.indices.length;
    this.requestDraw();
  }
  setContours(enabled) {
    this.contours = this.contoursSupported && Boolean(enabled);
    this.requestDraw();
  }
  setSurface(surface) {
    this.surface = (surface === 'map' || surface === 'photo') && this.texture && this.textureSurface === surface ? surface : surface === 'shading' ? 'shading' : 'elevation';
    this.requestDraw();
  }
  setTexture(canvas, surface='map') {
    const gl=this.gl;
    if(this.texture) gl.deleteTexture(this.texture);
    this.texture=null;this.textureSurface=canvas ? surface : null;
    if(canvas) {
      this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    }
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
    this.observation.update(lookAt(this.controls.eye,this.controls.target),this.mode,width);
    const paired = this.mode === 'parallel' || this.mode === 'cross';
    const anaglyph = this.mode === 'anaglyph';
    gl.colorMask(true,true,true,true);
    gl.viewport(0,0,width,height); gl.clearColor(0,0,0,anaglyph ? 1 : 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    for (const { buffer, location, size } of this.buffers) {
      if (location < 0) continue; // Unused altitude attribute on devices without derivatives.
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,this.uvBuffer);gl.enableVertexAttribArray(this.uvLocation);
    gl.vertexAttribPointer(this.uvLocation,2,gl.FLOAT,false,0,0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture || this.emptyTexture);
    gl.uniform1i(this.textureLocation,0);
    gl.uniform1f(this.textureEnabledLocation,(this.surface==='map'||this.surface==='photo') && this.texture ? 1 : 0);
    gl.uniform1f(this.monochromeLocation,anaglyph ? 1 : 0);
    gl.uniform1f(this.shadingLocation,this.surface === 'shading' ? 1 : 0);
    gl.uniform1f(this.contoursLocation,this.contours ? 1 : 0);
    gl.uniform1f(this.pixelRatioLocation,ratio);
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
      gl.drawElements(gl.TRIANGLES,this.count,this.indexType,0);
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
