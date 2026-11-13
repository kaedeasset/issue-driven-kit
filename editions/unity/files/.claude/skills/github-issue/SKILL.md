---
description: Use when the user asks to create, write, list, check, or run GitHub Issues for unattended Claude runs. Triggers on "イッシュを作って", "Issueを作って", "Issueにして", "Issueを書いて", "イッシュを実行して", "Issueを回して", "issue-run", "無人で進めて", "claude-run を付けて", "/github-issue".
---

# GitHub Issue Skill（作る・確かめる・無人で回す）

Issue は「どの文書のどこを、どの合格の条件まで」の指示書。設計は Issue に書かずリポジトリの文書に書く（CLAUDE.md 原則6）。
**書き方の正は `Docs/Guides/Procedures/issue-goal-setting.md`、仕組みの正は `Docs/Guides/Working/issue-run.md`。** ここは手順だけ。ルールを書き足さない。

## 前提（毎回）

- `gh auth status` が通る・`git remote get-url origin` が GitHub を指す（`gh` が PATH に無いシェルでは `& 'C:\Program Files\GitHub CLI\gh.exe'`。下の `Scripts/issue-create.ps1`・`issue-result.ps1`・`issue-close.ps1` は自分で探す）。どちらかが無ければ止めて `Docs/Guides/Working/github-repo.md` を示す。
- **Issue を作る・ラベルを付ける・閉じるのは外向きの操作。** ユーザーが「作って」と言ったときだけ。下書きまでは自分で進めてよい。

## A. Issue を作る（「イッシュを作って」）

1. **大きさを決める**（issue-goal-setting.md 1 章）。大きいもの（新しい機能・仕組みの変更）は「設計書を書く Issue」と「実装する Issue」の 2 つに分け、2 つ目の `## 前提` に 1 つ目を書く。方針が決まっていないものは Issue にしない（先に `Docs/Guides/Decisions/` に決める）。
2. **元の文書を確かめる。** 指すパスと節が実在すること。無ければ先に設計書を書く（`design-cycle`）か、設計書を書く Issue にする。
3. **ゴールを 1 文**（誰が・何を見て・どう判断するか）。
4. **合格の条件**: 機械で測れるものだけ。箇条書きの 1 行ずつが確認コマンドのどこかで確かめられること。見た目・面白さは「やらないこと」へ。
5. **確認コマンド**（```pwsh）: ふつうは `pwsh -NoProfile -File Scripts/unity-test.ps1 -Filter '<名前空間.クラス>'` と、その Issue だけの確かめ。元のプロジェクトの書き方（issue-goal-setting.md 4.2・4.4）に合わせる:
   - 先頭に `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`
   - 変えさせないファイルは `# 守る: <パス>`、**直させるファイルは変数を通して指す**（そのまま書くと自動で守られて直せない）。作業で直す所のあるファイルは守らない
   - フォルダごと変えさせないなら最後に `git status --porcelain -- <フォルダ>` を見る
   - 落ちるときは `Write-Host` で理由を出し、最後は `exit 0`
6. **確認コマンドを自分で 1 回回して、いま落ちる（まだできていない）ことと、落ちる理由が「まだ作っていないから」であることを見る。** 最初から通るならゴールが書けていない。確認コマンド自身の誤りで落ちるなら直す（元のプロジェクトでは、これで 4 回を使い切った Issue が 2 件あった）。エディタが開いていて `BLOCKED` なら、その旨を下書きに書いてユーザーに渡す。
7. 本文を `Logs/IssueDrafts/<題>.md`、題を `<題>.title.txt` に書き、ユーザーに見せる（ひな形 `.github/ISSUE_TEMPLATE/claude-run.md` の欄どおり）。作る前の確かめだけを先に回す:
   ```powershell
   pwsh -NoProfile -File Scripts/issue-create.ps1 -Draft Logs/IssueDrafts/<題> -Change <直させるファイル>,… -DryRun   # 作らない
   ```
   本文の確認コマンドの構文・`<題>.check.ps1` があれば本文と同じか・パスのまま書いた管理下のファイルが `# 守る:` にあるか・直させるファイルが守るファイルに入っていないかを見る（守るファイルは `issue-run.ps1` と同じ関数 `Scripts/issue-protect.ps1` で出す）。
8. 「作って」と言われていれば、同じコマンドを `-DryRun` なしで回す:
   ```powershell
   pwsh -NoProfile -File Scripts/issue-create.ps1 -Draft Logs/IssueDrafts/<題> -Change <直させるファイル>,…
   ```
   7 の確かめを通ってから Issue を作って `claude-run` を付け、作った直後は一覧に出ない（数十秒）ので、`issue-run.ps1 -Issue <番号> -DryRun` が対象に出すまで待つ。最後の行 `Result: PASS  #<番号> <URL>（条件 <n> 行・守る <n>）` を URL と一緒に報告する。ラベル `claude-run` がまだ無いと失敗する。そのときは `gh label create claude-run --color 1d76db --description "Claude に無人で進めさせてよい"` を先に（issue-run.ps1 も最初の実行で作る）。
9. 守るファイルは、ファイルのパスを丸ごと書くと変数に入れても守られる。直させるファイルは、フォルダーまでを変数に入れて指す（比べるだけの行でも同じ）。`Result: FAIL` で守るファイルに入っていると言われたら、下書きを直して 7 からやり直す。

## B. Issue を見る（「イッシュを見て」「一覧」）

```powershell
gh issue list --label claude-run --state open
gh issue view <番号> --comments
```

`claude-done` は合格して確認待ち、`claude-failed` は理由がコメントにある（直し方は issue-goal-setting.md 8 章）。

## C. 無人で回す（「イッシュを実行して」）

`Scripts/issue-run.ps1` は Issue ごとに新しい `claude -p` を起動し、1 件 30 分〜数時間かかる。**この会話の中では回さない。**

1. `pwsh Scripts\issue-run.ps1 -DryRun` を回し、対象・条件・守るファイルを報告する。
2. 本番はユーザーが別のターミナルで起動するよう、コマンドを渡す:
   ```powershell
   pwsh Scripts\issue-run.ps1                 # ラベルの付いた Issue を全部、順に
   pwsh Scripts\issue-run.ps1 -Issue 12       # 1 件だけ
   ```
   作業場所は、ユーザーが Unity で開いていない worktree を選ぶ（開いているとテストが BLOCKED になる）。
3. 「終わった」と言われたら、まず回った跡を見る（まだ回っていないことがある）:
   ```powershell
   pwsh -NoProfile -File Scripts/issue-result.ps1 -Issue <番号>    # PASS 0・FAIL 1・NOTRUN と RUNNING 2
   ```
   Issue の状態とラベル・最後の結果のコメント（結果の表・選んだこと・未採用の改善）・その回のコミットが手元にあるか・まだコミットしていないまとめ（`Docs/Reports/YYYY/MM/DD/NN-issue-run.md`）を出す。それを読んで結果を報告する（閉じる・push はユーザー）。
4. 合格しなかったものは、理由ごとの直し方（issue-goal-setting.md 8 章）を示す。ユーザーが「閉じて」と言ったら:
   ```powershell
   pwsh -NoProfile -File Scripts/issue-close.ps1 -Issue 1,2 -Note '<人が確かめたこと>'
   ```
   決まった形のコメント（「合格（claude-done）を確認して閉じる（YYYY-MM-DD ユーザー指示）」）を付けて閉じる。`claude-done` の無い物は閉じない（`-Force` で閉じる）。「出し直して」なら「## 対応（日時）」のコメントを付けて `claude-failed` を外す。

## やらないこと

- Issue に設計を書く（文書へのリンクにする）。
- 確認コマンドの無い Issue に `claude-run` を付ける（起動しない・`claude-failed` になる）。
- 見つけた改善を自動で Issue にする（原則2。報告に書き、ユーザーが選ぶ）。
