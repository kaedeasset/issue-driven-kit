---
generated_by: Claude Opus 5.5
date: 2026-11-11
type: guide
project: document-authoring
---

# 取り込む（導入ガイド）

[README](../README.md) に戻る。**読む人: 取り込む側のリポジトリで働く Claude Code（Codex でも同じ）。** 人向けの説明は [はじめての導入](getting-started.md)。

取り込み先のルートで、上から順に進める。置き場は `.claude/skills/document-authoring` を既定にする（変えるなら下の全部のパスと `SKILL.md` の手順 4 のパスを替える）。

## 1. 調べる（結果で分かれる）

```sh
git status --short                                         # A
ls -d .claude/skills/*/ 2>/dev/null                        # B
grep -n '置き場' CLAUDE.md 2>/dev/null                      # C
git ls-files -- '*.md' | head -30                          # D
```

| 結果 | すること |
|---|---|
| A に何か出る | 取り込みは作業ツリーが綺麗でないと始まらない。ユーザーに、先にコミットするか聞く |
| B に `document-authoring/` がある（ほかのキットの写しなど） | subtree では上書きできない。中身を読み、その repo だけの決まり（置き場など）を CLAUDE.md へ移してよいかユーザーに確かめてから、`git rm -r` して進む |
| B に別の名前の文書のスキルがある | 残すか、どちらを使うかをユーザーに確かめる |
| C が空 | 6 で CLAUDE.md に置き場の節を足すことを提案する |
| D の文書の置き場が `docs/` でない | 5 で `check_paths`・`frontmatter_paths` を合わせる |

## 2. 取り込む

```sh
git subtree add --prefix=.claude/skills/document-authoring https://github.com/kaedeasset/document-authoring.git main --squash
```

## 3. 試す

```sh
sh .claude/skills/document-authoring/test.sh       # → DOC-TEST PASS cases=<数> os=<OS>
```

## 4. 既にある文書を検査する（直さない）

```sh
sh .claude/skills/document-authoring/check.sh      # 既定は docs/ と README.md
```

**ここでは文書を直さない。** 結果の数（`errors=`・`warnings=`）と、多い検査の番号をユーザーに報告する。直すかどうかはユーザーが決める。

## 5. その repo だけの違い（要るときだけ）

4 の結果と 1 の D から、既定が合わないときだけ、ひな形を repo の直下に写して直す。

```sh
cp .claude/skills/document-authoring/document-authoring.conf.example document-authoring.conf
```

| 4 で多かったもの | 合わせ方の例 |
|---|---|
| D4（既にある文書に frontmatter が無い） | 既にある文書を直さないなら `frontmatter_paths=` を空にするか、新しい文書の置き場だけにする |
| 文書が `docs/` 以外にある | `check_paths=`・`frontmatter_paths=` にその置き場を足す |
| `type:` に決まりにない種類がある | `types=` に足す |

## 6. 規約

- `CLAUDE.md`（Codex なら `AGENTS.md` も）に 1 行: 「**文書は `document-authoring` スキルで書き、`check.sh` を通す**（決まりの正は `.claude/skills/document-authoring/rules.md`）」
- 1 の C が空なら、置き場の節（何をどこに置くか）を足すことをユーザーに提案する
- 取り込み先の `.gitattributes` に `.claude/skills/document-authoring/** text eol=lf`（sh のファイルは LF でないと落ちる。このリポジトリの `.gitattributes` は subtree では効かない）

## 7. コミット

5・6 の変更をコミットする。push はユーザーに言われたときだけ。

**合格:** `DOC-TEST PASS`・7 のコミットが通る。報告には 1 の結果・4 の最後の行と多い検査の番号・5 で変えた値・各コマンドの最後の行を書く。

## 戻し方

`git rm -r .claude/skills/document-authoring`。設定は `git rm document-authoring.conf`。CLAUDE.md の 1 行を消す。
