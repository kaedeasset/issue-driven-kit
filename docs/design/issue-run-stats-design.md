# 無人の回の実績を数えるスクリプトの設計

README の実績（無人の回に渡した Issue の数・合格した数など）を、手で数えずに、コマンド 1 つでいつでも同じ方法で数え直せるようにする。Node 版に `scripts/issue-run/stats.mjs` を足す。

## 1. ゴール

キットを入れたリポジトリで `node scripts/issue-run/stats.mjs` を回すと、そのリポジトリの無人の回の実績が数行で出る。`--repo <owner/name>` で、ほかのリポジトリ（Unity 版を入れたリポジトリも）を数えられる。

## 2. 数えるもの

GitHub の Issue（開いている物も閉じた物も）を `gh issue list --state all --limit 1000 --json number,labels,comments` で読む。Issue ごとに、3 章で読める**結果のコメント**（`parseResultHead` が `null` でないコメント）を、並んでいる順（古い順）に取り出してから数える。

| 出す行 | 数え方 |
|---|---|
| 回した Issue | 結果のコメントが 1 つ以上ある Issue の数。**実績の分母** |
| 合格 | 回した Issue のうち、いちばん後の結果のコメントが PASS の数 |
| 1 回目で合格 | 回した Issue のうち、結果のコメントが **1 つだけ**で、それが PASS・回 1 の数（不合格の後にやり直して合格した Issue は入らない） |
| 分 | 合格した Issue ごとに、その Issue の**全部の**結果のコメントの分を足した数（合格までにかかった無人の時間）。その中央値と合計。中央値は、件数が偶数なら真ん中の 2 つの平均を四捨五入した整数 |
| 結果のコメント | 結果のコメントの数と、結果ごとの数（PASS・NOT-PASS・ABORTED） |
| ラベル（参考） | ラベル `claude-run`・`claude-done`・`claude-failed` の付いた Issue の数。`claude-run` のうち結果のコメントが無い物（まだ回していない物）の数を添える |

ラベルは人が付け替えることがある（不合格の後に人が確かめて `claude-done` を付けるなど）ので、実績はコメントで数え、ラベルは参考に出すだけにする。

コメントを書いた人の権限は見ない（数えるだけで、何も起動しないため）。そのため既存の `lastRunComment`（権限を見る・起動しなかったときのコメントにも当たる）は使わない。

取りこぼしの知らせ：`gh issue list` が返した Issue がちょうど 1000 件なら、「1000 件で切られたかもしれない」と出す。コメントが 100 件以上ある Issue があれば、その番号を出す（`gh` が Issue ごとに返すコメントの上限に当たったかもしれないため）。数えることは止めない。

## 3. 結果のコメントの 1 行目の読み方

形の正は仕様 5 章（書く側は `lib.mjs` の `headLine`）。2 つの版のどちらのスクリプトの名前（`issue-run.mjs`・`issue-run.ps1`）でも読む。

```text
<スクリプトの名前>: **<PASS|NOT-PASS|ABORTED>** — <分> 分（<開始>〜<終了>）・<回> 回・コミット <件数> 件・…
```

- `（<開始>〜<終了>）` は、あっても無くても読む（初めのころの形には無い。例 `issue-run.ps1: **PASS** — 7 分・1 回・コミット 2 件・…`）。日をまたいだ形（`〜2026-11-10 01:02`）も読む。
- 読めない行は `null`：人のコメント・起動しなかったときのコメント（`issue-run.mjs: **起動しなかった** — …`）・太字の無い行・結果の語が違う行。

## 4. 部品

| 置き場 | 中身 |
|---|---|
| `editions/node/files/scripts/issue-run/lib.mjs` | ふつうの関数を 2 つ足す。`parseResultHead(text)`（コメントの本文の 1 行目を読む）→ `{ script, status, minutes, rounds, commits }` か `null`。`runStats(issues)`（`gh` の JSON の配列）→ 2 章の数と取りこぼしの知らせ。外に触らない |
| `editions/node/files/scripts/issue-run/stats.mjs` | `gh` を呼び、`runStats` に渡して、2 章の行を出す。頭書き（用法の行つき）を付ける。合否を出す道具ではないので `Result:` 行は出さない。`gh` が失敗したら理由を出して終了コード 1、数えられたら 0。引数は `--repo <owner/name>` だけ（無ければ `gh` が作業場所の `origin` から決める） |
| `editions/node/files/docs/guides/working/issue-run.md` | 節「## 実績を数える」を足す（コマンド・出す行の意味・README などに写すときは日付を添えること）。部品の表に `stats.mjs` の行を足す |
| `editions/node/files/docs/guides/working/issue-driven-development.md` | 部品の表に `stats.mjs` の行を足す |
| `tests/node.test.mjs` | 5 章の試験。あわせて、試験 K-1 の Node 版の部品の一覧（`['issue-run', 'lib', 'proc', 'check-lib', 'doctor', 'sync-lanes']`）に `stats` を足す（足さないと K-1 が落ちる） |

取りこぼしの知らせに使う上限の数（読む Issue の 1000・Issue ごとのコメントの 100）は、`lib.mjs` の `export const STATS_LIMITS = { issues: 1000, comments: 100 }` の 1 か所で決める。`runStats` の既定と、`stats.mjs` の `gh` の `--limit` と知らせの文は、どれもここから読む（数を別の所に書かない。CLAUDE.md 原則 5）。

Node.js の標準の部品だけを使う（基本設計 D11）。PowerShell を使わない（D2）。Unity 版には足さない（Node 版の `stats.mjs` で Unity 版のリポジトリも数えられるため）。仕様（無人の回のふるまいの決まり）は変えない。

## 5. 試験の名前

| 名前 | 確かめること |
|---|---|
| `stats: 結果のコメントの 1 行目を読む` | 両方のスクリプトの名前の行から、結果・分・回・コミットを読む。（開始〜終了）の無い古い形と、日をまたぐ形も読む。`parseResultHead(headLine({…}))` で、書く側の形をそのまま読めることを確かめる |
| `stats: 形の違う行は読まない` | 人のコメント・起動しなかったときのコメント・太字の無い行・結果の語が違う行は `null` |
| `stats: 上限の数を 1 か所で決める` | `runStats` を引数なしで呼んだとき、コメントが `STATS_LIMITS.comments` 件の Issue を知らせ、1 件少ない Issue は知らせない。Issue が `STATS_LIMITS.issues` 件のときに切られたかもしれないと知らせる |
| `stats: 回した・合格・1 回目で合格・分を数える` | 小さい Issue の配列から 2 章の数を出す。不合格の後にやり直して合格した Issue が「1 回目で合格」に入らず、分は全部の回の合計になること。中央値（偶数の件数）。ラベルの参考の数と、まだ回していない物の数 |

## 6. 変えないもの

- 仕様 `shared/spec/issue-run-spec.md`・Unity 版 `editions/unity/`・見本 `shared/fixtures/`・入れるスクリプト `editions/node/install.mjs`
- `issue-run.mjs`・`doctor.mjs`・`check-lib.mjs`・`proc.mjs`・`sync-lanes.mjs`
- 直下の写し（合格の後に会話で `node editions/node/install.mjs --target . --update` を回して入れる）

## 7. 合格の条件

1. 5 章の試験が全部あって通る
2. `editions/node/files/scripts/issue-run/stats.mjs` があり、`lib.mjs` の `parseResultHead`・`runStats` を使う
3. Node 版の `issue-run.md` に節「## 実績を数える」があり、`stats.mjs` を書く
4. 6 章の変えないものが、作業ツリーとコミットの両方で変わっていない（確認コマンドの `gitClean`）
5. キットの試験が全部通る

合格の後、会話で KaedeScapeBuii とこのリポジトリを数え、README の数字（2026-11-09 に手で数えた物）と比べる。README の「100 件のうち 98 件」はラベルで数えた数なので、2 章のコメントで数えた数とは違うことが見込まれる。そのときは、README を 2 章の数に置き換える。
