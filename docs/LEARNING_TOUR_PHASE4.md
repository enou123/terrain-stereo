# 名所ミニツアー拡張（第4段階）

既存の「地形と地質をめぐるミニツアー」を、黒部峡谷・阿蘇山・喜界島・南大東島へ広げました。3地点を含む全7地点で利用できます。名所ガイドを開いて「地形と地質をめぐるミニツアーを見る」から開始します。

各場面はクリックで進行します。場面を変えると、既存のおすすめ設定または見どころへの訪問処理を使って実際に3D地形を切り替えます。地質場面では地質図と凡例を開けます。名所の概要へ戻る場面を含め、広域と局所を行き来して形を理解できる構成です。

| 名所 | 場面 | 観察の焦点 |
| --- | --- | --- |
| 黒部峡谷・立山連峰 | 山並み → 仙人谷 → 地質図 → 阿曽原谷との合流 | 主谷・支谷の深さと位置関係。河床・構造物の細部は表示しません。 |
| 阿蘇山 | カルデラ全体 → 中央火口丘 → 地質図 → 中岳火口周辺 → 地質図 | 外輪山・内部低地・中央火口丘を段階的に比較。現在の火山活動情報は示しません。 |
| 喜界島 | 島全体 → 百之台 → 地質図 → 島全体 | サンゴ礁起源の石灰岩と隆起した段丘を、局所と広域で見比べます。岩石の年代と段丘面の年代を区別します。 |
| 南大東島 | 島全体 → 西側の幕 → 地質図 → 中央低地 | 火山カルデラではなく隆起環礁に由来する環状地形として扱います。地下洞窟・海底は表示しません。 |

説明は各地点の名所データ、見どころデータ、そこに付属する公的機関・ジオパーク等の参照資料に沿わせています。地質図で直接読める岩石・地層区分と、形成史について資料が解説する内容を区別する注意も含めています。

## Chromiumでの確認

`npm test` に加えて `python3 tests/learning-tour.browser.py` を実行し、PC 1440×900、スマホ相当縦 390×844、横 844×390 で4地点の全場面を操作します。国土地理院の実DEMを使い、選んだ見どころと中心座標・ズームが一致すること、表示モードが正しく切り替わること、凡例UI、戻る・終了、WebGL、JS例外、横はみ出しを確認します。

地質図画像・凡例はこのブラウザテスト用の明示的な試験データです。地質図UIの接続を確認するもので、産総研APIからの実タイル取得成功とは区別します。以前提供いただいたiPhone Safariの画像では秋吉台の実地質図と地点凡例が表示されていますが、新たに追加した4地点の実機Safari表示は未確認です。テストの画面サイズもiPhone実機ではありません。

| 画面 | 黒部峡谷 | 阿蘇山 | 喜界島 | 南大東島 |
| --- | --- | --- | --- | --- |
| PC 1440×900 | [1](screenshots/learning-tour-stage4/1440x900-kurobe-1.jpg) · [2](screenshots/learning-tour-stage4/1440x900-kurobe-2.jpg) · [3](screenshots/learning-tour-stage4/1440x900-kurobe-3.jpg) · [4](screenshots/learning-tour-stage4/1440x900-kurobe-4.jpg) | [1](screenshots/learning-tour-stage4/1440x900-aso-1.jpg) · [2](screenshots/learning-tour-stage4/1440x900-aso-2.jpg) · [3](screenshots/learning-tour-stage4/1440x900-aso-3.jpg) · [4](screenshots/learning-tour-stage4/1440x900-aso-4.jpg) · [5](screenshots/learning-tour-stage4/1440x900-aso-5.jpg) | [1](screenshots/learning-tour-stage4/1440x900-kikaijima-1.jpg) · [2](screenshots/learning-tour-stage4/1440x900-kikaijima-2.jpg) · [3](screenshots/learning-tour-stage4/1440x900-kikaijima-3.jpg) · [4](screenshots/learning-tour-stage4/1440x900-kikaijima-4.jpg) | [1](screenshots/learning-tour-stage4/1440x900-minamidaito-1.jpg) · [2](screenshots/learning-tour-stage4/1440x900-minamidaito-2.jpg) · [3](screenshots/learning-tour-stage4/1440x900-minamidaito-3.jpg) · [4](screenshots/learning-tour-stage4/1440x900-minamidaito-4.jpg) |
| スマホ縦 390×844 | [1](screenshots/learning-tour-stage4/390x844-kurobe-1.jpg) · [2](screenshots/learning-tour-stage4/390x844-kurobe-2.jpg) · [3](screenshots/learning-tour-stage4/390x844-kurobe-3.jpg) · [4](screenshots/learning-tour-stage4/390x844-kurobe-4.jpg) | [1](screenshots/learning-tour-stage4/390x844-aso-1.jpg) · [2](screenshots/learning-tour-stage4/390x844-aso-2.jpg) · [3](screenshots/learning-tour-stage4/390x844-aso-3.jpg) · [4](screenshots/learning-tour-stage4/390x844-aso-4.jpg) · [5](screenshots/learning-tour-stage4/390x844-aso-5.jpg) | [1](screenshots/learning-tour-stage4/390x844-kikaijima-1.jpg) · [2](screenshots/learning-tour-stage4/390x844-kikaijima-2.jpg) · [3](screenshots/learning-tour-stage4/390x844-kikaijima-3.jpg) · [4](screenshots/learning-tour-stage4/390x844-kikaijima-4.jpg) | [1](screenshots/learning-tour-stage4/390x844-minamidaito-1.jpg) · [2](screenshots/learning-tour-stage4/390x844-minamidaito-2.jpg) · [3](screenshots/learning-tour-stage4/390x844-minamidaito-3.jpg) · [4](screenshots/learning-tour-stage4/390x844-minamidaito-4.jpg) |
| スマホ横 844×390 | [1](screenshots/learning-tour-stage4/844x390-kurobe-1.jpg) · [2](screenshots/learning-tour-stage4/844x390-kurobe-2.jpg) · [3](screenshots/learning-tour-stage4/844x390-kurobe-3.jpg) · [4](screenshots/learning-tour-stage4/844x390-kurobe-4.jpg) | [1](screenshots/learning-tour-stage4/844x390-aso-1.jpg) · [2](screenshots/learning-tour-stage4/844x390-aso-2.jpg) · [3](screenshots/learning-tour-stage4/844x390-aso-3.jpg) · [4](screenshots/learning-tour-stage4/844x390-aso-4.jpg) · [5](screenshots/learning-tour-stage4/844x390-aso-5.jpg) | [1](screenshots/learning-tour-stage4/844x390-kikaijima-1.jpg) · [2](screenshots/learning-tour-stage4/844x390-kikaijima-2.jpg) · [3](screenshots/learning-tour-stage4/844x390-kikaijima-3.jpg) · [4](screenshots/learning-tour-stage4/844x390-kikaijima-4.jpg) | [1](screenshots/learning-tour-stage4/844x390-minamidaito-1.jpg) · [2](screenshots/learning-tour-stage4/844x390-minamidaito-2.jpg) · [3](screenshots/learning-tour-stage4/844x390-minamidaito-3.jpg) · [4](screenshots/learning-tour-stage4/844x390-minamidaito-4.jpg) |
