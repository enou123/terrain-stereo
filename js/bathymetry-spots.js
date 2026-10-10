// Thirty sea-floor observation presets. These describe visible relief only;
// geological interpretations must come from the cited sources, not color alone.
const gmrt={title:'GMRT GridServer・データと利用条件',url:'https://www.gmrt.org/services/gridserverinfo.php',checked:'2026-10-10'};
const map=(lat,lon,z)=>({title:'国土地理院・地理院地図（表示中心）',url:`https://maps.gsi.go.jp/#${z}/${lat}/${lon}/`,checked:'2026-10-10'});
function footprint(lat,lon,zoom){
  const scale=256*2**zoom,x=(lon+180)/360*scale,radians=lat*Math.PI/180;
  const y=(1-Math.asinh(Math.tan(radians))/Math.PI)/2*scale;
  const coord=(px,py)=>({lon:px/scale*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*py/scale)))*180/Math.PI});
  // Leave one DEM pixel of margin: the raster footprint uses the rounded
  // integer centre, while this editorial coverage box is shown as decimals.
  const nw=coord(Math.floor(x)-191,Math.floor(y)-191),se=coord(Math.floor(x)+191,Math.floor(y)+191);
  return [nw.lon,se.lat,se.lon,nw.lat];
}
function place(id,name,region,categories,lat,lon,zoom,exaggeration,depthScaleMax,datasetIds,summary,points,reference=gmrt){
  const center={latitude:lat,longitude:lon};
  const terrain={zoom,exaggeration,surface:'elevation',quality:'standard',contours:false,contourInterval:100,sunAzimuth:145,sunAltitude:50,camera:{yaw:.38,pitch:.78,distance:9}};
  const geology={...terrain,surface:'elevation'};
  const detail=`${summary} 陸地は国土地理院の標高、海域はGMRTの水深を同じ3D画面で見比べます。画面から直接分かるのは表面の標高差です。地層、年代、地下のつながりはこの表示だけでは判断しません。`;
  return {id,name,prefecture:'日本周辺',region,categories,center,summary,
    settings:{terrain,geology},
    terrain:{summary,detail,points},
    geology:{summary:'地形と海底の形を学ぶ',detail:`${detail}地質の成り立ちを読むときは、地域の公的な火山・地質資料も合わせて確認してください。`,rocks:'標高・水深データから岩石名は特定できません。',age:'地形図だけでは地質年代を示せません。',points},
    limitations:['海底の格子間隔は元資料の実間隔です。格子間隔は測深精度を意味しません。','深い部分の陰影や水深色から、地下構造・火山の連続性を推定しないでください。'],
    references:[gmrt,map(lat,lon,zoom)],
    coordinateNote:'観察範囲の中心座標。島の山頂や海底構造の代表点とは限りません。',coverage:footprint(lat,lon,zoom),
    bathymetry:{depthScaleMax,datasetIds,category:categories[0]}};
}

export const BATHYMETRY_SPOTS=Object.freeze([
  place('sea-izu-oshima','伊豆大島と周辺海底','伊豆・小笠原諸島',['coastalSeabed','marineVolcano'],34.75,139.40,11,1.7,3000,['suruga-sagami'],'島の外輪山と海岸から沖へ落ちる斜面を見比べます。',['海岸から水深色が変わる方向','島の北西・南東で異なる斜面']),
  place('sea-miyakejima','三宅島と周辺海底','伊豆・小笠原諸島',['coastalSeabed','marineVolcano'],34.08,139.52,11,1.7,3000,['suruga-sagami'],'火山島の斜面が海中へ続く範囲と、周辺の海底の高低差を観察します。',['島の周囲で水深が深くなる向き','周辺の小さな海底の高まり']),
  place('sea-mikurajima','御蔵島と周辺海底','伊豆・小笠原諸島',['coastalSeabed','marineVolcano'],33.87,139.61,11,1.7,3000,['suruga-sagami'],'小さな島の急な陸上地形と周囲の海底斜面を一緒に眺めます。',['島の縁から沖への傾斜','方角による海底の深まり']),
  place('sea-torishima','鳥島と伊豆・小笠原の海底','伊豆・小笠原諸島',['coastalSeabed','marineVolcano'],30.48,140.30,11,1.7,5000,['izu-north-south'],'島と海底の起伏を見比べ、広い海域に点在する高まりを探します。',['鳥島周囲の浅い部分','沖へ向かう水深変化']),
  place('sea-nishinoshima','西之島と周辺海底','伊豆・小笠原諸島',['coastalSeabed','marineVolcano'],27.25,140.88,11,1.7,5000,['izu-south'],'陸上の小さな火山島と、その周囲の海底地形を同じ縮尺で観察します。',['島の周囲の海底斜面','広域の水深色と局地的な高まり']),
  place('sea-chichijima','父島と小笠原の海底','伊豆・小笠原諸島',['coastalSeabed','marineVolcano'],27.09,142.20,10,1.6,5000,['izu-south'],'島の稜線と海岸から沖へ向かう海底地形を比べます。',['父島周辺の浅海域','島の東西の水深差']),
  place('sea-hahajima','母島と小笠原の海底','伊豆・小笠原諸島',['coastalSeabed','marineVolcano'],26.65,142.16,10,1.6,5000,['izu-south'],'母島周囲の陸地と水深のつながりをたどります。',['海岸線から海底斜面へ移る部分','近くの海底の高まり']),
  place('sea-izu-bonin-wide','伊豆・小笠原諸島の広域海底','伊豆・小笠原諸島',['regionalSeabed','underseaRelief'],31.0,141.3,6,1.2,10000,['izu-north-north','izu-north-south','izu-south'],'伊豆諸島から小笠原方面までの島列と海底の広域的な起伏を眺めます。',['島列に沿う海底の高まり','島列の東側に続く深い海域']),
  place('sea-izu-bonin-trench','伊豆・小笠原海溝周辺','伊豆・小笠原諸島',['trench','regionalSeabed'],29.6,145.1,6,1.1,10000,['izu-south'],'海溝付近の長く連なる水深変化を広域で観察します。',['海底が深くなる帯状の部分','海溝沿い・横断方向の水深差']),

  place('sea-kikai-caldera','鬼界カルデラ・薩摩硫黄島沖','トカラ・奄美',['marineVolcano','underseaRelief'],30.78,130.28,9,1.8,5000,['tokara-amami'],'薩摩硫黄島周辺の島と海底の起伏を見ます。表示だけでカルデラ縁の位置や地下の連続性を断定しません。',['硫黄島近くの浅い海底','沖合へ向かう斜面']),
  place('sea-kuchinoerabu','口永良部島と周辺海底','トカラ・奄美',['coastalSeabed','marineVolcano'],30.46,130.20,10,1.8,3000,['tokara-amami'],'島の火山地形と海底斜面を比べます。噴火履歴や火口の解釈は気象庁資料と合わせて確認してください。',['島の高い部分から海岸への斜面','島の周囲で水深が深まる方向']),
  place('sea-suwanose','諏訪之瀬島と周辺海底','トカラ・奄美',['coastalSeabed','marineVolcano'],29.64,129.72,10,1.8,3000,['tokara-amami'],'火山島の陸上斜面と海中へ沈む斜面を続けて観察します。',['島の周囲の等深線状の起伏','沖合への深まり']),
  place('sea-nakanoshima','中之島とトカラ列島の海底','トカラ・奄美',['coastalSeabed','marineVolcano'],29.86,129.86,10,1.8,3000,['tokara-amami'],'島々の間の海底がどのように上下するかを観察します。',['島の間の鞍部状の地形','島の周囲の深まり']),
  place('sea-tokara-wide','トカラ列島の広域海底','トカラ・奄美',['regionalSeabed','underseaRelief'],29.6,129.7,8,1.3,5000,['tokara-amami'],'島列と島の間の海底地形を複数の島にまたがって見比べます。',['列島に沿う高まり','島間で水深が変わる場所']),
  place('sea-amami-wide','奄美・喜界島・沖永良部島周辺','トカラ・奄美',['regionalSeabed','coastalSeabed'],28.3,129.6,7,1.2,5000,['tokara-amami'],'奄美諸島の島々と周辺の海底起伏を広域で観察します。',['島列と沖合の水深差','浅い海域から深い海域へ変わる帯']),

  place('sea-okinawa','沖縄本島と周辺海底','沖縄・先島諸島',['coastalSeabed','marineVolcano'],26.22,127.75,10,1.7,3000,['okinawa-islands'],'沖縄本島の陸地と、東西の海底斜面・浅海域を見比べます。',['島の周辺に広がる比較的浅い海底','沖合への急な水深変化']),
  place('sea-kerama','慶良間諸島と周辺海底','沖縄・先島諸島',['coastalSeabed','underseaRelief'],26.20,127.30,10,1.7,3000,['okinawa-islands'],'小さな島々の間の海底起伏を観察します。',['島々の間の水深','浅い海底から外洋へ移る斜面']),
  place('sea-kumejima','久米島と周辺海底','沖縄・先島諸島',['coastalSeabed','underseaRelief'],26.34,126.80,10,1.7,3000,['okinawa-islands'],'島の周囲の浅海域と沖合の海底を見比べます。',['島の北西・南東の水深差','沖合へ続く斜面']),
  place('sea-miyako-irabu','宮古島・伊良部島周辺海底','沖縄・先島諸島',['coastalSeabed','underseaRelief'],24.80,125.30,9,1.6,3000,['yaeyama','okinawa-islands'],'複数の島と浅い海域、その外縁の水深変化をまとめて見ます。',['島の間の浅い地形','外洋側の深まり']),
  place('sea-ishigaki','石垣島と周辺海底','沖縄・先島諸島',['coastalSeabed','marineVolcano'],24.44,124.18,10,1.7,3000,['yaeyama'],'島の山地と海岸から沖へ続く海底斜面を観察します。',['島周辺の浅海域','沖合の水深が深くなる方向']),
  place('sea-iriomote','西表島と周辺海底','沖縄・先島諸島',['coastalSeabed','underseaRelief'],24.32,123.82,10,1.7,3000,['yaeyama'],'島の山地と周囲の海底の起伏をつなげて見ます。',['沿岸の浅い部分','島の外側で変わる水深']),
  place('sea-yonaguni','与那国島と周辺海底','沖縄・先島諸島',['coastalSeabed','underseaRelief'],24.46,123.00,10,1.7,5000,['yaeyama'],'島の西端周辺と外洋の海底の高低差を観察します。',['島の周辺の浅い海域','外洋側の深い海底']),
  place('sea-daito','南大東島・北大東島と周辺海底','沖縄・先島諸島',['regionalSeabed','coastalSeabed'],25.80,131.20,8,1.4,5000,['daito'],'離れて位置する二つの島と、周囲の海底地形を広域で比べます。',['両島の位置関係','島の周囲で急に深くなる海底']),
  place('sea-okinawa-trough','沖縄トラフ周辺','沖縄・先島諸島',['trench','regionalSeabed'],27.0,126.8,6,1.1,10000,['ryukyu-trench-trough'],'沖縄諸島の西側に広がる海底の谷状地形を観察します。表示は水深面であり、成因を直接示すものではありません。',['周囲より深い帯状の海底','島列との位置関係']),
  place('sea-ryukyu-trench','琉球海溝周辺','沖縄・先島諸島',['trench','regionalSeabed'],24.7,130.8,6,1.1,10000,['ryukyu-trench-trough'],'島列の東側に沿う深い海域と、その西側の海底高低差を広域で見ます。',['深い帯の連なり','海溝に直交する断面の水深変化']),

  place('sea-suruga-sagami','駿河湾・相模トラフ','海溝・トラフ',['trench','regionalSeabed'],35.0,139.3,7,1.2,5000,['suruga-sagami'],'湾と海底の谷状地形を見比べ、陸地から沖へ続く急な標高変化を観察します。',['駿河湾の深い部分','相模湾沖の海底斜面']),
  place('sea-nankai','四国沖〜紀伊半島沖・南海トラフ','海溝・トラフ',['trench','regionalSeabed'],32.8,134.8,6,1.1,10000,['nankai-west'],'四国沖から紀伊半島沖へ広がる水深変化を広域で観察します。',['海底の深い帯と周辺の高まり','陸側から沖へ横切る水深変化']),
  place('sea-japan-trench','日本海溝周辺','海溝・トラフ',['trench','regionalSeabed'],38.0,144.5,6,1.1,10000,['japan-trench'],'東北沖の広い海底斜面と、深い海域の連なりを眺めます。',['陸側斜面から深い海域への変化','南北方向に続く水深の帯']),
  place('sea-kuril-trench','千島海溝周辺','海溝・トラフ',['trench','regionalSeabed'],45.1,151.5,6,1.1,10000,['kuril-trench'],'北海道東方から北へ続く大規模な海底地形を観察します。',['長く続く深い海域','陸側と外洋側の水深差']),
  place('sea-izu-ridge','伊豆・小笠原の海底高まり','伊豆・小笠原諸島',['underseaRelief','regionalSeabed'],31.0,143.2,6,1.1,10000,['izu-north-north','izu-north-south','izu-south'],'海底の高まりとその両側の深い海域を見比べます。地形表現だけから高まりの成因は特定しません。',['尾根状に見える海底の連なり','両側の水深差']),
]);
