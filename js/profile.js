// Work in grid coordinates so sections survive height and quality changes.
export function gridSample(data, u, v) {
  if(u<0 || u>1 || v<0 || v>1) return NaN;
  const n=data.size-1, x=u*n, z=v*n, c=Math.min(n-1,Math.floor(x)), r=Math.min(n-1,Math.floor(z));
  const a=x-c, b=z-r, i=r*data.size+c;
  const entries=a+b<=1 ? [[i,1-a-b],[i+1,a],[i+data.size,b]] : [[i+1,1-b],[i+data.size,1-a],[i+data.size+1,a+b-1]];
  // Match mesh triangles, including missing vertices (even at a triangle edge).
  if(entries.some(([index])=>!Number.isFinite(data.heights[index]))) return NaN;
  return entries.reduce((sum,[index,weight])=>sum+data.heights[index]*weight,0);
}
export function sectionSamples(data, a, b) {
  const span=(data.size-1)*data.spacing, length=Math.hypot(b.u-a.u,b.v-a.v)*span;
  // At most half a grid cell per sample. Include exact grid/diagonal crossings
  // so a missing triangle never gets bridged by a long graph segment.
  const steps=Math.max(1,Math.ceil(Math.hypot(b.u-a.u,b.v-a.v)*(data.size-1)*2));
  const times=new Set(Array.from({length:steps+1},(_,i)=>i/steps));
  for(const [start,end] of [[a.u,b.u],[a.v,b.v],[a.u+a.v,b.u+b.v]]) {
    const delta=(end-start)*(data.size-1);
    if(Math.abs(delta)<1e-10) continue;
    const base=start*(data.size-1), low=Math.min(base,base+delta), high=Math.max(base,base+delta);
    for(let k=Math.ceil(low);k<=Math.floor(high);k++) {const t=(k-base)/delta;if(t>0&&t<1)times.add(t);}
  }
  return {length, samples:[...times].sort((x,y)=>x-y).map(t=>({t,distance:t*length,height:gridSample(data,a.u+(b.u-a.u)*t,a.v+(b.v-a.v)*t)}))};
}
export function projectPoint(point, camera) {
  const transform=(m,p)=>[0,1,2,3].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]*p[3]);
  const clip=transform(camera.projection,transform(camera.view,[...point,1]));
  return {x:camera.x+(clip[0]/clip[3]+1)*camera.width/2,y:(1-clip[1]/clip[3])*camera.height/2,z:clip[2]/clip[3],w:clip[3]};
}
export function gridPosition(mesh, point) {
  const size=mesh.size, x=point.u*(size-1), z=point.v*(size-1), c=Math.min(size-2,Math.floor(x)),r=Math.min(size-2,Math.floor(z)),a=x-c,b=z-r,i=r*size+c;
  const entries=a+b<=1 ? [[i,1-a-b],[i+1,a],[i+size,b]] : [[i+1,1-b],[i+size,1-a],[i+size+1,a+b-1]];
  return [0,1,2].map(k=>entries.reduce((sum,[j,w])=>sum+mesh.positions[j*3+k]*w,0));
}
// Screen barycentrics corrected by clip W give the exact visible mesh hit,
// including off-axis stereo projections. No network or GPU readback required.
export function pickSurface(x,y,camera,mesh) {
  if(x<camera.x || x>camera.x+camera.width || y<0 || y>camera.height) return null;
  const projected=new Float64Array(mesh.positions.length/3*4);
  const matrix=new Float64Array(16),projection=camera.projection,view=camera.view;
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)matrix[c*4+r]+=projection[k*4+r]*view[c*4+k];
  // Avoid allocating temporary vectors for every vertex on large iPhone meshes.
  for(let i=0;i<mesh.positions.length/3;i++) {
    const px=mesh.positions[i*3],py=mesh.positions[i*3+1],pz=mesh.positions[i*3+2];
    const w=matrix[3]*px+matrix[7]*py+matrix[11]*pz+matrix[15];
    projected[i*4]=camera.x+((matrix[0]*px+matrix[4]*py+matrix[8]*pz+matrix[12])/w+1)*camera.width/2;
    projected[i*4+1]=(1-(matrix[1]*px+matrix[5]*py+matrix[9]*pz+matrix[13])/w)*camera.height/2;
    projected[i*4+2]=(matrix[2]*px+matrix[6]*py+matrix[10]*pz+matrix[14])/w;
    projected[i*4+3]=w;
  }
  let nearest=Infinity, hit=null;
  for(let i=0;i<mesh.indices.length;i+=3) {
    const ia=mesh.indices[i],ib=mesh.indices[i+1],ic=mesh.indices[i+2],a=ia*4,b=ib*4,c=ic*4;
    if(projected[a+3]<=0 || projected[b+3]<=0 || projected[c+3]<=0) continue;
    const ax=projected[a],ay=projected[a+1],bx=projected[b],by=projected[b+1],cx=projected[c],cy=projected[c+1];
    if(x<Math.min(ax,bx,cx)||x>Math.max(ax,bx,cx)||y<Math.min(ay,by,cy)||y>Math.max(ay,by,cy))continue;
    const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-10)continue;
    const wa=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,wb=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d,wc=1-wa-wb;
    if(Math.min(wa,wb,wc)<-1e-8)continue;
    const depth=wa*projected[a+2]+wb*projected[b+2]+wc*projected[c+2];
    if(depth<-1 || depth>1 || depth>=nearest)continue;
    const weights=[wa/projected[a+3],wb/projected[b+3],wc/projected[c+3]],sum=weights.reduce((s,w)=>s+w,0),ids=[ia,ib,ic];
    hit={u:ids.reduce((s,id,j)=>s+(id%mesh.size)*weights[j]/sum,0)/(mesh.size-1),v:ids.reduce((s,id,j)=>s+Math.floor(id/mesh.size)*weights[j]/sum,0)/(mesh.size-1)};
    hit.u=Math.max(0,Math.min(1,hit.u));hit.v=Math.max(0,Math.min(1,hit.v));nearest=depth;
  }
  return hit;
}
