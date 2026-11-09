# Issue の無人実行のまとめ（20261109-200500）

`scripts/issue-run/issue-run.mjs` が自動で書いた。リポジトリ kaedeasset/issue-driven-kit・作業場所 issue-driven-kit（main）・ログ `.issue-run/logs/20261109-200500/`

| Issue | 結果 | 分 | 時刻 | 回 | コミット | 断られたツール |
|---|---|---|---|---|---|---|
| #48 無人の回の実績を数えるスクリプト stats.mjs を Node 版に足す | PASS | 4 | 2026-11-09 20:05〜20:09 | 1 | 2 |  |

## #48 無人の回の実績を数えるスクリプト stats.mjs を Node 版に足す — PASS

- `daeef6b fix: stats.mjs の --repo に値が無いときの知らせを直す`
- `f542bf2 feat: 無人の回の実績を数える stats.mjs を足す`

### 結果: 合格
| 合格の条件 | 判定 | 根拠（コマンドと結果） |
|---|---|---|
| 設計書 5 章の試験 3 本があって通る | OK | `node scripts/test.mjs --filter stats` → 3 本 ✔・`Result: PASS 3/3`（判定役も回し直して同じ） |
| `stats.mjs` があり、`lib.mjs` の `parseResultHead`・`runStats` を使う | OK | `editions/node/files/scripts/issue-run/stats.mjs` を足した。`lib.mjs` に `export function parseResultHead`・`export function runStats`。`node editions/node/files/scripts/issue-run/stats.mjs` → 終了コード 0 で数を出す |
| Node 版の `issue-run.md` に節「## 実績を数える」があり `stats.mjs` を書く | OK | `editions/node/files/docs/guides/working/issue-run.md` に節と部品の表の行を足した（判定役が行を確かめた） |
| 設計書 6 章の変えないものが変わっていない | OK | `git diff --stat b8fe734 HEAD -- <守るパス>` が空・`git status` が clean（判定役） |
| キットの試験が全部通る | OK | `node scripts/test.mjs` → tests 111・pass 109・fail 0・skipped 2（Windows/Unity だけの物）・`Result: PASS 109/109` |

### やったこと
- `lib.mjs` に `parseResultHead`（結果のコメントの 1 行目を読む。`issue-run.mjs`・`issue-run.ps1` の両方、（開始〜終了）の有無・日またぎを読む）と `runStats`（設計書 2 章の数・取りこぼしの知らせ）を足した
- `stats.mjs` を足した（`gh issue list --state all --limit 1000 --json number,labels,comments`、`--repo` だけを受ける、`gh` 失敗で終了コード 1、`Result:` 行は出さない）
- `issue-run.md` に節「## 実績を数える」と部品の行、`issue-driven-development.md` に部品の行を足した
- `tests/node.test.mjs` に試験 3 本、K-1 の部品の一覧に `stats` を足した
- このリポジトリで実際に回した結果：回した 46 件・合格 44 件・1 回目で合格 43 件・分の中央値 4 分／合計 213 分・結果のコメント 46 件（PASS 44・NOT-PASS 2）
- 別のエージェントに判定させ、5 条件とも OK。指摘の「`--repo` に値が無いときの知らせ」を直した

### コミット
- f542bf2 feat: 無人の回の実績を数える stats.mjs を足す
- daeef6b fix: stats.mjs の --repo に値が無いときの知らせを直す

### 選んだこと（自分で決めた点・違っていたときの戻し方）
- `stats.mjs` は `runStats` だけを呼び、`parseResultHead` は `runStats` の中で使う（`stats.mjs` は頭書きでその名を書く）。直接呼ばせたいなら `stats.mjs` に import を足す
- `runStats` は `{ limit, commentLimit }` を引数に取れるようにした（既定 1000・100。試験で小さい件数を渡すため）。不要なら引数を外す
- 「1 回目で合格」は結果のコメント 1 つ・PASS・回 1 の物だけ（1 回の起動の中で 2 回目に合格した物は入らない）。設計書 2 章の文のとおり

### やらなかったこと・断られた操作
- 直下の写しの入れ直し（`install.mjs --update`）・README の数字の書き換え（Issue の「やらないこと」）
- 断られた操作は無い

### 未採用の改善（気づいたがブロッカーでないもの。直さない）
- `stats.mjs` の「コメントが 100 件以上」の知らせの 100 が、`runStats` の `commentLimit` と別に書いてある
- README の数字（ラベルで数えた物）は、コメントで数えた数と違う見込み。合格の後に会話で KaedeScapeBuii とこのリポジトリを数えてから直す（設計書 7 章）

