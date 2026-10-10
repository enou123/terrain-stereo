// Coordinates: X east, Y elevation, Z south, all in kilometres.
export function createMesh(data, exaggeration) {
  const { heights, size, spacing } = data;
  const positions = new Float32Array(size * size * 3);
  const elevations = new Float32Array(size * size);
  const normals = new Float32Array(positions.length);
  const colors = new Float32Array(positions.length);
  const stops = [[0.20,0.30,0.23],[0.39,0.53,0.35],[0.65,0.68,0.47],[0.88,0.84,0.68]];
  const seaStops=[[.48,.82,.88],[.22,.62,.78],[.12,.37,.62],[.10,.22,.44]];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const i = r * size + c, p = i * 3;
    // Unscaled metres: independent of exaggeration and display fitting.
    elevations[i] = Number.isFinite(heights[i]) ? heights[i] : 0;
    positions.set([(c - (size - 1) / 2) * spacing, Number.isFinite(heights[i]) ? heights[i] / 1000 * exaggeration : 0, (r - (size - 1) / 2) * spacing], p);
    const sea=data.seaMask?.[i]===1;
    const palette=sea ? seaStops : stops;
    const t = Math.min(2.999, Math.max(0, (sea ? -heights[i]/2000 : heights[i]/2100) * 3));
    const a = Math.floor(t), f = t - a;
    for (let k = 0; k < 3; k++) colors[p + k] = Number.isFinite(t) ? palette[a][k] * (1 - f) + palette[a + 1][k] * f : 0;
  }
  const indices = [];
  function triangle(a,b,c) {
    if (![a,b,c].every(i => Number.isFinite(heights[i]))) return;
    indices.push(a,b,c);
    const u = [0,1,2].map(k=>positions[b*3+k]-positions[a*3+k]);
    const v = [0,1,2].map(k=>positions[c*3+k]-positions[a*3+k]);
    const n = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    for (const i of [a,b,c]) for (let k=0;k<3;k++) normals[i*3+k]+=n[k];
  }
  for (let r=0;r<size-1;r++) for(let c=0;c<size-1;c++) {
    const i=r*size+c; triangle(i,i+size,i+1); triangle(i+1,i+size,i+size+1);
  }
  for(let i=0;i<normals.length;i+=3) {
    const length=Math.hypot(normals[i],normals[i+1],normals[i+2]) || 1;
    for(let k=0;k<3;k++) normals[i+k]/=length;
  }
  return { positions, normals, colors, elevations, seabed:data.seaMask, fitHeightRange:data.fitHeightRange?.map(h=>Math.fround(h/1000*exaggeration)), indices: new (size * size > 65536 ? Uint32Array : Uint16Array)(indices) };
}

// Keep height/distance ratios while fitting wide regions and elevated mountain patches.
export function fitMeshPositions(mesh) {
  // Fit the visible terrain uniformly and remove its altitude baseline.
  let minX=Infinity, maxX=-Infinity, minHeight=Infinity, maxHeight=-Infinity;
  for(let i=0;i<mesh.positions.length;i+=3) { minX=Math.min(minX,mesh.positions[i]); maxX=Math.max(maxX,mesh.positions[i]); }
  for(const index of mesh.indices) {
    const height=mesh.positions[index*3+1];
    minHeight=Math.min(minHeight,height); maxHeight=Math.max(maxHeight,height);
  }
  if(!Number.isFinite(minHeight)) minHeight=maxHeight=0;
  if(mesh.fitHeightRange)[minHeight,maxHeight]=mesh.fitHeightRange;
  const scale=12.2/Math.max(.001,maxX-minX,(maxHeight-minHeight)*1.5);
  return mesh.positions.map((value,index)=>(value-(index%3===1 ? minHeight : 0))*scale);
}
