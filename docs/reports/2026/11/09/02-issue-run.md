# Issue の無人実行のまとめ（20261109-193451）

`scripts/issue-run/issue-run.mjs` が自動で書いた。リポジトリ kaedeasset/issue-driven-kit・作業場所 issue-driven-kit（main）・ログ `.issue-run/logs/20261109-193451/`

| Issue | 結果 | 分 | 時刻 | 回 | コミット | 断られたツール |
|---|---|---|---|---|---|---|
| #47 「札」の言い方をやめてラベルなどにする（Node 版・共有の部品）・README と基本設計の小さい直し | PASS | 5 | 2026-11-09 19:35〜19:39 | 1 | 1 |  |

## #47 「札」の言い方をやめてラベルなどにする（Node 版・共有の部品）・README と基本設計の小さい直し — PASS

- `c5cb828 docs: 「札」をラベルなどの一般の言い方にする`

### 結果: 合格
| 合格の条件 | 判定 | 根拠（コマンドと結果） |
|---|---|---|
| 5 つの置き場のどのファイルにも「札」が無い | 合格 | `grep -rln 札 editions/node shared/spec shared/manuals shared/claude-md docs/guides/working/examples` → 出力なし（ファイルの数は 32・1・7・2・7） |
| 基本設計の状態の行が `kaedeasset/issue-driven-kit` を指す | 合格 | `grep "^\| 状態 \|"` の行に kaedeasset が 2 回（リンクの文字と URL）出て、mkanakureon は 0 回。D1 の行は変えていない |
| README に置き場のリンクがある | 合格 | `](shared/spec/)`・`](shared/manuals/)`・`](docs/design/)` の 3 つとも見つかった |
| 設計書 4 章の変えないものが変わっていない | 合格 | `git diff --name-only bdeb930 HEAD -- <守る置き場>` → 出力なし。`git status --short` も空 |
| キットの試験が全部通る | 合格 | `node scripts/test.mjs` → `Result: PASS 106/106` |

判定は別のエージェントがした（証拠のログと差分を読ませた）。5 つとも合格で、言い換えは設計書 2 章に合っているという判定だった。

### やったこと
- `editions/node/files/`・`shared/spec/`・`shared/manuals/`・`docs/guides/working/examples/` から「札」をなくした（全部で 63 か所）。言い換えは設計書 2 章のとおり：
  - GitHub のラベルの意味は「ラベル」にした
  - Issue そのものの意味は「Issue は〜を指すだけ」にした。一枚ものの比喩が要る所だけ「依頼票」にした
  - npm の dist-tag は「タグ」にした
  - 仕様 1 章の表の行の名前は「対象」にした
- 見出しを言い換えたので、その見出しを名前で引いている文も同じ名前に直した：
  - `issue-goal-setting.md` の「## 7. ラベルを付ける前の確かめ」
  - チーム向けガイドの 7.6 と付録 C.3
- README の「中身」の表のリンクを、ファイルではなく置き場（`shared/spec/`・`shared/manuals/`・`docs/design/`）に向けた。
- 基本設計の「状態」の行のリンクを `kaedeasset/issue-driven-kit` にした。

### コミット
- c5cb828 docs: 「札」をラベルなどの一般の言い方にする

### 選んだこと（自分で決めた点・違っていたときの戻し方）
- チーム向けガイドの用語表で、Issue の説明を「「やること」の書き込み。1 件に 1 つの仕事を書く」にした。「依頼票」は表の例えの欄にもう出ているので、重ならないようにした。違っていたら、その 2 行を直す。
- Issue のひな形の `about:` を「issue-run.mjs が拾う Issue。」にした（Issue を主語にした言い方）。違っていたら c5cb828 のその行を戻す。
- `issue-goal-setting.md` の ③ は一枚ものの比喩なので「依頼票」にした。
- 導入ガイドに写している画面のメッセージは、Node 版の新しい文「前回の実行中のラベルを外した」に揃えた。

### やらなかったこと・断られた操作
- 直下の写し（`.claude/`・`scripts/` など）は入れ直していない（Issue の指示どおり）。合格の後に会話で `node editions/node/install.mjs --target . --update` を回す。
- Unity 版（`editions/unity/files/`）と見本（`shared/fixtures/`）は変えていない（設計書 4 章）。
- 断られた操作は無い。

### 未採用の改善（気づいたがブロッカーでないもの。直さない）
- Unity 版の `issue-run.ps1` は「前回の実行中の札を外した」と出し続けるので、Node 版の出し方と違う（設計書 4 章で認めている差）。

