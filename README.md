# document-authoring

Claude Code に技術の文書（設計書・手順書・README・記録）を書かせるときのスキルと検査です。書き方の決まりをスキルで渡し、書いた後に `check.sh` で機械的に検査して、外れていれば行と直し方を出します。Claude Code はそれを読んで、自分で直してから出します。

フォルダーごと `.claude/skills/document-authoring/` に入れれば、それだけで動きます。ほかのキットは要りません。

## Summary (English)

A Claude Code skill plus a POSIX `sh` checker for Markdown technical documents (design docs, guides, READMEs, reports).
The skill tells the agent how to write; `check.sh` then verifies what can be verified mechanically (one H1, no skipped heading levels, a language on every code fence, required frontmatter, working relative links, no personal absolute paths like `C:\Users\<name>`, and a warning for vague words), printing the line and the fix.
Drop the folder into `.claude/skills/document-authoring/` (via `git subtree` or a plain copy); no dependencies, 32 cases tested by `sh test.sh`.

## こう止まる

```text
$ sh .claude/skills/document-authoring/check.sh docs/setup-guide.md
DOC-CHECK FAIL D3 docs/setup-guide.md:24 コードの枠に言語が無い（text・sh・ts・json・mermaid など）
DOC-CHECK FAIL D6 docs/setup-guide.md:31 自分の PC の絶対パスがある。repo の中は相対パス、外は <you> などに置き換える
DOC-CHECK FAIL D5 docs/setup-guide.md:40 リンク先が無い: ../scripts/setup.mjs
DOC-CHECK WARN D7 docs/setup-guide.md:52 あいまいな言葉がある。数・条件・コマンドに置き換える
直し方は rules.md の検査の表（D1〜D7）。直して check.sh を回し直す。
DOC-CHECK FAIL files=1 errors=3 warnings=1
```

直して回し直すと、最後の行が `DOC-CHECK PASS files=1 errors=0 warnings=0` になります。Claude Code の報告にはこの行が入るので、人は 1 行を見れば検査を通ったかが分かります。

## なぜ検査を付けるのか

文書の決まりを指示文やスキルに書くだけだと、長い作業の途中で抜けます。しかも抜けたことに、書いた本人（AI）も読む人も気づきにくいです。機械で見られることは機械で見て、人は中身だけを読めばよい形にします。

| 困りごと | 解き方 | 検査 |
|---|---|---|
| 題が無い・題が 2 つある | `#` の見出しをちょうど 1 つ | D1 |
| 見出しの段が飛んで、目次が崩れる | `##` の次に `####` を置かない | D2 |
| コードの枠に言語が無く、色も付かず何のコマンドか分からない | 全部の枠に言語（`sh`・`powershell`・`text` …） | D3 |
| いつ・何の文書か分からない | 置き場の文書に frontmatter（`date`・`type`・`project`） | D4 |
| ファイルを動かした後、リンクが切れたまま | 相対パスのリンク先があるかを見る | D5 |
| 自分の PC のパス（`C:\Users\<名前>\…`）が公開のリポジトリに残る | `<you>` などに置き換えさせる。コードの枠の中も見る | D6 |
| `適切に`・`必要に応じて` で、読んでも何をすればいいか分からない | 数・条件・コマンドに置き換えるよう警告する | D7（警告だけ） |

全部の決まりの正は → [rules.md](rules.md)

## Claude Code との組み合わせ

| 道具 | 役目 |
|---|---|
| スキル（[SKILL.md](SKILL.md)） | 「設計書書いて」「手順書を作って」で動く。種類を決める → ひな形を選ぶ → 書く → `check.sh` → 直す → 報告、の順を守らせる |
| 決まり（[rules.md](rules.md)） | 書き方の原則・形・frontmatter・種類・検査の表。スキルはここを指すだけ |
| ひな形（[templates/](templates/)） | `design.md`・`guide.md`・`report.md` |
| 検査（[check.sh](check.sh)） | 機械で見られる 7 つを見る。最後の行で合否が分かる |
| 設定（[document-authoring.conf.example](document-authoring.conf.example)） | その repo だけの違い（どこを見るか・frontmatter が要る所・種類を足す・あいまいな言葉を変える） |
| CLAUDE.md に 1 行 | 「文書は document-authoring スキルで書き、check.sh を通す」 |

## 設計で決めたこと

- **決まりは一か所に書く。** 正は `rules.md`。スキルや CLAUDE.md には写さず、指すだけ。
- **repo ごとの違いは本体から外す。** 置き場は取り込み先の CLAUDE.md、値は取り込み先の直下の `document-authoring.conf`。だから本体は、どの repo でも同じ中身のまま更新を受け取れる。
- **止めるのは機械で確かに言えることだけ。** 言葉の良し悪しは機械では言い切れないので、D7 は警告だけにする。止めすぎる検査は、外す理由を探させるだけになる。
- **依存を持たない。** POSIX の `sh`・`awk`・`sed`・`grep` だけ。Windows は Git for Windows の sh、Mac・Linux は標準の sh で動く。
- **試験は使い捨ての repo で回す。** `test.sh` は repo を作り、`.claude/skills/document-authoring/` に写して 32 の場合を確かめる。最後に、このキット自身の `rules.md`・`SKILL.md`・ひな形が検査を通ることも見る。

## 使ってみる

### Claude Code に入れてもらう（おすすめ）

1. このリポジトリを、**自分のリポジトリの外**に clone します。

   ```sh
   git clone https://github.com/kaedeasset/document-authoring.git D:\tools\document-authoring   # Mac なら ~/tools/document-authoring
   ```

2. **自分のリポジトリ**で Claude Code を開き（`cd <自分のリポジトリ>` → `claude`）、clone した場所の絶対パスを示して頼みます。

   ```text
   D:\tools\document-authoring\docs\install.md を読んで、そのとおりにこのリポジトリへ document-authoring を取り込んで。
   取り込みは install.md の手順 2 のとおり GitHub から git subtree add で入れて（clone したフォルダーは読むだけ）。
   1 の調べた結果・既にある文書の check.sh の結果・各コマンドの最後の行を報告して。push はしないで。
   ```

3. 報告に `DOC-TEST PASS` があれば入っています。あとは「設計書書いて」「手順書を作って」と頼むだけです。

clone した後に何をする？ 既にある文書が検査に落ちたら？ 入れた後の使い方は？ → [はじめての導入](docs/getting-started.md)

### 手で入れる

自分のリポジトリのルートで:

```sh
git subtree add --prefix=.claude/skills/document-authoring https://github.com/kaedeasset/document-authoring.git main --squash
sh .claude/skills/document-authoring/test.sh       # → DOC-TEST PASS cases=32 os=<OS>
sh .claude/skills/document-authoring/check.sh      # → 既にある docs/ と README.md を検査する
```

subtree を使わないなら、clone したフォルダーの中身（`.git` を除く）を `.claude/skills/document-authoring/` に写すだけでも動きます。その場合、更新は写し直しになります。

## コミットの決まりも欲しいとき

コミットメッセージの形（なぜ・確かめたこと・感想）と、載せてはいけない物（`.env`・生成物・大きいファイル）は、git のフックで検査する [commit-hooks](https://github.com/kaedeasset/commit-hooks) にあります。document-authoring とは別々に入れられます。両方入れると、Claude Code が書く文書もコミットも、機械の検査を通ってから出てくるようになります。

## 中身

| 置き場 | 中身 |
|---|---|
| [`SKILL.md`](SKILL.md) | スキル（手順だけ。決まりは `rules.md` を指す） |
| [`rules.md`](rules.md) | 書き方・形・frontmatter・種類・検査（D1〜D7）・値の正 |
| [`templates/`](templates/) | 設計書・手順書・記録のひな形 |
| [`check.sh`](check.sh) | 検査の本体 |
| [`test.sh`](test.sh) | 使い捨ての repo で 32 の場合を回す |
| [`document-authoring.conf.example`](document-authoring.conf.example) | repo の直下に置く設定のひな形 |
| [`docs/getting-started.md`](docs/getting-started.md) | はじめての導入（人が読む。clone から最初の文書・毎日の使い方・うまくいかないとき） |
| [`docs/install.md`](docs/install.md) | 導入ガイド（Claude Code が読んで進める） |

## 直したら送り返す

取り込んだ repo で `.claude/skills/document-authoring/` の下を直したら、その下**だけ**を変えたコミットを作り、`test.sh` を通してから送り返します。その repo だけの違いは `document-authoring.conf` と CLAUDE.md に書き、本体は直しません。

```sh
git subtree push --prefix=.claude/skills/document-authoring https://github.com/kaedeasset/document-authoring.git from-<repo名>-<YYYYMMDD>
```

更新を受け取るときは `git subtree pull --prefix=.claude/skills/document-authoring https://github.com/kaedeasset/document-authoring.git main --squash` のあと `test.sh` を回します。

## 作者・ライセンス

人が決まりと合格の条件を決め、結果を確かめて push します。スキル・検査・試験・文書は Claude Code が書きました。[MIT](LICENSE)。

---

> この文書は Claude Opus 5.5 が生成しました。内容の正確性は人間のレビューを経て確認してください。
