import { worldPixel } from './elevation.js?v=0.38.0';
// Viewing centers, not surveying points. Extents contain the named feature;
// focus boxes frame that feature inside a newly loaded production DEM footprint.
const spot=(id,name,lat,lon,zoom,height,pitch,interval,coverage,description,limit,reference)=>({
  id,name,center:{latitude:lat,longitude:lon},
  settings:{zoom,exaggeration:height,quality:'high',surface:'shading',contourInterval:interval,contours:false,camera:{yaw:.38,pitch,distance:4}},
  coverage,description,limit,
  references:[reference,{title:'国土地理院・地理院地図（見どころの中心）',url:`https://maps.gsi.go.jp/#16/${lat}/${lon}/`,checked:'2026-10-09'}],
});
const ref=(title,url)=>({title,url,checked:'2026-10-09'});
const aoga=ref('気象庁・青ヶ島の火山地形','https://www.data.jma.go.jp/vois/data/tokyo/322_Aogashima/322_index.html');
const aki=ref('Mine秋吉台ジオパーク・ジオサイトカード','https://mine-geo.com/img/document/sitecard.pdf');
const kuro=ref('環境省・黒部川沿いの峡谷','https://chubu.env.go.jp/blog/chubu/a-tateyama/index_2.html');
const aso=ref('阿蘇ジオパーク・中岳','https://www.aso-geopark.jp/geosites/geosite02.html');
const kikai=ref('喜界町・百之台国立公園展望所','https://www.town.kikai.lg.jp/kankou/shisetsu/kanko/015.html');
const daito=ref('南大東村・島の自然と「幕」','https://www.vill.minamidaito.okinawa.jp/site/iju/533.html');
export const LANDMARK_SPOTS={
  aogashima:[
    spot('ikenosawa','池の沢火口',32.452,139.767,14,1.6,1.16,20,[139.755,32.445,139.778,32.462],
      '外側の火口壁、その内側の低地、丸山を上から見比べます。島全体から一段近づき、火口の囲みを追ってみましょう。',
      '海底・噴気は表示しません。気象庁では外側を大火口ないし小カルデラと説明しています。',aoga),
    spot('maruyama','丸山の火砕丘',32.4525,139.7664,14,1.5,1.22,20,[139.762,32.449,139.771,32.456],
      '火口内の小さな円錐形と山頂のくぼみを眺めます。18世紀の噴火で作られた丸山と、その周りの低い面を比較してください。',
      'DEMの取得範囲は約3km。視点は丸山へ近づけています。細かな火口壁や現在の噴気は再現しません。',aoga),
  ],
  akiyoshidai:[
    spot('chojagamori','長者ヶ森西側のドリーネ群',34.2565,131.311,14,2.5,1.22,10,[131.303,34.251,131.320,34.263],
      '台地の中に並ぶ、比較的大きなすり鉢状のくぼみを高い角度から探します。閉じた10m等高線と、周囲の尾根を見比べてください。',
      '標高データで分かる大きなくぼみを観察します。小さなドリーネ・石灰岩の岩柱・地下洞窟は再現できません。',aki),
  ],
  kurobe:[
    spot('sennindani','仙人谷付近の深い峡谷',36.6475,137.681,13,1.3,1.02,100,[137.665,36.633,137.698,36.662],
      '低い黒部川と、両側の高い斜面を比べます。谷に沿って回転し、深さと狭さを眺めてください。',
      '谷全体の起伏を表示します。遊歩道・橋・ダムの建物や水面は3Dモデルではありません。',kuro),
    spot('asohara','阿曽原谷との合流部',36.660,137.679,14,1.3,1.02,100,[137.671,36.652,137.688,36.668],
      '黒部川へ横から小さな谷が合流する場所です。谷底を中心に、支谷と主谷の高低差を観察します。',
      '岩壁の細かな形や歩道の安全状態を示す表示ではありません。',kuro),
  ],
  aso:[
    spot('central-cones','中央火口丘群',32.889,131.075,12,1.3,1.06,100,[131.024,32.853,131.128,32.923],
      '外輪山に囲まれたカルデラの内側に育った山々へ近づきます。中岳・高岳、草千里付近の地形と、周囲の低地を比較します。',
      'カルデラ全体は「名所全体へ戻る」で観察できます。噴煙・積雪などの現在の状態は表示しません。',aso),
    spot('nakadake','中岳火口周辺',32.884,131.086,14,1.2,1.22,20,[131.079,32.878,131.093,32.893],
      '南北に並ぶ火口のくぼみと、東側の高い山体を上から見ます。火口の縁と底の標高差を等高線でも確かめましょう。',
      '標高データ取得時の地形です。現在の火口・噴火状況や立入規制を表すものではありません。',aso),
  ],
  kikaijima:[
    spot('hyakunoday','百之台と東側の段丘崖',28.320,129.981,14,4,1.10,10,[129.970,28.310,129.995,28.331],
      '百之台の平らな面と東側へ下る斜面に近づきます。10m等高線で、低い海岸側と高い台地の違いを追ってください。',
      '高さ4倍で強調しています。細かなサンゴの形や岩石の露頭は表示しません。',kikai),
  ],
  minamidaito:[
    spot('western-rim','西側の幕と中央低地',25.835,131.222,14,4,1.10,10,[131.211,25.823,131.238,25.846],
      '西海岸側の高まり「幕（はぐ）」から、東側の中央低地への段差を見ます。火山の火口ではなく、隆起した環礁の地形です。',
      '数十mの起伏を高さ4倍で表示。地下の洞窟と海底は表示できません。',daito),
    spot('central-lowland','中央低地と北側の高まり',25.862,131.240,14,4,1.16,10,[131.230,25.850,131.253,25.875],
      '平らな中央部から北側の縁へ視線を移します。低地の湖沼の位置は地理院地図に切り替えて確かめてください。',
      '水面や湖の深さは3D表示しません。細かな等高線も既存DEMを補間したもので、新しい測量結果ではありません。',daito),
  ],
};
export const spotsFor=id=>LANDMARK_SPOTS[id]||[];
export const findSpot=(placeId,spotId)=>spotsFor(placeId).find(s=>s.id===spotId)||null;
export function observationPreset(place,mode='terrain',spotId=null){
  const selected=findSpot(place.id,spotId),base=place.settings[mode];
  return selected?{...base,...selected.settings,surface:mode==='geology'?'geology':selected.settings.surface}:base;
}
export function observationLocation(place,mode='terrain',spotId=null){
  return {...(findSpot(place.id,spotId)?.center||place.center),zoom:observationPreset(place,mode,spotId).zoom};
}
export function matchesObservation(place,location,spotId=null){
  const center=findSpot(place.id,spotId)?.center||place.center;
  return Math.abs(center.latitude-location.latitude)<.0001&&Math.abs(center.longitude-location.longitude)<.0001;
}

export function observationFocus(spot,location){
  if(!spot)return null;
  const [x,y]=worldPixel(location.latitude,location.longitude,location.zoom),[w,s,e,n]=spot.coverage;
  const [left,top]=worldPixel(n,w,location.zoom),[right,bottom]=worldPixel(s,e,location.zoom);
  return [(left-Math.floor(x)+192)/384,(top-Math.floor(y)+192)/384,(right-Math.floor(x)+192)/384,(bottom-Math.floor(y)+192)/384];
}
