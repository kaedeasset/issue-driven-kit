# commit-hooks

Claude Code が書くコミットを、git のフックで検査するキットです。「何を確かめたか」を書いていないメッセージや、`.env`・生成物・大きすぎるファイルが入ったコミットは、その場で止めて直し方を出します。Claude Code はそれを読んで、自分で直してコミットし直します。

## Summary (English)

Git hooks (plain POSIX `sh`, no dependencies) that check every commit Claude Code makes: the message must say *why*, *what was verified* (`確かめ:`) and a short retrospective, and the staged content must not include secrets, build outputs, oversized files or missing Unity `.meta` files.
When a check fails, the hook prints which rule failed and a template, so the agent fixes the commit itself instead of reaching for `--no-verify`.
Profiles for Unreal / Unity / Node.js / plain repos; shared via `git subtree`, with 63 cases tested by real `git commit` runs (`sh test.sh`).

## こう止まる

Claude Code がよくやる「件名だけのコミット」は、こう止まります。

```text
$ git commit -m "fixed some bugs and updated the login page and everything else too"
COMMIT-MSG FAIL M1,M4,M5
  M1 件名が「種類(範囲): 説明」の形でない（種類は feat|fix|docs|refactor|chore|test・範囲は省ける）
  M4 「確かめ:」の行が無い（回していなければ「確かめ: なし（文書のみ）」）
  M4 本文（なぜ・変えたこと）が無い
  M5 「---」だけの行と、その後の感想（1〜3 行）が無い

形（commit-hooks の rules.md）:
  fix(login): 期限切れのときにログイン画面へ戻す
  ...
--no-verify は使わない。メッセージを直してコミットし直す。
```

載せてはいけない物も、ステージした時点で止まります。

```text
$ git add .env && git commit -F msg.txt
PRE-COMMIT FAIL P2 .env（秘密らしいファイル名。載せない）
--no-verify は使わない。ステージから外す（git restore --staged <パス>）か、中身を直してコミットし直す。
```

通るコミットはこの形です。あとから履歴を読んだ人が「なぜ」「何で確かめたか」を追えます。

```text
fix(login): 期限切れのときにログイン画面へ戻す

期限が切れても前の画面に留まり、操作がすべて失敗していた。
期限切れを受けたらログイン画面へ戻す。

確かめ: 単体テスト 42 件 PASS。期限を 1 秒にして手で戻ることを確認。

---
原因は思ったより手前にあった。

Co-Authored-By: Claude {モデル名} <noreply@anthropic.com>
```

## なぜフックで止めるのか

AI にコミットを任せると、次のことが起きます。指示文や CLAUDE.md に書くだけでは、長い作業の途中で忘れられます。フックは git が必ず通るので、忘れても止まります。

| 困りごと | 解き方 | 検査 |
|---|---|---|
| 件名が長い・何をしたか分からない | `種類(範囲): 説明` の形で、説明は 40 字以内 | M1・M2・M3 |
| 「できた」と書くが、何も回していない | `確かめ:` の行を必ず書かせる。回していなければ「なし」と書かせる | M4 |
| なぜ変えたかが残らない | 本文を 1 行以上 | M4 |
| 作業の手ごたえが残らない | `---` の後に 1〜3 行の感想（詰まったところが次の人の手がかりになる） | M5 |
| `git add -f` で無視するはずの物を足す | `.gitignore` に当たるファイルを足したら止める | P1 |
| `.env`・鍵・`settings.local.json` を載せる | 秘密らしい名前を止める | P2 |
| 100MiB を超えて push が拒まれる | 95MiB で止め、50MiB で警告 | P3 |
| `node_modules/`・`Library/`・`Binaries/`・`.DS_Store` を載せる | フレームワークごとの生成物と OS のファイルを止める | P4 |
| Unity の `.meta` を忘れる・残す | アセットと `.meta` の対応を見る | P5 |
| Unreal のマップの一部だけを載せる | 1 アクタ 1 ファイルの残りを警告する | P6 |
| LFS の対象を素の中身のまま載せる | ポインタでない大きな中身を止める | P7 |

止まったときの出力は、**AI がそのまま読んで直せる**ように書いてあります。外れた項目の番号・理由・正しい形のひな形・「`--no-verify` を使わない」の 4 つを必ず出します。

全部の決まりの正は → [rules.md](rules.md)

## Claude Code との組み合わせ

| 道具 | 役目 |
|---|---|
| フック（`hooks/commit-msg`・`hooks/pre-commit`） | 検査する。止まったら直し方を出す |
| スキル（[`skill/SKILL.md`](skill/SKILL.md)） | 「コミットして」で、変えたファイルだけをステージし、決まりの形でメッセージを書く。中身は `rules.md` を指すだけなので、1 度写せば更新しなくてよい |
| CLAUDE.md に 1 行 | 「コミットの形と載せない物はフックが検査する。`--no-verify` を使わない」 |
| `profiles/<profile>/stage.md` | フレームワークごとの「ステージしない物」「コミット前に確かめること」を、人と Claude Code の両方が読む |

導入も Claude Code に任せられます。[導入ガイド](docs/install.md)は、Claude Code が上から順に実行して、各コマンドの最後の行（`HOOKS-TEST PASS`・`verdict=PASS`）で合否を判断できるように書いてあります。

## 設計で決めたこと

- **決まりは一か所に書く。** 形は `rules.md`、値は `profiles/`。スキルや CLAUDE.md には写さず、指すだけ。
- **値は 3 段で上書きする。** 全体の既定（`profiles/common.conf`）→ フレームワーク別（`profiles/<profile>/profile.conf`）→ その repo だけ（取り込み先の直下の `commit-hooks.conf`）。3 段目は取り込んだフォルダの外にあるので、更新で上書きされない。
- **依存を持たない。** POSIX の `sh`・`awk`・`sed`・`grep` だけ。Windows は Git for Windows の sh、Mac・Linux は標準の sh で動く。
- **試験は本物の `git commit` で回す。** `test.sh` は使い捨ての repo を作り、入れて、63 の場合をコミットして確かめる。
- **`git subtree` で配る。** 取り込んだ repo で直した分は `subtree push` で送り返し、ここで main に入れて全部の repo に届ける。

## 選べる profile

| profile | 向いている repo | 主に足す検査 |
|---|---|---|
| `unreal` | `.uproject` がある | `Binaries/`・`Intermediate/`・`Saved/` など・マップの載せ漏れ（P6）・LFS |
| `unity` | `Assets/` と `ProjectSettings/` がある | `Library/`・`Temp/` など・`.meta` の対応（P5） |
| `node` | `package.json` がある | `node_modules/`・`dist/` など |
| `plain` | どれでもない | 共通の検査だけ |

## 使ってみる

取り込み先のリポジトリのルートで:

```sh
git subtree add --prefix=Tools/commit-hooks https://github.com/kaedeasset/commit-hooks.git main --squash
sh Tools/commit-hooks/test.sh            # → HOOKS-TEST PASS cases=63 os=<OS>
sh Tools/commit-hooks/install.sh node    # → HOOKS-INSTALL ... verdict=PASS（profile は上の表から）
git commit --allow-empty -m "fix: 試し"   # → M4・M5 で止まれば効いている
```

Claude Code に頼むなら、このプロンプトで導入できます。

```text
https://github.com/kaedeasset/commit-hooks の docs/install.md のとおりに、このリポジトリへ commit-hooks を取り込んで。
1 の調べた結果・選んだ profile・各コマンドの最後の行を報告して。push はしないで。
```

husky・lefthook を使っている repo、既にフックがある repo、worktree を使っている repo の分かれ道は → [導入ガイド](docs/install.md)

止めたいときは `$(git rev-parse --git-common-dir)/hooks/` の `commit-msg` と `pre-commit` を消すだけです。

## 中身

| 置き場 | 中身 |
|---|---|
| [`rules.md`](rules.md) | メッセージの形と検査の一覧（M1〜M5・P1〜P7）の正 |
| `hooks/` | 検査の本体（`commit-msg`・`pre-commit`）・値の読み込み・中継のひな形 |
| `profiles/` | 共通の既定（`common.conf`）と、フレームワーク別の値と `stage.md` |
| `os/` | Windows・Mac の注意 |
| `install.sh` | `.git/hooks/` に中継を書き、`commit-hooks.conf` が無ければ作る（2 回目は何も変えない） |
| `test.sh` | 使い捨ての repo で 63 の場合を回す |
| [`skill/SKILL.md`](skill/SKILL.md) | Claude Code のコミットスキルのひな形 |
| [`docs/install.md`](docs/install.md) | 導入ガイド（分かれ道・hooksPath・改行・戻し方） |
| [`docs/operations.md`](docs/operations.md) | 運用マニュアル（どこを直すか・フレームワークと OS の違い・送り返し方・受け取り方・踏んだもの） |

## 作者・ライセンス

人が決まりと合格の条件を決め、結果を確かめて push します。フック・試験・文書は Claude Code が書きました（このリポジトリのコミットも、この決まりの形で書いてあります。例は `git log` で）。[MIT](LICENSE)。

---

> この文書は Claude Opus 5.5 が生成しました。内容の正確性は人間のレビューを経て確認してください。
