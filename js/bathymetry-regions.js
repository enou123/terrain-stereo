// Regional registry. Bounds are conservative GridServer request bounds; each
// downloaded manifest carries the returned raster bounds and actual spacing.
// Narrow observations keep their existing higher-resolution snapshots.
export const BATHYMETRY_REGIONS=Object.freeze([
  {id:'aogashima',west:139.2,east:140.3,south:32,north:32.9,spacing:500,depthScaleMax:2000,manifest:'aogashima-gmrt-4.5.0.json'},
  {id:'hachijo-aogashima',west:138.6452,east:140.9525,south:31.8943,north:33.6531,spacing:500,depthScaleMax:2000,manifest:'hachijo-aogashima-gmrt-4.5.0.json'},
  {id:'izu-north-north',west:136.5,east:143.7,south:32.1,north:36.4,spacing:810,depthScaleMax:5000,manifest:'izu-north-north.json'},
  {id:'izu-north-south',west:136.5,east:143.7,south:28,north:32.3,spacing:847,depthScaleMax:5000,manifest:'izu-north-south.json'},
  {id:'izu-south',west:137,east:151,south:22,north:35.5,spacing:2500,depthScaleMax:10000,manifest:'izu-south.json'},
  {id:'nankai-west',west:128,east:140,south:28.5,north:37,spacing:2000,depthScaleMax:8000,manifest:'nankai-west.json'},
  {id:'tokara-amami',west:126,east:132.5,south:26,north:33.5,spacing:1250,depthScaleMax:5000,manifest:'tokara-amami.json'},
  {id:'okinawa-islands',west:125,east:132,south:24.5,north:28.5,spacing:1000,depthScaleMax:5000,manifest:'okinawa-islands.json'},
  {id:'yaeyama',west:121,east:127,south:22,north:26,spacing:1250,depthScaleMax:5000,manifest:'yaeyama.json'},
  {id:'ryukyu-trench-trough',west:121,east:135,south:20.5,north:31,spacing:2500,depthScaleMax:10000,manifest:'ryukyu-trench-trough.json'},
  {id:'daito',west:129,east:134,south:24,north:28,spacing:1000,depthScaleMax:5000,manifest:'daito.json'},
  {id:'suruga-sagami',west:136.5,east:141.8,south:32.5,north:37,spacing:805,depthScaleMax:5000,manifest:'suruga-sagami.json'},
  {id:'japan-trench',west:140,east:149,south:34,north:43,spacing:2500,depthScaleMax:10000,manifest:'japan-trench.json'},
  {id:'kuril-trench',west:144,east:158,south:41,north:49,spacing:3500,depthScaleMax:10000,manifest:'kuril-trench.json'},
]);
