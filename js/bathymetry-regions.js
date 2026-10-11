// Regional registry. Bounds are conservative GridServer request bounds; each
// downloaded manifest carries the returned raster bounds and actual spacing.
// Island-focused narrow grids overlay the retained broader snapshots.
export const BATHYMETRY_REGIONS=Object.freeze([
  // Kikai is a small grid overlay inside the retained Okinawa/Tokara broad grids.
  // Its cell spacing describes returned samples, not sounding accuracy.
  {id:'kikaijima-narrow',west:129.78,east:130.14,south:28.18,north:28.46,spacing:54,depthScaleMax:1000,narrow:true,manifest:'kikaijima-narrow.json'},
  // Narrow-grid overlays for observation-focused island views; broad regional grids remain the fallback.
  {id:'aogashima-narrow',west:139.55905113691165,east:139.96060218340085,south:32.25949793489423,north:32.66042009086242,spacing:51.667029898810284,depthScaleMax:2000,narrow:true,manifest:'aogashima-narrow.json'},
  {id:'aogashima',west:139.2,east:140.3,south:32,north:32.9,spacing:500,depthScaleMax:2000,manifest:'aogashima-gmrt-4.5.0.json'},
  {id:'hachijo-narrow',west:139.65902672336526,east:140.0611270852285,south:32.78935287443984,north:33.190663117207485,spacing:51.360691518099586,depthScaleMax:2000,narrow:true,manifest:'hachijo-narrow.json'},
  {id:'hachijo-aogashima',west:138.6452,east:140.9525,south:31.8943,north:33.6531,spacing:500,depthScaleMax:2000,manifest:'hachijo-aogashima-gmrt-4.5.0.json'},
  {id:'izu-north-north',west:136.5,east:143.7,south:32.1,north:36.4,spacing:810,depthScaleMax:5000,manifest:'izu-north-north.json'},
  {id:'izu-north-south',west:136.5,east:143.7,south:28,north:32.3,spacing:847,depthScaleMax:5000,manifest:'izu-north-south.json'},
  {id:'nishinoshima-narrow',west:140.67965660514412,east:141.08065833626213,south:27.049586376153254,north:27.45100974106751,spacing:54.437840407808956,depthScaleMax:5000,narrow:true,manifest:'nishinoshima-narrow.json'},
  {id:'izu-south',west:137,east:151,south:22,north:35.5,spacing:2500,depthScaleMax:10000,manifest:'izu-south.json'},
  {id:'nankai-west',west:128,east:140,south:28.5,north:37,spacing:2000,depthScaleMax:8000,manifest:'nankai-west.json'},
  {id:'suwanose-narrow',west:129.51864586399026,east:129.9207462258535,south:29.4393585631136,north:29.840406418161866,spacing:53.22129853256671,depthScaleMax:3000,narrow:true,manifest:'suwanose-narrow.json'},
  {id:'kuchinoerabu-narrow',west:129.99929771842537,east:130.40029944954338,south:30.259304646734968,north:30.660360333667064,spacing:52.78268820140505,depthScaleMax:3000,narrow:true,manifest:'kuchinoerabu-narrow.json'},
  {id:'tokara-amami',west:126,east:132.5,south:26,north:33.5,spacing:1250,depthScaleMax:5000,manifest:'tokara-amami.json'},
  {id:'okinawa-islands',west:125,east:132,south:24.5,north:28.5,spacing:1000,depthScaleMax:5000,manifest:'okinawa-islands.json'},
  {id:'yonaguni-narrow',west:122.79940758170662,east:123.20040931282462,south:24.259235064687932,north:24.661246272223764,spacing:55.73808475162055,depthScaleMax:5000,narrow:true,manifest:'yonaguni-narrow.json'},
  {id:'yaeyama',west:121,east:127,south:22,north:26,spacing:1250,depthScaleMax:5000,manifest:'yaeyama.json'},
  {id:'ryukyu-trench-trough',west:121,east:135,south:20.5,north:31,spacing:2500,depthScaleMax:10000,manifest:'ryukyu-trench-trough.json'},
  {id:'daito',west:129,east:134,south:24,north:28,spacing:1000,depthScaleMax:5000,manifest:'daito.json'},
  {id:'suruga-sagami',west:136.5,east:141.8,south:32.5,north:37,spacing:805,depthScaleMax:5000,manifest:'suruga-sagami.json'},
  {id:'japan-trench',west:140,east:149,south:34,north:43,spacing:2500,depthScaleMax:10000,manifest:'japan-trench.json'},
  {id:'kuril-trench',west:144,east:158,south:41,north:49,spacing:3500,depthScaleMax:10000,manifest:'kuril-trench.json'},
]);
