# 地形と地質を結ぶミニツアー（第3段階）

名所ガイドで秋吉台・青ヶ島・糸魚川周辺を表示すると、「地形と地質をめぐるミニツアーを見る」が使えます。短い場面ごとに地形を眺め、地質図を重ね、地形と地質の分布を比べます。説明に問いかけを添え、利用者が実際の画面から特徴を探せる構成です。「次へ」「戻る」「ツアーを終了」で進めます。自動進行はしません。

場面切替は既存の名所訪問・観察モード切替を呼び出します。見どころに移るとその範囲のDEMを読み込み、地質図への切替は通常の地質図表示と凡例を使います。各ミニツアー開始時にその名所のおすすめ表示を読み直します。途中で終了しても、その時点の3D表示は維持します。通常の名所ガイド、手動設定、機能紹介ツアー、共有リンクとは独立しています。

内容は名所ガイドに登録済みの解説と資料に沿っています。秋吉台は石灰岩の分布と台地・ドリーネ、青ヶ島は池の沢火口と内側の丸山・地質区分、糸魚川は姫川の谷と地質分布を扱います。糸魚川では地質図の色境界を糸魚川－静岡構造線の正確な線と同一視できないことを明示します。海底や地下構造、DEMで分からない細部は表示できないと伝えます。

## ブラウザ検証

`python3 tests/learning-tour.browser.py` は Chromium / SwiftShader でPC（1440×900）、iPhone相当の縦（390×844）・横（844×390）を確認します。国土地理院の実DEMを読み、場面ごとの位置・観察モード、見どころ移動、戻る・終了、地質凡例UI、JavaScript例外、WebGLエラー、横はみ出しを検証します。

産総研地質図について、このブラウザテストの凡例と地質面には試験用画像・試験用凡例を明示して使っています。これは画面連携の確認で、実APIの取得成功を意味しません。前段階に利用者が提供したiPhone Safariのスクリーンショットでは、秋吉台の地質図と地点凡例が実機で表示されていることを別途確認済みです。糸魚川・青ヶ島での実機API表示はこの確認に含みません。

| 画面 | 秋吉台 | 青ヶ島 | 糸魚川 |
| --- | --- | --- | --- |
| PC 1440×900 | [地形](screenshots/learning-tour/1440x900-akiyoshidai-1.jpg) · [地質](screenshots/learning-tour/1440x900-akiyoshidai-2.jpg) · [見どころ](screenshots/learning-tour/1440x900-akiyoshidai-3.jpg) | [地形](screenshots/learning-tour/1440x900-aogashima-1.jpg) · [火口](screenshots/learning-tour/1440x900-aogashima-2.jpg) · [地質](screenshots/learning-tour/1440x900-aogashima-3.jpg) | [地形](screenshots/learning-tour/1440x900-itoigawa-1.jpg) · [地質](screenshots/learning-tour/1440x900-itoigawa-2.jpg) |
| iPhone相当 縦 390×844 | [地形](screenshots/learning-tour/390x844-akiyoshidai-1.jpg) · [地質](screenshots/learning-tour/390x844-akiyoshidai-2.jpg) · [見どころ](screenshots/learning-tour/390x844-akiyoshidai-3.jpg) | [地形](screenshots/learning-tour/390x844-aogashima-1.jpg) · [火口](screenshots/learning-tour/390x844-aogashima-2.jpg) · [地質](screenshots/learning-tour/390x844-aogashima-3.jpg) | [地形](screenshots/learning-tour/390x844-itoigawa-1.jpg) · [地質](screenshots/learning-tour/390x844-itoigawa-2.jpg) |
| iPhone相当 横 844×390 | [地形](screenshots/learning-tour/844x390-akiyoshidai-1.jpg) · [地質](screenshots/learning-tour/844x390-akiyoshidai-2.jpg) · [見どころ](screenshots/learning-tour/844x390-akiyoshidai-3.jpg) | [地形](screenshots/learning-tour/844x390-aogashima-1.jpg) · [火口](screenshots/learning-tour/844x390-aogashima-2.jpg) · [地質](screenshots/learning-tour/844x390-aogashima-3.jpg) | [地形](screenshots/learning-tour/844x390-itoigawa-1.jpg) · [地質](screenshots/learning-tour/844x390-itoigawa-2.jpg) |

実機iPhone Safariのタップ・スクロール検証は未実施です。
