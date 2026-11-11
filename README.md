# Issue 駆動キット（issue-driven-kit）

GitHub Issue に合格の条件と確認コマンドを書いてラベルを付けると、Claude Code が合格するまで設計・実装・テストを無人で回す仕組みを、自分のリポジトリに入れるキットです。

## Summary (English)

Write pass criteria and a check command in a GitHub Issue, add a label, and Claude Code runs design, implementation and tests unattended until the check passes.
Track record (as of 2026-11-09, counted by `scripts/issue-run/stats.mjs`): in the original Unity repository KaedeScapeBuii (private), 95 of 100 unattended Issues passed (81 on the first try) over 466 commits; in this repository kaedeasset/issue-driven-kit (public), 45 of 47 passed (44 on the first try).
It works by combining headless mode (`claude -p`), a Stop hook, `--resume` with the check command's output, and deny rules in settings, so the agent neither stops halfway, claims "done" without passing, nor runs dangerous operations.

## 実績

2026-11-09 時点の記録です（更新し続ける数字ではありません）。`node scripts/issue-run/stats.mjs` で、無人の回が Issue に書いた結果のコメントから数えました（人が直してから閉じた Issue は合格に入れていません）。

| 対象 | 数字 |
|---|---|
| 元の Unity のリポジトリ KaedeScapeBuii（private） | 19 日（2026-10-22〜11-09）・コミット 466 件・無人の回に渡した Issue 100 件のうち 95 件が合格（81 件は 1 回目で合格） |
| KaedeScapeBuii で作った物 | Unity の撮影ツール。描画方式 3 つ（Built-in・URP・HDRP）で EXE まで |
| このリポジトリ kaedeasset/issue-driven-kit（公開） | 無人の回に渡した Issue 47 件のうち 45 件が合格（44 件は 1 回目で合格） |

合格した Issue はどれ？ → [kaedeasset/issue-driven-kit の合格した Issue の一覧](https://github.com/kaedeasset/issue-driven-kit/issues?q=label%3Aclaude-done)

## Issue 駆動を支える技術

AI に仕事を任せると、途中で止まる・合格していないのに「できた」と言う・やってはいけない操作をする、の 3 つが起きます。キットはこれを次の仕組みで防ぎます。

```mermaid
flowchart LR
  A[Issue にラベル] --> B[スクリプトが Claude Code を起動]
  B --> C[設計・実装・テスト]
  C --> D{スクリプトが確認コマンドで判定}
  D -->|合格| E[ラベル claude-done]
  D -->|不合格| F[出力を付けて続きから再開]
  F --> C
  D -->|決まった回数で不合格| G[claude-failed にして次の Issue へ]
```

人がやるのは、合格の条件を書くことと、結果を見て閉じる・push することです。

| 困りごと | 解き方 | 使っている Claude Code の機能 |
|---|---|---|
| 人がいないと進まない | スクリプトが Issue を 1 件ずつ取り、Claude Code を無人で起動する | Headless（`claude -p`） |
| 区切りで返答を終えて止まる | 合格の報告が書かれるまで、返答を終えさせない | Hooks（Stop hook） |
| 合格していないのに「できた」と言う | 合否はスクリプトが確認コマンドを回して決め、落ちたら出力を付けて同じ会話を続きから再開する | `--resume` |
| テストのほうを書き換えて合格にする | 判定に使うファイルの指紋を開始時に取り、変わっていたら合格にしない | （スクリプト） |
| push・削除など危ない操作をする | 設定で必ず断り、確認の画面も出さない | Settings（deny）・`--permission-mode auto`・`--permission-prompts none` |
| 質問して待ち続ける | 質問の道具を外し、「戻せるほうを選んで、選んだことを書く」決まりを渡す | `--disallowed-tools`・指示文と CLAUDE.md |
| 設定が効いているか分からない | スクリプトが起動前に `claude -p` で試し、Stop hook が呼ばれることと deny が効くことを確かめてから始める | （スクリプト） |

AI が途中で止まらないのはなぜ？ → [issue-run.md](docs/guides/working/issue-run.md)・無人の回の決まりの正は？ → [issue-run-spec.md](shared/spec/issue-run-spec.md)

人の側は、次の道具で支えます。

| 道具 | 役目 |
|---|---|
| スキル `github-issue` | 会話で Issue（ゴール・合格の条件・確認コマンド）を書く |
| スキル `design-cycle` | ゴールから合格判定まで（設計・実装・テスト・NG の振り分け）を回す |
| worktree のレーン | 作業を並べて動かし、朝に main へ同期する |
| CLAUDE.md | 短く保ち、作業ごとの文書へ振り分ける |
| [document-authoring](https://github.com/kaedeasset/document-authoring)（別のリポジトリ） | 設計書・手順書を決まった形で書き、検査（`check.sh`）を通してから出す。キットとは別に入れる（[導入ガイドの 5.3](shared/manuals/issue-driven-kit-install-guide.md#53-文書の決まりを入れるdocument-authoring別のリポジトリ)） |
| [commit-hooks](https://github.com/kaedeasset/commit-hooks)（別のリポジトリ） | コミットメッセージの形と、載せてはいけない物（秘密・生成物・大きいファイル）を git のフックで止める。無人の回のコミットも同じ検査を通る。キットとは別に入れる（[導入ガイドの 5.4](shared/manuals/issue-driven-kit-install-guide.md#54-コミットの検査を入れるcommit-hooks別のリポジトリ)） |

誰が何をして、1 件がどう流れる？ → [issue-driven-development.md](docs/guides/working/issue-driven-development.md)

## 設計で決めたこと

- 一つの決まりは一か所に書く（仕様 → 2 つの版 → 見本の順に直す）。
- 合否は AI の言葉ではなく、確認コマンドの実行結果で決める。
- npm の依存を持たない（Node.js の標準の部品だけ）。

なぜそう決めた？ ほかに何を決めた？ → [基本設計](docs/design/issue-driven-kit-basic-design.md)

## 版を選ぶ

| | **Unity 版** | **Node 版** |
|---|---|---|
| 向いているリポジトリ | Unity のプロジェクト | Node.js＋TypeScript（vitest・`node --test`）。.NET・Java など、テストの結果を JUnit の XML に書ける道具のプロジェクトも |
| 動く OS | Windows | Windows・Mac（どの版で確かめた？ → [確かめた版](shared/manuals/issue-driven-kit-install-guide.md#確かめた版)） |
| スクリプト | PowerShell 7 | Node.js 22.14.0 だけ（PowerShell は使わない） |

## 使ってみる

使うリポジトリは 3 つです。**どれも Claude Code へのプロンプトで入れます。** 人が手でするのは、Claude Code を起動するフォルダーを選ぶことと、GitHub へのログイン、無人の回の起動だけです。

| リポジトリ | 役目 | 要るか |
|---|---|---|
| [kaedeasset/issue-driven-kit](https://github.com/kaedeasset/issue-driven-kit)（ここ） | Issue を無人で回す仕組み | 要る |
| [kaedeasset/document-authoring](https://github.com/kaedeasset/document-authoring) | 設計書・手順書の書き方と検査（`check.sh`）。キットの `design-cycle` が書き方をここに任せる | おすすめ |
| [kaedeasset/commit-hooks](https://github.com/kaedeasset/commit-hooks) | コミットメッセージの形と載せない物を git のフックで止める。キットは利用先にフックを入れないので、無人の回のコミットを機械で止めるのはこれ | おすすめ |

document-authoring と commit-hooks は、それぞれ独立したリポジトリです。片方だけ入れてもかまいません。

```mermaid
flowchart LR
  A["道具の置き場で<br/>3 つを clone"] --> B["自分のリポジトリで<br/>claude を起動"]
  B --> C["キットを入れる"] --> D["document-authoring<br/>を取り込む"] --> E["commit-hooks<br/>を取り込む"] --> F["push"] --> G["最初の Issue"]
```

clone した 3 つは「道具の置き場」です。読むだけで、そこでは作業しません。自分のリポジトリの Claude Code に、置き場の絶対パスを示して「これを読んで、このリポジトリに入れて」と頼みます。

下の例は、道具の置き場を `D:\tools`（Mac は `~/tools`）、自分のリポジトリを `D:\work\my-app` にした場合です。パスは自分の場所に読み替えます。

### 1. 道具の置き場に 3 つを clone する

`D:\tools` のフォルダーで `claude` を起動し、順に入力します。

| 順 | 入力するプロンプト | 見るところ |
|---|---|---|
| 1 | `Git・GitHub CLI・Node.js 22.14.0 が入っているか確かめて、無い物を入れて。npm は 11.6.2 にして` | `node --version` が `v22.14.0`。Claude Code も要る（[導入ガイドの手順 1](shared/manuals/issue-driven-kit-install-guide.md#手順-1道具をそろえる)） |
| 2 | `! gh auth login`（`!` で始めると、人がその場でログインする） | `gh auth status` に `Logged in to github.com` |
| 3 | `kaedeasset の issue-driven-kit・document-authoring・commit-hooks の 3 つを、ここに clone して` | `D:\tools` の下に 3 つのフォルダーができる |

無人の回を長く回すなら、Claude Code の**外の**ターミナルで `claude setup-token` を回し、出た値を自分で環境変数 `CLAUDE_CODE_OAUTH_TOKEN` に入れます（人がする。値は会話に貼らない。[導入ガイドの 1.3](shared/manuals/issue-driven-kit-install-guide.md#13-ログイン人がする)）。

### 2. 自分のリポジトリで、3 つを入れてもらう

自分のリポジトリのフォルダーで `claude` を起動し直します。まだリポジトリが無ければ、親のフォルダー（`D:\work`）で `GitHub に private のリポジトリ my-app を作って、ここに clone して` と入力してから、`D:\work\my-app` で起動し直します。PC にはあるが GitHub に無いリポジトリなら、最初に `自分の GitHub に private のリポジトリを作って、このフォルダーを origin にして` と入力します（4 の点検と 8 の push は GitHub の origin が要る）。そのあと上から順に入力します。

| 順 | 入力するプロンプト | 見るところ |
|---|---|---|
| 1 | `D:\tools\issue-driven-kit\shared\manuals\issue-driven-kit-install-guide.md を読んで、このリポジトリに Node 版を入れて。まず --dry-run で、写すファイルと、ぶつかるファイルを見せて`（Unity のプロジェクトなら「Unity 版」） | 写すファイルの一覧。ぶつかるファイルがあれば、どうするか決める |
| 2 | `入れて。npm install まで回して、CLAUDE.md の <…> の所も全部このリポジトリに合わせて埋めて` | 最後の行が `Result: PASS (… 件を写した …)`。`CLAUDE.md` に `<…>` が残っていない |
| 3 | `テストの入口を、全部・0 件・わざと落とすテストを 1 本足す、の 3 つで回して、最後の Result: 行と終了コードを見せて。わざと落とすテストは最後に消して` | 全部は `Result: PASS`、0 件とわざと落とすは `Result: FAIL` |
| 4 | `issue-run の点検を回して` | 最後の行が `Result: PASS  WARN <数>`（NG が 0） |
| 5 | `キットを入れた分をコミットして` | 作業ツリーが綺麗になる（6・7 の取り込みは、綺麗でないと始まらない） |
| 6 | `D:\tools\document-authoring\docs\install.md を読んで、そのとおりにこのリポジトリへ document-authoring を取り込んで。push はしないで` | `DOC-TEST PASS cases=<数>` と `DOC-CHECK … files=<数> errors=<数>`（既にある文書のエラーを直すかは自分で決める）。最後にコミットまでする |
| 7 | `D:\tools\commit-hooks\docs\install.md を読んで、そのとおりにこのリポジトリへ commit-hooks を取り込んで。push はしないで` | `HOOKS-TEST PASS` と `HOOKS-INSTALL … verdict=PASS`。選んだ profile（Node 版なら `node`）。最後のコミットがフックを通る |
| 8 | `pushして` | GitHub に上がる。無人の回は GitHub の Issue を読むので、ここまで要る |

6 と 7 は、この順に 1 つずつ進めます。7 の後は、キットの `commit` スキルのメッセージの決まりが commit-hooks の `rules.md` を指す形に直ります。

### 3. 最初の Issue を回す

同じ Claude Code で続けます。最初は、合否を機械で測りやすい「文書を書かせる Issue」にします。

| 順 | 入力するプロンプト・すること |
|---|---|
| 1 | `<作りたい物の説明>。基本設計書にして、その後どこから Issue 駆動にするか検討して` → `おすすめで決めて` |
| 2 | `詳細設計を書かせる Issue にして` → 下書きを読んで `コミットしてpushしてから作って` |
| 3 | **別の窓で**、自分のリポジトリのフォルダーで `node scripts/issue-run/issue-run.mjs` を起動する（人がする）→ Claude Code に `issue-run を起動した` |
| 4 | `様子見て` … `終わったみたい` → `コミットしてpushして` → `doneはcloseして` |

多くの段で、次に入力するプロンプトが入力欄に灰色で出ます（Tab → Enter で送れる）。

### 新しくするとき

3 つは別々に新しくなります。自分のリポジトリの Claude Code で、`D:\tools の 3 つを git pull して、このリポジトリのキット・document-authoring・commit-hooks を新しくして。手を入れたファイルとの差を先に見せて` と入力します（キットは `--update`、ほかの 2 つは `git subtree pull`）。

各手順の詳しい説明・困ったときは？ → [導入ガイド](shared/manuals/issue-driven-kit-install-guide.md)

## 中身

| 置き場 | 中身 |
|---|---|
| [`shared/spec/`](shared/spec/) | 無人の Issue 実行の仕様の正（2 つの版はこれを実装する） |
| `editions/unity/`・`editions/node/` | 2 つの版：`files/`（利用先に写す物）と入れるスクリプト |
| [`shared/manuals/`](shared/manuals/) | 使う人向けの説明書（導入ガイド・チーム向けガイドなど） |
| [`docs/design/`](docs/design/) | キットの設計 |
| `tests/` | キット自身のテスト（`npm test`＝`node --test`） |

## 作者・ライセンス

人がゴールと合格の条件を書き、結果を確かめて push します。設計からコミットまでは Claude Code が行いました。[MIT](LICENSE)。

このリポジトリは公開です。作者の private のリポジトリの中身は入れていません（抜いた物は [`shared/SOURCE.md`](shared/SOURCE.md)）。

- **記録の番号について：** 説明書の中の「記録 22/01」「P54」のような呼び名は、作者の private の記録の番号です。記録そのものは入れていませんが、説明書はそれだけで読めるように書いてあります。

---

> この文書は Claude Opus 5.5 が生成しました。内容の正確性は人間のレビューを経て確認してください。
