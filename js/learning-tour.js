// Short, sourced observation sequences for the first learning-tour release.
// Each step uses the same landmark and surface controls as normal exploration.
export const LEARNING_TOURS = Object.freeze({
  akiyoshidai: [
    { title:'台地の形をつかむ', mode:'terrain', spot:null,
      copy:'まず秋吉台全体を斜めから眺めます。平らに見える台地の縁と、周囲へ下る斜面を探してください。',
      prompt:'台地の外縁は、どこから急な斜面に変わりますか？' },
    { title:'石灰岩の分布を重ねる', mode:'geology', spot:null,
      copy:'地質図を重ねます。地質図の色は岩石・地層の区分です。凡例を開き、石灰岩の分布を地形と見比べてください。',
      prompt:'台地の位置と石灰岩のまとまった分布は、どう重なって見えますか？' },
    { title:'ドリーネ群へ近づく', mode:'terrain', spot:'chojagamori',
      copy:'長者ヶ森西側の見どころへ移動します。標高データで分かる大きなくぼみを探し、閉じた等高線と周囲の尾根を比べます。',
      prompt:'すり鉢状のくぼみは、台地の斜面とどのように違いますか？ 地質図に戻すと、地表の地質区分も確認できます。' },
  ],
  aogashima: [
    { title:'島を囲む火山地形', mode:'terrain', spot:null,
      copy:'島全体を眺め、外側の火口壁と内側の低地を探します。海底に続く火山体はこの3D表示には含まれません。',
      prompt:'島の外周の高まりは、内側の地形をどのように囲んでいますか？' },
    { title:'池の沢火口を観察', mode:'terrain', spot:'ikenosawa',
      copy:'池の沢火口へ近づきます。火口壁の内側に広がる低地と、中央の丸山を探してください。',
      prompt:'大きな囲みの中に、もう一つどんな地形が見えますか？' },
    { title:'地表の地質を比べる', mode:'geology', spot:'ikenosawa',
      copy:'同じ範囲に地質図を重ねます。色は地表の地質区分です。凡例を開き、火口内外の区分を確認してください。',
      prompt:'地形の境目と地質図の色の境目は、すべて一致していますか？ 色だけで噴火の順番を決めず、凡例と資料を合わせて読みます。' },
  ],
  itoigawa: [
    { title:'姫川の谷と山地', mode:'terrain', spot:null,
      copy:'海岸から南へ伸びる姫川の谷と、両側の山地を眺めます。谷の形は河川侵食を考える手掛かりです。',
      prompt:'谷の両側で、斜面の高さや起伏はどのように違いますか？' },
    { title:'地質の違いを重ねる', mode:'geology', spot:null,
      copy:'地質図を重ねて、姫川を挟む地質区分を比べます。色境界は概略で、地質図上の色境界すべてが糸魚川－静岡構造線ではありません。',
      prompt:'凡例で地質区分を確かめ、谷の形と地質の分布を別々に観察しましょう。地下構造や正確な断層線はこの表示からは分かりません。' },
  ],
});

export const learningTourFor = id => LEARNING_TOURS[id] || null;
