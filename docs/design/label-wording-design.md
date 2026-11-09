# 「札」の言い方をやめる設計（と、README・基本設計の小さい直し）

初めて読む人に伝わるよう、Node 版と共有の部品から独自の言い方「札」をなくす。あわせて、README の「中身」の表のリンクと、基本設計の状態の行のリポジトリ名を直す。

## 1. ゴール

Node 版を入れた人と、共有の説明書を読む人が、「札」という語に出会わない。GitHub の画面の言葉（ラベル）と同じ言葉で読める。

## 2. 言い換え

「札」は 2 つの意味で使われている。意味ごとに次のように言い換える。

| 意味 | 例 | 言い換え |
|---|---|---|
| GitHub のラベル | 「札を付ける」「札の付いた Issue」「実行中の札」「`claude-failed` の札」 | **ラベル**（「ラベルを付ける」「ラベルの付いた Issue」「実行中のラベル」「ラベル `claude-failed`」） |
| Issue そのもの | 「Issue は〜を指す札」「やることの札」 | **Issue を主語にした言い方**（「Issue は〜を指すだけ」）。一枚ものの比喩が要る所だけ「依頼票」 |
| npm の dist-tag | 「npm の `latest` の札」 | **タグ**（「npm の `latest` のタグ」） |

仕様 1 章の表の行の名前「札」は「対象」にする（どの Issue を拾うかを決める行で、すぐ下に節「1.1 ラベル」があるため。中身は変えない）。同じ表の「札の `claude-run`」は「ラベル `claude-run`」にする。「ラベル」が 1 つの文に重なって読みにくいときは、文を組み替えてよい。

共有の説明書が Unity 版のスクリプトのコメント（`pwsh Scripts\issue-run.ps1  # 札の付いた Issue を全部、順に`）を写している所も言い換える。コメントの言葉が実物と違うだけで、コマンドと動きは同じ。

## 3. 変えるもの

| 置き場 | 直すこと |
|---|---|
| `editions/node/files/`（ひな形・スキル・手順書・スクリプトの説明とメッセージ） | 2 章の言い換え。見出しを言い換えたら、その見出しを名前で引いている文も同じ名前に直す（`issue-goal-setting.md` の「## 7. 札を付ける前の確かめ」を引く `issue-driven-development.md`、チーム向けガイドの付録 C.3 の見出しを引く本文など）。§ 番号は変えない |
| `shared/spec/`・`shared/manuals/` | 2 章の言い換え |
| `docs/guides/working/examples/` | 2 章の言い換え（npm の dist-tag） |
| 直下の `README.md` | 「中身」の表の置き場のリンクを、ファイルではなく置き場そのもの（`shared/spec/`・`shared/manuals/`・`docs/design/`）に向ける |
| `docs/design/issue-driven-kit-basic-design.md` | 冒頭の表の「状態」の行のリンクを、今のリポジトリ `kaedeasset/issue-driven-kit` にする。D1 の行（決めたことの経緯）は記録なので変えない |

## 4. 変えないもの（理由）

| 置き場 | 理由 |
|---|---|
| `editions/unity/files/` | 元の Unity のリポジトリで動いた実物の写し。変えると試験 K-4 の許す差を足すことになり、言い方の違いはその理由にならない |
| `shared/fixtures/` | 「札」があるのは `issues/02.md`・`03.md` の「元の文書」の地の文だけで、Unity 版の文書の見出しを指している。Unity 版と揃える（読みの答えには響かない） |
| 直下の写し（`.claude/`・`.github/`・`scripts/`・`docs/guides/procedures/`・`docs/guides/decisions/`・`docs/guides/working/` の `github-repo.md`・`issue-driven-development.md`・`issue-run.md`・`worktree-lanes.md`） | 無人の回は直下の `.claude/` を書き換えない決まり（実行用の設定の deny と指示文）。版の元（`editions/node/files/`）を直した後に、会話で `node editions/node/install.mjs --target . --update` を回して入れ直す。`docs/guides/working/examples/` は写しではなくキット用なので 3 章で直す |
| `docs/inspecs/`・`docs/reports/` | 人の文書と、その時点の記録 |
| `docs/design/` のほかの設計書 | `readme-portfolio-design.md` は「札」を使わない語として挙げているだけ |

Unity 版に「札」が残るが、言い方の違いだけで、ふるまいの決まり（仕様）は変えないので、Unity 版のスクリプトを直す要は無い（CLAUDE.md の「仕様 → 両方の版 → 見本」の順に触れない）。

## 5. 合格の条件

1. `editions/node/`・`shared/spec/`・`shared/manuals/`・`shared/claude-md/`・`docs/guides/working/examples/` のどのファイルにも「札」が無い
2. 基本設計の「状態」の行（`| 状態 |` で始まる行。D1 の行は見ない）に `kaedeasset/issue-driven-kit` があり、`mkanakureon/issue-driven-kit` が無い
3. README に置き場のリンク `](shared/spec/)`・`](shared/manuals/)`・`](docs/design/)` がある
4. 4 章の変えないもの（Unity 版・見本・直下の写し・人の文書と記録・この設計書）が変わっていない
5. キットの試験が全部通る
