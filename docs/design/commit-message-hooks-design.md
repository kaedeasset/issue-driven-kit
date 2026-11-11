---
generated_by: Claude Opus 5.5
date: 2026-10-28
type: design
project: issue-driven-kit
---

# コミットメッセージの決まりとフック（キット自身だけ）

| 項目 | 内容 |
|---|---|
| 状態 | **置き換えた**（2026-11-11 ユーザー決定）：キット自身のフックは kaedeasset/commit-hooks（`Tools/commit-hooks/` の subtree。形の正は `Tools/commit-hooks/rules.md`）に置き換え、`scripts/git-hooks/` と `tests/git-hooks.test.mjs` は消した。この設計書は作ったときの記録として残す。以下は置き換える前の状態。設計・**了承済み**（2026-10-28 ユーザー。その前に別のエージェントの見直しの指摘〈止める 1・直す 6・軽い 5〉を入れた）。作り方：`scripts/git-hooks/` と試験は無人の回の Issue、CLAUDE.md の文・中継を入れること・G2 の実測は main のセッション。**作った**（2026-10-28。#38 で本体と試験・G1 は `Result: PASS 83/83`。main で中継を入れ〈2 回目は変化なし〉、G2 を実測：`node` が PATH に無い Bash から、形でないコミットは M4・M5 で終了コード 1、形のコミットは 0。試しのコミットは `reset --soft` で取り消した） |
| 元 | kaedevn の指示書 `Docs/Reports/2026/10/28/01-commit-message-rules-and-hooks.md`（2026-10-28。kaedevn のユーザー判断：件名＋本文に「なぜ・変えたこと」、`確かめ:` の行、`---` の後の感想。守らせ方はフック） |
| 範囲 | **このリポジトリ（キット自身）だけ**（2026-10-28 ユーザー決定）。Node 版・Unity 版の部品（`editions/`）と、利用先へ配るものは変えない |

---

## 0. ゴールと合格の条件

### 0.1 ゴール

このリポジトリでコミットする人と Claude（会話・無人の回のどちらも）が、決まりの形でないメッセージや、入れてはいけないファイルをコミットしようとすると、git が止めて、外れた項目とひな形を見せる。それを見て直せば通る。

### 0.2 合格の条件

| # | 条件 | 測り方 | 誰が |
|---|---|---|---|
| G1 | 6 章の試験が全部通る | `node scripts/test.mjs` → `Result: PASS` | 機械 |
| G2 | 中継を入れた後、このリポジトリで 3 章の形でないコミットが止まり、3 章の形なら通る | main で 1 回ずつ実測（試しのコミットは、そのあと `git reset --soft HEAD~1` で取り消す） | 会話の Claude が回して記録・ユーザーが確認 |
| G3 | 入れる脚本を 2 回回しても結果が同じ。中身が違う同名のフックが既にあれば、上書きせずに止まる | 6 章の試験 | 機械 |

---

## 1. いまの状態（2026-10-28 実測・マージを除く 77 件）

| 項目 | 値 |
|---|---|
| 本文が無い（件名と `Co-Authored-By:` の行だけ） | 65 件（84%） |
| 件名の説明（`: ` より後）の長さ | 40 字以下 16・41〜100 字 48・101〜200 字 13・最長 136 字 |
| 種類 | docs 48・fix 11・chore 9・feat 4・test 4・形なし 1（最初の公開のコミット） |
| フック | 無い（`.git/hooks/` は見本だけ。`core.hooksPath` は未設定。Git LFS は PC に入っているが、このリポジトリはフックを入れていない） |
| `.gitattributes` | `* text=auto eol=lf`・`*.png binary` |
| 追跡中で `.gitignore` に当たるファイル | 0 本（`git ls-files -ci --exclude-standard`） |
| いちばん大きいファイル | 147KB（`shared/manuals/issue-driven-guide-for-teams.md`） |
| 脚本の中の `git commit` | 無い。ただし `sync-lanes.mjs` 53 行目の `git merge --no-edit` はマージのコミットを作り、commit-msg が回る（件名が `Merge ` で始まるので例外で通る。54 行目は失敗を「衝突」と報告するので、フックが落ちると誤った報告になる） |
| 会話の Claude のセッションの `node` | この PC のいまのセッションは PATH が古く、`node` が見つからない（`C:\Program Files\nodejs\node.exe` はある）。中継が `node` だけを呼ぶと、コミットもマージも止まる |
| 試験の中の `git commit` | `tests/kit.test.mjs`・`tests/node.test.mjs` が `mkdtemp` の使い捨てのリポジトリで行う。フックはこのリポジトリの `.git/hooks/` にだけ入るので、効かない |

原因は kaedevn と同じ。決まりが `commit` スキル（「`{プレフィックス}: {日本語の説明}`」の 1 行の形）にしか無く、そのスキルは「コミットして」のときしか読まれない。無人の回は、指示文にコミットの書き方が無いまま直接 `git commit` する。

---

## 2. 指示の表

| 指示（kaedevn の指示書・ユーザー） | この設計で答える所 |
|---|---|
| 件名＋本文に「なぜ」「変えたこと」、`確かめ:` を足す | 3 章 |
| 守らせ方はフック。スキルに書くだけにしない | 4 章 |
| 感想（`---` の後）は残す | 3 章の M5 |
| ステージした中身も検査（P1〜P3） | 4.2 |
| `core.hooksPath` を変えない | 4.3 |
| キット自身だけ（2026-10-28） | 範囲・4.3 の置き場・7 章 |

kaedevn からの変更：

- 本体を POSIX sh でなく **Node.js の `.mjs`** にする。キットの脚本と試験は Node.js だけで書いている。文字数を数えるときのロケールの罠（kaedevn の 4.4）も起きない。
- 種類に **`test`** を足す（キットの `commit` スキルにあり、履歴にも 4 件ある）。
- `(範囲)` は**任意**にする（キットの履歴は `docs: …` の形で、範囲を書いていない）。
- 中継ファイルを書く脚本は、PowerShell でなく Node.js にする。

---

## 3. 書き方

```text
fix: 指示文の確かめの行を testRunner に合わせる

決め打ちで「（vitest）」と書いていたので、node --test のリポジトリでも vitest と出ていた。
- lib.mjs に testRunnerOf と workspaceStateText を足した
- issue-run.mjs は package.json を読んでそれを呼ぶだけにした
（Issue #35）

確かめ: node scripts/test.mjs → Result: PASS 55/55

---
決め打ちの 1 語でも、Claude が読む文では効いてしまう。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

| 部分 | 決まり |
|---|---|
| 件名 | `種類: 説明` か `種類(範囲): 説明`。種類は feat・fix・docs・test・refactor・chore。**説明は 40 字以内**（文字数）。Issue の番号・細目・日付・ハッシュは本文へ |
| 空行 | 件名の次は空行 |
| なぜ・変えたこと | 本文の頭に 1 行以上。細目は `- ` の箇条書き。Issue の番号は本文に **`（Issue #35）`** の形で書く（手順書 `issue-goal-setting.md` 4.4 の `git log --grep='Issue #<番号>）'` は全角の閉じかっこまで探す。`git log --grep` は本文も探す） |
| 確かめ | `確かめ:` で始まる行を 1 行。`---` より前に置く。回していなければ `確かめ: なし（文書のみ）` と書く |
| 感想 | 最後の `---` だけの行の後に 1〜3 行 |
| 末尾 | 末尾の行（`^(Co-Authored-By\|Signed-off-by\|Reviewed-by\|Helped-by):`。大文字と小文字を区別しない）。検査しない |

例外（検査しない）：件名が `Merge `・`Revert "`・`Reapply "`・`fixup!`・`squash!`・`amend!` で始まるもの。

**形の正**：この章の決まりとひな形は `scripts/git-hooks/lib.mjs` に 1 回だけ書き、フックが外れたときに表示する。直下の `commit` スキルの「コミットメッセージのルール」の節（1 行の形）は、このリポジトリでは使わない（CLAUDE.md の 1 行で決める。4.4）。

---

## 4. フック

### 4.1 commit-msg（メッセージの検査）

| # | 検査 | 止める例 |
|---|---|---|
| M1 | 件名が `^(feat\|fix\|docs\|test\|refactor\|chore)(\([^)]*\))?: (.+)$` に合う | `予告編を直した`・空のメッセージ |
| M2 | 説明（M1 の正規表現の最後の組）が 40 文字以内。NFC にそろえてから `[...s].length` で数える（バイト数でない） | いまの 136 字の件名 |
| M3 | 2 行目が空行 | 本文が 2 行目から始まる |
| M4 | 最後の `---` より前に、`確かめ:` か `確かめ：` で始まる行がある。かつ、同じく最後の `---` より前に、件名・空行・`確かめ` の行・末尾の行（3 章）を除いた本文が 1 行以上ある | 件名と `Co-Authored-By:` だけ |
| M5 | `---` だけの行があり、最後の `---` の後に、空でなく末尾の行（3 章）でもない行が 1 行以上ある | 感想なし・`---` の後が `Signed-off-by:` だけ |

- 読む前に、CRLF を LF にし、`# ------------------------ >8 ------------------------`（`git commit -v` の切り取り線）から後を捨て、`#` で始まる行を捨てる。`-m` のときは git が `#` の行を残すが、フックは数えない（そういう行だけを本文にすると M4 で止まる。止まる側に倒す）。
- 例外の件名なら、ほかを見ずに通す。
- 空のメッセージは M1 で止める（git もそのあと中止する）。
- 外れたら、外れた項目を全部（`M2: 説明が 41 字（40 字まで）` の形）と 3 章のひな形を標準エラーに出し、終了コード 1。無人の回の Claude は、この表示だけで直せる。

### 4.2 pre-commit（ステージした中身の検査）

| # | 検査 | 理由 |
|---|---|---|
| P1 | 今回足すファイル（`git diff --cached --name-only --no-renames --diff-filter=A -z`）のうち、`git check-ignore --no-index --stdin -z` に当たるものがあれば止める | `git add -f` で無理に足した `.issue-run/`・`node_modules/` など。`.gitignore` だけが正になる。追跡済みのファイルの更新は見ない（誤って止めない） |
| P2 | 秘密らしい名前を、足す・変えるのどちらでも止める（`--no-renames --diff-filter=AM`）。パスの最後の名前を、大文字と小文字を区別せずに `.env`・`.env.*`・`.dev.vars`・`credentials.*`・`*.pem`・`*.key` と照らす。`.claude/settings.local.json` はパス全体で照らす。中身は見ない | **公開のリポジトリ**なので、`.gitignore` から漏れていても止める。`.env.example` も止まる（いまは追跡 0 本。要るときは名前を変える） |
| P3 | ステージした 1 ファイル（`--no-renames --diff-filter=ACM`）が 95MB を超えたら止める。50MB を超えたら警告だけ | GitHub は 100MB で push を断る。いまの最大は 147KB |

- `--no-renames` を付けるのは、`git mv x node_modules/y` や `.env` への付け替え（R）を、足した物（A）として見るため。
- `git check-ignore` は、当たりが無いと終了コード 1 を返す。これは誤りでない（0 は当たりあり、1 は当たりなし、それ以外を誤りとして止める）。
- ファイルの大きさは、作業ツリーでなくステージした中身で測る（`git cat-file -s :<パス>`）。
- 外れたら、外れたファイルと理由を出して終了コード 1。
- 環境変数（`GIT_INDEX_FILE` など）はそのまま子の `git` に渡す（`git commit --only` は一時的なインデックスを使うため）。

**検査しないもの**：中身の秘密の値・PC の中のパス（`C:\Users\…`）。CLAUDE.md で禁じているが、文書の例や試験に正当な形で出てきて、名前だけでは見分けられない。要るなら別の設計にする。`Co-Authored-By` の有無・1 行の長さ・言語も見ない（kaedevn と同じ）。

### 4.3 置き場と入れ方

| ファイル | 役目 |
|---|---|
| `scripts/git-hooks/lib.mjs`（新規） | 検査の本体。ふつうの関数（`checkMessage(text)` → 外れた項目の配列、`checkStaged({ added, changed, ignored, sizes })` → 外れた物と警告） |
| `scripts/git-hooks/commit-msg.mjs`（新規） | ファイルを読んで `checkMessage` を呼び、表示と終了コードだけ |
| `scripts/git-hooks/pre-commit.mjs`（新規） | `git` を呼んでステージした物を集め、`checkStaged` を呼ぶ |
| `scripts/git-hooks/install.mjs`（新規） | `git rev-parse --git-common-dir` の `hooks/` に、中継の `commit-msg`・`pre-commit` を LF で書き、実行の権限（`0o755`）を付ける。同じ中身なら何もしない。違う中身の同名のファイルがあれば、中身を出して止まる。最後の行は `Result: PASS`／`Result: FAIL` |

中継ファイル（`commit-msg` の例。`pre-commit` も同じ形）：

```sh
#!/bin/sh
# scripts/git-hooks/install.mjs が書いた中継。本体は各 worktree の scripts/git-hooks/
h="scripts/git-hooks/commit-msg.mjs"
[ -f "$h" ] || { echo "commit-msg: $h が無い（この worktree はまだ入っていない）。検査を飛ばす" >&2; exit 0; }
n="$(command -v node)"
for c in "$PROGRAMFILES/nodejs/node.exe" "/c/Program Files/nodejs/node.exe" /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -n "$n" ] && break; [ -x "$c" ] && n="$c"
done
[ -n "$n" ] || { echo "commit-msg: node が見つからない。PATH に Node.js を入れた新しい窓でコミットする（導入ガイド 1 章）" >&2; exit 1; }
exec "$n" "$h" "$@"
```

- git はフックをリポジトリの直下で起こすので、本体はリポジトリの直下からの相対パスで指す。
- **`node` が PATH に無いとき**（この PC のいまの会話のセッションがそう。1 章）は、よくある場所を順に試す。それでも無ければ**止める**（検査を飛ばして通すと、決まりが黙って効かなくなる）。
- **`core.hooksPath` は変えない。** 中継は `.git/hooks/` に直に書く。
- 置き場は直下の `scripts/git-hooks/`。直下の `scripts/` は Node 版の写しだが、`install.mjs --update` は キットの一覧にあるファイルしか触らない（`install.mjs` 41・49〜60・85〜88 行目）ので、ここは残る。
- フックは git が `sh` で起こす。Windows では Git for Windows の `sh`、Mac では `/bin/sh`。Mac の git は実行の権限が無いフックを無視するので、`0o755` を必ず付ける。

### 4.4 文書（同じコミットで）

| 文書 | 変更 |
|---|---|
| 直下の `CLAUDE.md`「守るもの」 | 「直下の `scripts/test.mjs` だけはキット用」の文を、次に置き換える（行は増やさない）：「直下の `scripts/test.mjs` と `scripts/git-hooks/` だけはキット用。**コミットメッセージの形はフックが検査する**（形の正は `scripts/git-hooks/lib.mjs`。`commit` スキルのメッセージの節はこのリポジトリでは使わない。`--no-verify` を使わない）」 |
| 直下の `.claude/skills/commit/SKILL.md` | **変えない**（Node 版の写しで、`--update` で上書きされる）。どちらが正かは CLAUDE.md の上の文で決める |
| `editions/` の文書・指示文の雛形 | 変えない（範囲の外） |

---

## 5. 作る順

1. `scripts/git-hooks/lib.mjs` と 6 章の単体の試験
2. `commit-msg.mjs`・`pre-commit.mjs`・`install.mjs` と、使い捨てのリポジトリの試験
3. CLAUDE.md の 1 行
4. main で `node scripts/git-hooks/install.mjs` を回し、G2 を実測する（このコミット自身が 3 章の形で通ること）

---

## 6. 試験（`tests/git-hooks.test.mjs`）

単体（`checkMessage`・`checkStaged`）：

| 試験の名前 | 期待 |
|---|---|
| `フック: 3 章の例そのままは通る` | 外れ 0 |
| `フック: 範囲つきの件名は通る` | 外れ 0 |
| `フック: 説明が 40 字は通り 41 字は M2` | 40 字は 0、41 字は `M2` |
| `フック: 種類の無い件名は M1` | `M1` |
| `フック: 2 行目が空でないと M3` | `M3` |
| `フック: 確かめの行が無いと M4` | `M4` |
| `フック: 本文が確かめの行だけなら M4` | `M4` |
| `フック: --- が無いと M5` | `M5` |
| `フック: --- の後が Co-Authored-By だけなら M5` | `M5` |
| `フック: Merge・Revert・fixup! は検査しない` | 外れ 0 |
| `フック: 全角の確かめ：も通る` | 外れ 0 |
| `フック: CRLF・コメントの行・切り取り線から後を読み飛ばす` | 外れ 0 |
| `フック: 範囲の中に : があっても説明を正しく数える` | 40 字の説明で外れ 0 |
| `フック: 確かめの行が --- の後にあると M4` | `M4` |
| `フック: --- が 2 本なら最後の後を感想として見る` | 外れ 0 |
| `フック: 空のメッセージは M1` | `M1` |
| `フック: ignore に当たる足したファイルは P1` | `P1` |
| `フック: 追跡済みのファイルの更新は P1 で止めない` | 外れ 0 |
| `フック: .env と *.pem は P2` | `P2` |
| `フック: 96MB は P3 で止まり 60MB は警告` | 96MB は `P3`、60MB は警告だけ |

使い捨てのリポジトリ（`mkdtemp`。このリポジトリの `scripts/git-hooks/` を写して `install.mjs` を回す。子の PATH の頭に `dirname(process.execPath)` を足す）：

| 試験の名前 | 期待 |
|---|---|
| `フック: 入れた後、形でないコミットは止まり、形のコミットは通る` | 終了コード 1・0 |
| `フック: add -f した ignore のファイルのコミットは止まる` | 終了コード 1 |
| `フック: 名前の付け替えで ignore の場所や .env へ動かしても止まる` | 終了コード 1 |
| `フック: --only のコミットでもステージした物を見る` | ignore のファイルを `--only` で足すと終了コード 1 |
| `フック: git merge --no-edit のマージは通る` | 終了コード 0（`sync-lanes.mjs` と両立する） |
| `フック: 本体が無い worktree では検査を飛ばす` | 本体を消したリポジトリで、形でないコミットが終了コード 0 |
| `フック: 入れる脚本を 2 回回しても同じ・違う中身の同名があれば止まる` | 2 回目は変化なし、違う中身では `Result: FAIL` で中身を残す |
| `フック: 中継に実行の権限が付く` | Mac・Linux で `mode & 0o111` が 0 でない（Windows では飛ばす） |

96MB・60MB は単体の試験で大きさの数だけを渡す（ファイルは作らない）。`node` が見つからないときに止まることは、試験 `フック: node が見つからなければ止める` で確かめる（#38 で決めた）。入れた中継を写し、`for c in …` の行の候補だけを無い場所（`/no-such-dir/node`）に差し替えて、`sh`（Windows は Git for Windows の `sh`、Mac・Linux は `/bin/sh`）で回す。PATH は `sh` のフォルダーだけにし、`PROGRAMFILES` は空にする。終了コード 1 と「node が見つからない」の表示を見る。中継に試験用の環境変数は持たせない。`sh` が無ければ飛ばす。

---

## 7. 採らなかった案・未採用の改善

- **Node 版に入れて利用先へ配る**：ユーザーが「キット自身だけ」を選んだ（2026-10-28）。配るなら、`commit` スキルの書き方と指示文の雛形も同時に直すことになる。
- **直下の `commit` スキルを直す**：Node 版の写しで、`--update` で上書きされる。直下だけを直さない決まり（CLAUDE.md）にも反する。スキルの 1 行の形とのずれは、フックの表示で直す。
- **件名の 40 字を Issue の題に合わせて緩める**：kaedevn の決まりのまま 40 字にする。キットの件名は 79% が 40 字を超える（77 件中 61 件）ので、慣れるまでは止まることが増える。
- **無人の回の指示文・設定を直す**：雛形 `prompt.md` 19 行目は「`commit` スキルの規則」でコミットさせる。そのため、無人の回は最初のコミットで 1 度フックに止まり、表示を見て直す。設定は `--no-verify` を断っていない。どちらも Node 版の写しなので、直下だけは直さない（Node 版に入れるときに一緒に直す）。

## 8. 戻し方

`.git/hooks/commit-msg` と `.git/hooks/pre-commit`（中継の 2 本）を消せば、フックは止まる。追跡しているファイルは `git revert` で戻す。
