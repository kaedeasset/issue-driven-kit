# 取り込む（導入ガイド）

[README](../README.md) に戻る。**読む人: 取り込む側のリポジトリで働く Claude Code（Codex でも同じ）と人。** Claude Code に「`https://github.com/kaedeasset/commit-hooks` の docs/install.md のとおりに取り込んで」と頼めば、この手順を上から順に進めます。

取り込み先のルートで。置き場は `Tools/commit-hooks` を既定にする（変えるなら下の全部のパスを替える）。

1. 調べる（結果で分かれる）

   ```sh
   git config --get core.hooksPath                                    # A
   ls "$(git rev-parse --git-common-dir)/hooks" | grep -v '\.sample$'  # B
   git log -50 --format=%s | head -20                                 # C
   ls *.uproject Assets/ ProjectSettings/ package.json 2>/dev/null    # D
   ```

   | 結果 | すること |
   |---|---|
   | A が空 | このまま進む |
   | A に値がある（husky・lefthook など） | 下の「hooksPath を使う repo」 |
   | B に `commit-msg` か `pre-commit` がある | `install.sh` は上書きせず FAIL で止まる。中身を読み、残すものならユーザーに確かめる |
   | C に `feat` 〜 `test` 以外の種類が多い | 5 で `commit-hooks.conf` の `types=` に足す |
   | D | profile を決める: `.uproject` → `unreal`・`Assets/` と `ProjectSettings/` → `unity`・`package.json` → `node`・どれも無い → `plain`。Unity のプロジェクトが repo の 1 段下にあれば、5 で `generated=` を上書きする（`profiles/unity/profile.conf` の注） |

2. 取り込む（取り込み先の作業ツリーが綺麗な状態で）

   ```sh
   git subtree add --prefix=Tools/commit-hooks https://github.com/kaedeasset/commit-hooks.git main --squash
   ```

3. 試す・入れる

   ```sh
   sh Tools/commit-hooks/test.sh               # → HOOKS-TEST PASS cases=63 os=<OS>
   sh Tools/commit-hooks/install.sh unreal     # → HOOKS-INSTALL conf=created commit-msg=installed pre-commit=installed others=… verdict=PASS
   sh Tools/commit-hooks/install.sh unreal     # 2 回目 → conf=exists … unchanged
   ```

   `others=` に、1 の B で見たフック（Git LFS の `post-checkout` など）が残っていること。

4. 本物で確かめる

   - `git commit --allow-empty -m "fix: 試し"` → M4・M5 で止まる
   - `rules.md` の形のファイルで `git commit --allow-empty -F <ファイル>` → 通る → `git reset --soft HEAD~1` で取り消す

5. その repo だけの違いを `commit-hooks.conf` に書く（1 の C・D で要ると分かったものだけ）。

6. スキルと規約
   - `skill/SKILL.md` を `.claude/skills/commit/SKILL.md` に写す。既にあるなら、メッセージとステージの決まりのうち `rules.md`・`stage.md` と重なる節を「正は `Tools/commit-hooks/…`」に置き換え、その repo だけの決まりは残す
   - `CLAUDE.md`（Codex なら `AGENTS.md` も）に 1 行: 「**コミットメッセージの形と載せない物はフックが検査する**（形は `Tools/commit-hooks/rules.md`。`--no-verify` を使わない）」
   - 取り込み先の `.gitattributes` に `Tools/commit-hooks/** text eol=lf`（下の「改行」）

7. `commit-hooks.conf` と 6 の変更をコミットする。このコミットがフックの最初の本番になる。push はユーザーに言われたときだけ。

**合格:** `HOOKS-TEST PASS`・`HOOKS-INSTALL … verdict=PASS`（2 回目は `conf=exists`・`unchanged`・元のフックが残る）・4 で旧い形が止まり新しい形が通る・7 のコミットが通る。報告には 1 の結果・選んだ profile・各コマンドの最後の行を書く。

## worktree を使っている repo

`.git/hooks/` は全 worktree で共有なので `install.sh` は 1 回でよい。本体と `commit-hooks.conf` は各 worktree の追跡ファイルを読むので、まだ取り込んでいないブランチの worktree では中継が「無い」と出して検査を飛ばす（取り込んだ main を入れれば効き始める）。

## hooksPath を使う repo

`core.hooksPath` があると `.git/hooks/` は読まれない。仕組みは外さず、その仕組みのフックから本体を呼ぶ（`commit-hooks.conf` はひな形 `commit-hooks.conf.example` を repo の直下に写して `profile=` を書く）。husky なら:

```sh
# .husky/commit-msg
sh Tools/commit-hooks/hooks/commit-msg "$1"
# .husky/pre-commit
sh Tools/commit-hooks/hooks/pre-commit
```

## 改行

sh のファイルは LF でないと落ちる。このリポジトリの `.gitattributes` は subtree では効かないので、取り込み先の `.gitattributes` に足す:

```
Tools/commit-hooks/** text eol=lf
```

## 戻し方

`$(git rev-parse --git-common-dir)/hooks/commit-msg` と `pre-commit` を消せば止まる。取り込んだフォルダは `git rm -r Tools/commit-hooks`、設定は `git rm commit-hooks.conf` で消す。

