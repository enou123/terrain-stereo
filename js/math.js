export function perspective(fov, aspect, near, far) {
  const f=1/Math.tan(fov/2), d=1/(near-far);
  return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*d,-1,0,0,2*far*near*d,0]);
}
export function lookAt(eye, target, upHint) {
  const normalize=v=>{ const n=Math.hypot(...v); return v.map(x=>x/n); };
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const z=normalize(eye.map((x,i)=>x-target[i]));
  // At the zenith, use geographic north as screen up instead of a parallel up vector.
  const up=upHint || (Math.hypot(z[0],z[2])<1e-8?[0,0,-1]:[0,1,0]);
  const x=normalize(cross(up,z)), y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
