// Small, reviewed supplement for natural places that are absent from the
// landmark catalog and the available national gazetteers. Coordinates are
// representative map points, not claimed geographic centroids.
const gsiGazetteer = 'https://svd1-web1.gsi.go.jp/kihonjohochousa/gazetteer.html';
const osm = id => `https://www.openstreetmap.org/node/${id}`;

export const NATURAL_PLACES = Object.freeze([
  {
    name:'四国カルスト', aliases:['しこくカルスト','四国カルスト台地'], prefecture:'愛媛県・高知県',
    municipality:'久万高原町・津野町など', type:'カルスト台地',
    point:{latitude:33.4668056,longitude:132.9613056}, mapZoom:11,
    detail:'広域地名。姫鶴平付近を代表点として、台地全体が入る縮尺で表示します。',
    source:'Wikidata Q11419667（座標データ CC0）', sourceUrl:'https://www.wikidata.org/wiki/Q11419667',
  },
  {
    name:'姫鶴平', aliases:['めづるだいら','メヅルダイラ','四国カルスト姫鶴平'], prefecture:'愛媛県',
    municipality:'久万高原町', type:'高原・カルスト',
    point:{latitude:33.4675,longitude:132.9625}, mapZoom:13,
    detail:'四国カルスト東部の観察地点。四国カルスト全体の中心ではありません。',
    source:'OpenStreetMap node 11234897307（ODbL）', sourceUrl:osm(11234897307),
  },
  {
    name:'仁淀川', aliases:['によどがわ'], prefecture:'高知県', municipality:'河口付近', type:'河川',
    point:{latitude:33.45,longitude:133.483333}, mapZoom:10,
    detail:'川全体の中央ではなく、地名集日本の河口側の代表座標です。上流の名所は個別名で検索してください。',
    source:'地名集日本（河川は河口・最下流部の位置）', sourceUrl:gsiGazetteer,
  },
  {
    name:'祖谷渓', aliases:['いやけい','祖谷渓谷'], prefecture:'徳島県', municipality:'三好市', type:'渓谷',
    point:{latitude:33.906,longitude:133.813}, mapZoom:12,
    detail:'渓谷の代表地点へ移動します。渓谷全長の範囲を表す境界ではありません。',
    source:'Wikidata Q3408660（座標データ CC0）', sourceUrl:'https://www.wikidata.org/wiki/Q3408660',
  },
  {
    name:'桜島', aliases:['さくらじま'], prefecture:'鹿児島県', municipality:'鹿児島市', type:'火山島',
    point:{latitude:31.577222,longitude:130.658889}, mapZoom:12,
    detail:'南岳の火山基準点付近を表示中心にします。島全体の幾何学的中心ではありません。',
    source:'気象庁・桜島（南岳の位置）', sourceUrl:'https://www.data.jma.go.jp/vois/data/fukuoka/506_Sakurajima/506_index.html',
  },
  {
    name:'阿蘇カルデラ', aliases:['あそカルデラ'], prefecture:'熊本県', municipality:'阿蘇市・阿蘇郡', type:'カルデラ',
    point:{latitude:32.93,longitude:131.08}, mapZoom:9,
    detail:'阿蘇山の名所ガイド中心を代表点として、外輪山を含む広域を表示します。代表点はカルデラの幾何学的中心ではありません。',
    source:'名所ガイド・阿蘇山（広域表示）', sourceUrl:'https://www.data.jma.go.jp/vois/data/fukuoka/503_Asosan/503_index.html',
  },
  {
    name:'鳥取砂丘', aliases:['とっとりさきゅう'], prefecture:'鳥取県', municipality:'鳥取市', type:'砂丘・海岸',
    point:{latitude:35.549722,longitude:134.244722}, mapZoom:12,
    detail:'鳥取県の砂丘案内施設の代表座標です。砂丘の範囲中心ではありません。',
    source:'鳥取県・鳥取砂丘オアシス広場の座標', sourceUrl:'https://www.pref.tottori.lg.jp/secure/1385211/01toubu_ver1.1-2.pdf',
  },
  {
    name:'富士五湖', aliases:['ふじごこ'], prefecture:'山梨県', municipality:'富士河口湖町周辺', type:'湖沼群',
    point:{latitude:35.51767,longitude:138.76219}, mapZoom:9,
    detail:'河口湖湖心を代表点に、五湖を含む広域表示へ移動します。五湖群の重心ではありません。',
    source:'山梨県・河口湖湖心の位置', sourceUrl:'https://www.pref.yamanashi.jp/documents/23300/sokuteichitenichiran.pdf',
  },
]);
