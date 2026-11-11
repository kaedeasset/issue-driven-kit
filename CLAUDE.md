# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

エージェント向けの規約。**短く保つ。** 理由・経緯・手順はここに書かず、下の「入口」へ置く。
このリポジトリは **Issue 駆動キットそのもの**。キット自身にも Node 版を入れて、キットを Issue 駆動で作る（入れた版は `.issue-kit/version`）。
規約を足したくなったら、先にここの行を1つ減らせないか考える。

## プロジェクト

- **Issue 駆動キット**：利用先のリポジトリに写す部品（`editions/unity/files/`・`editions/node/files/`）・入れる脚本・共有の仕様と見本と説明書（`shared/`）・キットの設計（`docs/design/`）・キット自身の試験（`tests/`）・Node 版の見本のプロジェクト（`examples/node-sample/`。試験 K-5 がこれに Node 版を入れて回す）。
- Node.js **22.14.0**（`.nvmrc`）・npm **11.6.2**。キットの試験は **`node --test`**（`tests/*.test.mjs`。npm のパッケージを使わない）。Unity 版の試験は Windows と PowerShell 7 があるときだけ回る。
- 脚本のロジックは外に触る所（子のプロセス・GitHub・ファイル）から外へ出し、ふつうの関数にする（`lib.mjs` のように。試験で速く確かめるため。design-cycle §2）。

## コマンド

```text
node scripts/test.mjs                              # テスト（npm test も同じ）
node scripts/test.mjs --filter '<テストの名前>'      # 1 本
node scripts/issue-run/doctor.mjs                  # Issue の無人実行の点検
node scripts/issue-run/issue-run.mjs --dry-run     # 対象の Issue を見るだけ（本番はユーザーが別の窓で）
```

合否は最後の `Result:` 行（PASS 0・FAIL 1）。

## 原則（常時）

1. **依頼の目的と範囲で働く。** 範囲内で `git` で戻せる判断は自分で決めて進み、**選んだ結果を1行で書く**（何を選んだか・違っていたらどう戻すか）。取り返しのつかないもの（削除・push・Issue の作成や閉じる等の外への書き込み・起動中のツール〔エディタ・開発サーバーなど〕の停止・worktree の追加削除）だけ先に確認する。
2. **着手した修正は直し切る。発見を自動で仕事にしない。** 新しく気づいたものは、テスト計画 §8 の「ブロッカー」に当たるときだけ直す。当たらないものは「未採用の改善」として報告に1行残す。
3. **現行の挙動はソースと実行結果で確かめる。** 文書と違えば差を示し、どちらを直すか目的から決める。答えが実測で決まるなら、測ってから選ぶ。
4. **合否を感想で上書きしない。** スクリプトの測定結果（`Result:` 行）を使う。出力に合わせてテストや合格条件を変えない。機械で測れない実感・見た目は観測記録として区別し、ユーザーが決める。**合格まで「できた」と言わない**（design-cycle）。
5. **一つの契約は一か所で定義する。** 変えるときは旧文を置き換える（例外を追記しない）。日付つきレポートは記録であって現況ではない。

## 進め方の決まり（キットの共通）

- 人の言葉が要る次の一手（外への書き込み・決めること）は、返答の最後の行に、次の一手の言い方そのもの（例: `コミットしてpushして`）を 1 行で書く。頼み方の文（「〜と言って…」）で包まない。**Claude Code の灰色の提案に出る形にする**：1 文・12 語以内・100 字未満・改行や太字を入れない。頼みがいくつもあるときは、いちばん先の 1 つだけを書く（決めごとがいくつも残るときは `残りはおすすめで決めて` のようにまとめる）。
- 決めることには推しの案を必ず付ける。
- 設計書を了承する前に、別のエージェントに見直させる。
- 実装の Issue を作る前に確認コマンドを 1 回回し、いま落ちる理由が「まだ作っていないから」であること、ツールが作ったファイルが残っていないことを確かめる。確認コマンドは、後ろの行まで偽の状態で回して確かめる。

## 守るもの（変えない）

- **無人の Issue 実行の決まりは `shared/spec/issue-run-spec.md` に 1 回だけ書く。** 変えるときは、仕様 → 両方の版の脚本 → 見本（`shared/fixtures/`）の順に直す。
- **`editions/unity/files/` は KaedeScapeBuii で動いた実物の写し。** 変えるのは理由があるときだけで、変えたら試験の K-4（参照との比べ）の許す差を、理由と一緒に直す。いま許している差は、PC の中のパスを `<you>` に伏せたことだけ（公開のため）。
- **Node 版（`editions/node/`）に PowerShell を入れない**（`.ps1`・`pwsh`・`powershell` の実行を書かない。Claude の道具を断る `PowerShell(…)` の設定の行だけは可。基本設計 D2）。Node 版の脚本は Node.js の標準の部品だけ（D11）。
- `shared/claude-md/` の決まりは、両方の版の `CLAUDE.md` に同じ文で入れる（試験が見る）。
- **このリポジトリの直下の `.claude/`・`scripts/`・`docs/guides/` は、`editions/node/files/` から入れた写し。** 直すときは `editions/node/files/` を直してから、`node editions/node/install.mjs --target . --update` で入れ直す（直下だけを直さない）。キット用なのは、テストの入口の設定 `.issue-kit/config.json`（`node --test` で `tests/*.test.mjs` を回す）と `commit-hooks.conf` だけ（`scripts/test.mjs` も版の写し）。`.claude/skills/document-authoring/` と `Tools/commit-hooks/` は版の写しではなく、kaedeasset/document-authoring・kaedeasset/commit-hooks の `git subtree`（ここで直さない。向こうで直して `git subtree pull`）。**コミットメッセージの形と載せない物はフックが検査する**（形は `Tools/commit-hooks/rules.md`。`commit` スキルのメッセージの節はこのリポジトリでは使わない。`--no-verify` を使わない。フックが無い PC では `sh Tools/commit-hooks/install.sh node`）。
- **キットは npm のパッケージに頼らない**（`package.json` に依存を足さない。見本のプロジェクトの中だけは可）。**npm に公開しない**（`npm publish` など）。キットは GitHub の公開リポジトリ（MIT）で配る。**公開のリポジトリなので、秘密の値・作者の private のリポジトリの中身・PC の中のパスを入れない。**
- `node_modules/` `.issue-run/` は編集もコミットもしない。
- **push は明示されたときだけ・force しない。** `git worktree add` / `remove` を勝手に実行しない。
- **セッションは自分の worktree から出ない。** 他のレーンの取り込み・状態の確認・編集は統合セッション（main）の仕事。**main で機能開発をしない**（main はレーン同期・push・文書と、同期の後のテストで落ちたものの修正まで）。

## 入口（作業別に読む。ここから先を CLAUDE.md へ写さない）

| 作業 | 読む |
|---|---|
| **機能・改善を作る**（ゴール → 合格の条件 → 詳しい設計書 → 実装 → テスト → NG を設計か実装かに振り分け → 合格判定） | `.claude/skills/design-cycle/SKILL.md` |
| **テストを回す・結果を読む・テストを書く場所** | `docs/guides/procedures/node-test-procedure.md` |
| **テスト計画**（用語・テストレベル・合格基準・中断基準・欠陥管理。これ1か所が正） | `docs/guides/decisions/test-plan.md` |
| **Issue 駆動の全体**（誰が何をするか・部品・1 件の流れ・どの文書が何の正か）と**再現**（版・ゼロからの手順・点検 `scripts/issue-run/doctor.mjs`） | `docs/guides/working/issue-driven-development.md` |
| **Issue を作る・見る・無人で回す**（会話の中で） | `.claude/skills/github-issue/SKILL.md` |
| **ゴールと合格の条件を決めて Issue に書く**（確認コマンド・守るファイル・例） | `docs/guides/procedures/issue-goal-setting.md` |
| **Issue を無人で進めさせる仕組み**（`scripts/issue-run/issue-run.mjs`・止まらない仕組み・ラベル・準備） | `docs/guides/working/issue-run.md` |
| **worktree のレーン**（レーンの一覧・所有するフォルダー・main の役割・レーンの作り方）・**朝の同期**（「レーン同期して」＝`/lane-sync`・`scripts/issue-run/sync-lanes.mjs`） | `docs/guides/working/worktree-lanes.md` |
| **キットの設計**（決めること D1〜D12・作る順 K1〜K6・合格の条件 K-1〜K-8） | `docs/design/issue-driven-kit-basic-design.md` |
| **無人の回の仕様の正**（2 つの版が実装する決まり） | `shared/spec/issue-run-spec.md` |
| **適用例 3 本の元ネタ**（TypeScript・.NET・Java の要件と設計・共通の前提）と、**5 回作り直して回5で成功させる計画** | `docs/guides/working/examples/README.md`・`docs/design/issue-driven-examples-plan.md` |
| **利用者の手順**（導入ガイド） | `shared/manuals/issue-driven-kit-install-guide.md` |
| **生成 AI の CLI・MCP を足す・使う**（口はコマンドとファイル・無人の回で MCP を使わない・自作 MCP を作る条件） | `docs/guides/decisions/genai-cli-mcp-policy.md` |
| GitHub（リポジトリの作り方・push・弾かれたとき） | `docs/guides/working/github-repo.md`・スキル `commit` `push` `pr` |
| 文書を書く（設計書・手順書の形）・記録を残す | スキル `document-authoring`（kaedeasset/document-authoring の subtree。書いたら `check.sh` を通す）・`save-report` |
| TypeScript・JavaScript のファイルの頭書き | スキル `file-header` |

## 置き場

| 置き場所 | 何を置くか | 判定基準 |
|---|---|---|
| `docs/guides/working/` | **作業中に参照する**（仕組み・設計の正）。実装を変えたらここを更新する | いまの実装と合っているか |
| `docs/guides/procedures/` | 手順（作業の順番と通過条件） | 手順として正しいか |
| `docs/guides/manuals/` | 使う人に渡す説明書 | 読んで操作できるか |
| `docs/guides/decisions/` | 方針・決定（変わったらここを更新する正） | いまの決定と合っているか |
| `docs/guides/reading/` | 読み物・参考（**作業中には引かない**） | 読んで分かるか |
| `docs/reports/YYYY/MM/DD/` | その時点の記録（更新しない） | — |
| `docs/inspecs/YYYY/MM/` | **人が書く文書（主に入力）の唯一の置き場**。Claude は読むだけで、書き換えない・作らない。人以外の文書（設計書・Issue・手順書・記録）は全部 Claude Code が `docs/guides/` と `docs/reports/` に書く | 人が置いたとおりか |
| `docs/design/`・`shared/` | キットの設計・共有の部品（仕様・見本・説明書・事例） | キットの設計と合っているか |

混ぜない。更新され続けるものを `docs/reports/` に置かない。`src/` に `.md` を置かない。`docs/guides/` の直下には README 以外を置かない。