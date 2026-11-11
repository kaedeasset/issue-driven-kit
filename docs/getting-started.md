---
generated_by: Claude Opus 5.5
date: 2026-11-11
type: guide
project: document-authoring
---

# はじめての導入 — clone してから、自分のリポジトリで最初の文書が検査を通るまで

[README](../README.md) に戻る。

この説明書は**人**が読むものです。document-authoring を自分の PC に clone し、自分のリポジトリを開いた Claude Code に「これを入れて」と頼み、最初の文書が検査を通るまでを順に書きます。
Claude Code が実際に進める細かい手順は [導入ガイド（install.md）](install.md) にあります。人がそれを読む必要はありません。

> [!NOTE]
> **入力するプロンプト**は `text` の枠です。Claude Code の入力欄にそのまま貼ってください。`<…>` は自分の値に置き換えます。

## 0. 全体の流れ

```mermaid
flowchart LR
    S1["1 道具を確かめる"] --> S2["2 clone して PC に置く"] --> S3["3 自分のリポジトリで Claude Code を開く"] --> S4["4 「これを入れて」と頼む"] --> S5["5 結果を見て決める"] --> S6["6 最初の文書を書かせる"]
```

人がするのは、**clone する・プロンプトを貼る・聞かれたことに答える・既にある文書をどうするか決める・push を決める**の 5 つです。

## 1. 道具を確かめる

| 道具 | 確かめるコマンド | 無いとき |
|---|---|---|
| git | `git --version` | Windows は Git for Windows（`winget install --id Git.Git -e`）。検査はこれに入っている sh で動く。Mac は `xcode-select --install` |
| Claude Code | `claude --version` | 公式の手順（https://code.claude.com ）で入れる |
| 自分のリポジトリ | `git status` が通る | 先に `git init` するか clone する |

自分のリポジトリの作業ツリーを綺麗にしておきます（`git status` が `nothing to commit, working tree clean`）。取り込みは、未コミットの変更があると `fatal: working tree has modifications.  Cannot add.` で止まります。

## 2. clone して PC に置く

**自分のリポジトリの外**に置きます。置き場はどこでもかまいません。

```powershell
# Windows
git clone https://github.com/kaedeasset/document-authoring.git D:\tools\document-authoring
```

```sh
# Mac
git clone https://github.com/kaedeasset/document-authoring.git ~/tools/document-authoring
```

この clone は、Claude Code に読ませる**説明書**です。自分のリポジトリに入るのは、`git subtree` で GitHub から取り込んだ物です（`.claude/skills/document-authoring/` に入ります）。clone の中で何かを実行する必要はありません。

## 3. 自分のリポジトリで Claude Code を開く

```powershell
cd D:\<自分のリポジトリ>
claude
```

clone の中で開かないでください。開いたフォルダーのリポジトリに入ります。

## 4. 「これを入れて」と頼む

```text
D:\tools\document-authoring\docs\install.md を読んで、そのとおりにこのリポジトリへ document-authoring を取り込んで。
取り込みは install.md の手順 2 のとおり GitHub から git subtree add で入れて（clone したフォルダーは読むだけ）。
1 の調べた結果・既にある文書の check.sh の結果・各コマンドの最後の行を報告して。push はしないで。
```

Mac なら 1 行目のパスを `~/tools/document-authoring/docs/install.md` にします。

### Claude Code が順にすること

| 段 | Claude Code がすること | 人がすること |
|---|---|---|
| 1 調べる | 未コミットの変更・既にあるスキル・CLAUDE.md の置き場・文書の置き場を調べる | 既に文書のスキルがあるなら、どちらを使うか答える |
| 2 取り込む | `git subtree add` で `.claude/skills/document-authoring/` に取り込む | — |
| 3 試す | `test.sh` で 32 の場合を回す | — |
| 4 既にある文書を検査する | `check.sh` で `docs/` と `README.md` を見て、数を報告する。**直さない** | 5 で決める |
| 5 違いを書く | 既定が合わないときだけ `document-authoring.conf` を書く | — |
| 6 規約 | CLAUDE.md に 1 行足す。`.gitattributes` に改行の決まりを足す | 置き場の節を足すか答える |
| 7 コミット | 5・6 の変更をコミットする | — |

## 5. 結果を見て決める

報告に `DOC-TEST PASS` があれば、入っています。

既にある文書が検査に落ちるのは、ふつうのことです（決まりを入れる前に書いた文書なので）。どうするかを 1 つ選んで頼みます。

| 選ぶもの | 頼み方 |
|---|---|
| 古い文書はそのまま。新しく書く文書から決まりを守る（おすすめ） | `既にある文書は直さないで、frontmatter は新しい文書の置き場だけにして` |
| 機械で直せるもの（コードの枠の言語・パス）だけ直す | `check.sh の D3 と D6 だけ直して` |
| 全部直す | `check.sh が PASS するまで既にある文書を直して` |

## 6. 最初の文書を書かせる

```text
このリポジトリのセットアップ手順書を書いて
```

スキルが動き、ひな形から書いて `check.sh` を回し、外れた所を直してから報告します。報告の最後に `DOC-CHECK PASS files=1 errors=0 warnings=0` があれば通っています。

push は人が決めます（`push して`）。

## 入れた後の使い方

| したいこと | Claude Code に入力するプロンプト |
|---|---|
| 設計書を書く | `<機能>の設計書書いて` |
| 手順書を書く | `<作業>の手順書を作って` |
| README を直す | `READMEを初めて見た人向けに直して` |
| 作業の記録を残す | `今日の作業の記録を書いて` |
| 文書を全部検査する | `check.sh で文書を全部検査して` |
| 更新を受け取る | `document-authoring を GitHub から subtree pull で更新して、test.sh を回して` |
| 自分の repo だけ決まりを変える | `document-authoring.conf で type に memo を足して` |

人が書いた文書も、`sh .claude/skills/document-authoring/check.sh <ファイル>` で同じように検査できます。

## うまくいかないとき

| 起きたこと | 原因 | 直し方 |
|---|---|---|
| `fatal: working tree has modifications.  Cannot add.` | 未コミットの変更がある | 先にコミットする |
| `prefix '.claude/skills/document-authoring' already exists.` | ほかのキットの写しが既にある | install.md の 1 の B のとおり、中身を確かめてから消して取り込み直す |
| sh が `\r` や `bad interpreter` で落ちる | 改行が CRLF になった | `.gitattributes` に `.claude/skills/document-authoring/** text eol=lf` を足し、入れ直す |
| D6 が説明の文に当たる | パスの例をそのまま書いた | 名前の所を `<you>` か `…` にする |
| スキルが動かない | Claude Code を取り込む前から開いていた | Claude Code を開き直す |
