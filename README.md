# ゲームパッケージ

透明なプラスチックのゲームケースを WebGL で描いています。光は殻を通り抜け、紙のジャケットは薄いフィルムの下にあり、カートリッジはツメから浮いて手前に出てきます。裏返せます。

[three.js](https://threejs.org) と Vite。形はすべてコードで組んでいて、読み込む 3D モデルはありません。

開き方と光の扱い方は、Ann Nguyen の [CD Case](https://www.bubbbly.com/cd-case)（[ソース](https://github.com/annnguyentt/vibe-coding/tree/main/cd-case)）を参考にしています。

## 開いたときの見た目

起動すると、閉じたケースが画面の中央に出ます。表紙は薄いフィルムの下にあり、下のドックから別の作品や樹脂の色へ切り替えられます。

![閉じたゲームケース。表紙は LUMIWARD で、下に操作ドックがある](docs/closed.jpg)

## 操作

| 操作 | 起こること |
| --- | --- |
| ドラッグ、またはスワイプ | ケースを回す |
| ケースをタップ、または **O** | 開く、または閉じる |
| カートリッジをタップ、または **C** | 取り出す、または戻す |
| **F** | 検査中のカートリッジを裏返す |
| **R** | 向きを戻す |
| **E** | タイトルと画像を編集する |
| **Escape** | カートリッジを戻す、または編集を閉じる |

ケースをタップするか **O** を押すと、カバーが開いて中の見開きとカートリッジが見えます。

![開いたケース。透明なカバーの内側に絵があり、右にカートリッジが収まっている](docs/open.jpg)

開いた状態でカートリッジをタップするか **C** を押すと、手前に浮き上がります。

![取り出したカートリッジの表面。ラベルに LUMIWARD と書かれている](docs/cartridge.jpg)

検査中に **F** を押すと裏返し、金の端子が見えます。ドラッグで向きを変えられます。

![カートリッジの裏面。下端に金の端子が並んでいる](docs/cartridge-back.jpg)

手持ちの画像は **E** から入れます。ブラウザの中だけでテクスチャになり、外には出ません。

## 動かし方

```bash
npm install && npm run dev
```

Vite が示した URL を開きます。通常は http://localhost:5173 です。

```bash
npm test
npm run build
```

## 仕組み

**プラスチック。** [`src/model/GameCase.ts`](src/model/GameCase.ts) と [`src/model/shapes.ts`](src/model/shapes.ts) が、ミリメートル単位でケースを組んでいます（1 ユニット = 10 mm。およそ 170 × 105 × 11 mm）。各シェルの縁はヒンジ側が開いた C 字で、閉じると背表紙のシールがその隙間に入ります。開く角度は二つの軸で半分ずつ分かれ、カバー同士はぶつかりません。

**光。** [`src/scene/lighting.ts`](src/scene/lighting.ts) が、ソフトボックスを置いた小さな部屋を一度キューブマップに焼きます。[`src/model/materials.ts`](src/model/materials.ts) は透過と屈折、クリアコートに `MeshPhysicalMaterial` を使い、厚い成形縁で光が走るフレネルを短い GLSL で足しています。

**動き。** [`src/interaction/InteractionManager.ts`](src/interaction/InteractionManager.ts) が、経過時間で慣性を付けてケースを回し、開閉は GSAP です。カートリッジは固定ツメを押し広げてから手前へ出ます。[`src/scene/framing.ts`](src/scene/framing.ts) は、回転しても、編集パネルが開いても、角が画面から切れない距離にカメラを置きます。

**印刷。** [`src/art/canvasArt.ts`](src/art/canvasArt.ts) が、表紙・見開き・ラベルをキャンバスに描いてテクスチャにします。作品のプリセットは [`src/art/presets.ts`](src/art/presets.ts) です。

## クレジット

このケースは ゆくらす が作っています。

光の通し方とケースの開き方は、Ann Nguyen（[@ann_nnng](https://x.com/ann_nnng)）の [CD Case](https://www.bubbbly.com/cd-case) を参考にしています。ソースは [vibe-coding / cd-case](https://github.com/annnguyentt/vibe-coding/tree/main/cd-case) で、[TypingMind](https://typingmind.com) を使って作られた作品です。ここから学ぶときは、元のページへリンクを戻してください。

このリポジトリのコードは [MIT](LICENSE) です。
