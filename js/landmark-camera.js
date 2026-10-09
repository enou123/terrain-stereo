// Fit the actual visible mesh, excluding missing sea vertices. The renderer
// adds its own narrow-screen distance factor; account for it exactly here.
export function landmarkCamera(mesh, recommendation, aspect, focus=null) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  let highest=-Infinity;
  for(const index of mesh.indices){
    highest=Math.max(highest,mesh.positions[index*3+1]);
    const u=(index%mesh.size)/(mesh.size-1),v=Math.floor(index/mesh.size)/(mesh.size-1);
    if(focus&&(u<focus[0]||v<focus[1]||u>focus[2]||v>focus[3]))continue;
    for(let k=0;k<3;k++){
      const value=mesh.positions[index*3+k];min[k]=Math.min(min[k],value);max[k]=Math.max(max[k],value);
    }
  }
  if(!min.every(Number.isFinite))throw new Error('観察できる地形がありません。');
  const target=min.map((v,k)=>(v+max[k])/2),{yaw,pitch}=recommendation;
  const sin=Math.sin(yaw),cos=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),tan=Math.tan(Math.PI/8);
  const fit=Math.max(1,1.15/aspect);
  // A preferred effective distance must not be multiplied twice on a phone;
  // the geometric fit below already accounts for its narrow projection.
  let distance=recommendation.distance;
  // A box bounds every visible vertex. Leave room for the viewer's labels.
  for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]]){
    const dx=x-target[0],dy=y-target[1],dz=z-target[2],horizontal=sin*dx+cos*dz;
    const vx=cos*dx-sin*dz,vy=cp*dy-sp*horizontal,depth=sp*dy+cp*horizontal;
    distance=Math.max(distance,depth+Math.abs(vx)/(tan*aspect*.78),depth+Math.abs(vy)/(tan*.76));
  }
  distance=Math.max(distance,(highest+.5-target[1])/sp);
  return {yaw,pitch,target,distance:Math.max(4,Math.min(45,distance/fit))};
}

// Fit the loaded square with its geographic center on screen, including island sea margins.
export function northTopCamera(mesh, aspect) {
  let halfX=0,halfZ=0,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<mesh.positions.length;i+=3){
    halfX=Math.max(halfX,Math.abs(mesh.positions[i]));halfZ=Math.max(halfZ,Math.abs(mesh.positions[i+2]));
  }
  for(const i of mesh.indices){minY=Math.min(minY,mesh.positions[i*3+1]);maxY=Math.max(maxY,mesh.positions[i*3+1]);}
  if(!Number.isFinite(minY)||!(aspect>0))throw new Error('観察できる地形がありません。');
  const targetY=(minY+maxY)/2,fit=Math.max(1,1.15/aspect),tan=Math.tan(Math.PI/8);
  const distance=(maxY-targetY+Math.max(halfX/(tan*aspect*.88),halfZ/(tan*.88)))/fit;
  return {yaw:0,pitch:Math.PI/2,distance:Math.max(4,Math.min(45,distance)),target:[0,targetY,0]};
}
