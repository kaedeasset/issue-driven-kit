# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

エージェント向けの規約。**短く保つ。** 理由・経緯・手順はここに書かず、下の「入口」へ置く。
Issue 駆動キット（Unity 版）を入れた。入れた版は `.issue-kit/version`。
規約を足したくなったら、先にここの行を1つ減らせないか考える。

## プロジェクト

- <何を作るか。1〜3 行>
- Unity **<版>**・<描画方式>・<入力の方式>。
- テストのアセンブリ `<名前空間>.Tests.EditMode`（`Assets/Tests/EditMode/`）。
- ロジックはふつうの C# に出し、MonoBehaviour は配線だけにする（EditMode で速く確かめるため。design-cycle §2）。

## コマンド

```powershell
pwsh -NoProfile -File Scripts/unity-test.ps1                 # EditMode（-Platform PlayMode / All）
pwsh -NoProfile -File Scripts/unity-test.ps1 -Filter '<名前空間.クラス.テスト>'   # 1 本
pwsh -NoProfile -File Scripts/unity-test.ps1 -CompileOnly    # コンパイルだけ
pwsh Scripts\issue-run.ps1 -DryRun                           # Issue の無人実行の点検（本番はユーザーが別の窓で）
```

合否は最後の `Result:` 行（PASS 0・FAIL 1・**BLOCKED 3 = Unity エディタがこのフォルダーを開いている。合格ではない**）。

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

- **`.meta` は本体と必ず対で動かす・消す・コミットする。手で書かない・作り直さない**（GUID が変わるとシーン・プレハブの参照が切れる）。外でファイルを動かすなら `.meta` も一緒に `git mv`。
- **シーン・プレハブ・`.asset` の YAML を手で直さない。** C#（エディタ用スクリプト・`-executeMethod`）かエディタで変える。
- **起動中の Unity エディタを勝手に止めない。** エディタが開いているフォルダーではバッチモードを回さない（BLOCKED）。
- `Library/` `Temp/` `Logs/` `UserSettings/` と生成される `*.csproj` `*.slnx` は編集もコミットもしない。
- **push は明示されたときだけ・force しない。** `git worktree add` / `remove` を勝手に実行しない。
- **セッションは自分の worktree から出ない。** 他のレーンの取り込み・状態の確認・編集は統合セッション（main）の仕事。**main で機能開発をしない**（main はレーン同期・push・文書と、同期の後のテストで落ちたものの修正まで）。

## 入口（作業別に読む。ここから先を CLAUDE.md へ写さない）

| 作業 | 読む |
|---|---|
| **機能・改善を作る**（ゴール → 合格の条件 → 詳しい設計書 → 実装 → テスト → NG を設計か実装かに振り分け → 合格判定） | `.claude/skills/design-cycle/SKILL.md` |
| **テストを回す・結果を読む・テストを書く場所** | `Docs/Guides/Procedures/unity-test-procedure.md` |
| **テスト計画**（用語・テストレベル・合格基準・中断基準・欠陥管理。これ1か所が正） | `Docs/Guides/Decisions/test-plan.md` |
| **Issue 駆動の全体**（誰が何をするか・部品・1 件の流れ・どの文書が何の正か）と**再現**（版・ゼロからの手順・点検 `Scripts/issue-run-doctor.ps1`） | `Docs/Guides/Working/issue-driven-development.md` |
| **Issue を作る・見る・無人で回す**（会話の中で） | `.claude/skills/github-issue/SKILL.md` |
| **ゴールと合格の条件を決めて Issue に書く**（確認コマンド・守るファイル・例） | `Docs/Guides/Procedures/issue-goal-setting.md` |
| **Issue を無人で進めさせる仕組み**（`Scripts/issue-run.ps1`・止まらない仕組み・ラベル・準備） | `Docs/Guides/Working/issue-run.md` |
| **worktree のレーン**（レーンの一覧・所有するフォルダー・main の役割・レーンの作り方）・**朝の同期**（「レーン同期して」＝`/lane-sync`・`Scripts/Sync-Lanes.ps1`） | `Docs/Guides/Working/worktree-lanes.md` |
| **生成 AI の CLI・MCP を足す・使う**（口はコマンドとファイル・無人の回で MCP を使わない・自作 MCP を作る条件） | `Docs/Guides/Decisions/genai-cli-mcp-policy.md` |
| GitHub（リポジトリの作り方・push・弾かれたとき） | `Docs/Guides/Working/github-repo.md`・スキル `commit` `push` `pr` |
| 文書を書く（設計書・手順書の形）・記録を残す | スキル `document-authoring`・`save-report` |
| C# のファイルの頭書き | スキル `file-header` |

## 置き場

| 置き場所 | 何を置くか | 判定基準 |
|---|---|---|
| `Docs/Guides/Working/` | **作業中に参照する**（仕組み・設計の正）。実装を変えたらここを更新する | いまの実装と合っているか |
| `Docs/Guides/Procedures/` | 手順（作業の順番と通過条件） | 手順として正しいか |
| `Docs/Guides/Manuals/` | 使う人に渡す説明書 | 読んで操作できるか |
| `Docs/Guides/Decisions/` | 方針・決定（変わったらここを更新する正） | いまの決定と合っているか |
| `Docs/Guides/Reading/` | 読み物・参考（**作業中には引かない**） | 読んで分かるか |
| `Docs/Reports/YYYY/MM/DD/` | その時点の記録（更新しない） | — |
| `Docs/InSpecs/YYYY/MM/` | **人が書く文書（主に入力）の唯一の置き場**。Claude は読むだけで、書き換えない・作らない。人以外の文書（設計書・Issue・手順書・記録）は全部 Claude Code が `Docs/Guides/` と `Docs/Reports/` に書く | 人が置いたとおりか |

混ぜない。更新され続けるものを `Docs/Reports/` に置かない。`Assets/` に `.md` を置かない。`Docs/Guides/` の直下には README 以外を置かない。
