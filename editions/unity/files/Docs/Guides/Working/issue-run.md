# Issue を無人の Claude に進めさせる（issue-run）

GitHub Issue に札を付けておくと、`Scripts/issue-run.ps1` が1件ずつ新しい Claude Code（`claude -p`・auto mode）を起動し、**Issue の合格の条件を満たすまで**設計・実装・テストを回させる。自分が Unity で開いていない作業場所（worktree）を選んで起動し、終わったら確認する。

kaedevn（UE）の issue-run をそのまま持ってきた（2026-10-22）。kaedevn での検討と実測は kaedevn の `Docs/Reports/2026/10/14/03`・`04` と `Docs/Guides/Working/issue-run.md`。変えたのは次の 3 点だけ。

| 点 | kaedevn（UE） | ここ（Unity） |
|---|---|---|
| リポジトリ | `-Repo` の既定が固定 | 作業場所の `origin` から読む |
| ログ | `Saved/IssueRun/` | `Logs/IssueRun/`（追跡しない） |
| 「使っている間」の判定 | UE エディタ・ビルドが動いているか（PC で 1 本） | **Unity エディタがその作業場所のフォルダーを開いているか**（Unity はフォルダーごとにロックする。開いていると `unity-test.ps1` が `BLOCKED`） |

## 考え方

- **設計の正はリポジトリの文書。** Issue は「どの文書のどこを、どの合格の条件まで」の札。設計そのものを Issue に書かない（CLAUDE.md 原則6）。
- **合格の条件と確認コマンドが必須。** どちらかが無い Issue は起動しない。公式も「決まった判定が一番強い」「一番の失敗は早すぎる勝利宣言」としている。
- **判定に使うファイルは変えさせない。** 確認コマンドに出てくるリポジトリのファイル（テストのスクリプト・テストの `.cs` 等）は、開始時の中身から変わっていたら合格にしない。
- **決定待ちで止まらない。** 書いていない決定は Claude が「git で戻せて範囲が小さいほう」を選び、選んだことと戻し方を報告に書く（CLAUDE.md 原則1）。
- **コミットまで。** push と Issue を閉じるのは、確認したユーザーがやる。

## 止まらない仕組み

| 止まる原因 | 塞ぎ方（どこで） |
|---|---|
| Claude が区切りで返答を終える（`-p` はそこで終わる） | **Stop hook**（`.claude/issue-run/stop-hook.ps1`）。報告ファイルが「## 結果: 合格」・判定に使うファイルが開始時のまま、の2つがそろうまで返答を終えさせない（押し返しは合計30回）。終わったら、スクリプトが確認コマンドを **1 回だけ**回し、落ちていれば出力を付けて同じ会話を `--resume` で再開する（最大 `-MaxRounds` 回） |
| 確認の画面が出る | CLI の `--permission-prompts none`。確認は出ずに断られ、エラーが Claude に返るだけ |
| 質問する | `--disallowed-tools AskUserQuestion` と deny |
| 承認の要る操作（削除・プロセス停止・push・Issue への書き込み・直下の CLAUDE.md・`.claude/`・`Docs/InSpecs/`（人が書く文書の置き場）の書き換え・履歴の書き換え） | 設定の **deny** で必ず断る。指示文にも代わりのやり方を書いてある。CLAUDE.md・`.claude/`・`Docs/InSpecs/` の deny は `Edit(//{{REPO}}/CLAUDE.md)` の**絶対パス**で書き、スクリプトが `{{REPO}}` を作業場所の POSIX 形（`c/Users/<you>/Documents/UnityProject/KaedeScapeBuii`）に置き換える。裸の `CLAUDE.md`・`.claude/**` は gitignore の規則で**どの深さにも**効き、作る物の中の CLAUDE.md やスキルまで断る（kaedevn #15・#33・#34・#38・#40。10-16 に「直下だけに狭めた」つもりの書き方は効いておらず、10-17 にこの形にして実測で確かめた） |
| コマンドが10分で時間切れ | 設定の env `BASH_MAX_TIMEOUT_MS`（90分） |
| 実行中に Claude Code が更新される | 設定の env `DISABLE_AUTOUPDATER` |
| 認証切れ・利用上限 | 起動前の点検で止める・上限は待ってやり直す |
| 設定が読まれていない（`-p` は壊れた設定を黙って無視する） | 起動前の点検で、Stop hook が呼ばれたことと deny が効いたことを実際に確かめる |
| PC のスリープ | 動いている間だけスリープを止める |
| 窓の中をクリックして選択モードになり、出力で止まる | 動いている間だけ、その窓の簡易編集モードを切る |
| Unity エディタがその作業場所を開いている | 指示文に「バッチモードを回さない・テストの要る条件は未判定」と渡す。起動の前に、開いていない worktree を選ぶ |

設定は `.claude/issue-run/settings.json`（`--settings` で渡す。対話のセッションには効かない。権限は狭めるだけで広げない）。

それでも残るもの: 1回の上限（`-RoundMinutes` 90分）×回数（`-MaxRounds` 4）で合格しなければ `claude-failed` にして次の Issue へ進む。

**判定不能**: 作る側をどう直しても合格できない Issue（合格の条件どうし、または条件と守るファイルが両立しない）は、Claude が報告ファイルを判定不能の形（1 行目 `## 結果: 判定不能` と、中身のある節 `## 両立しない条件`。ぶつかる 2 つ・なぜ両立しないか・直し方の推し）にする。Stop hook は押し返さず（回数も数えない）、スクリプトは確認コマンドを回さず、次の回へ進まずに `NOT-PASS`・`claude-failed` にして人へ返す。コメントの「合格しなかった理由」は「報告が判定不能（合格の条件が両立しない）。人が Issue の条件か守るファイルを直す。」と節の中身。直して `claude-failed` を外すと再び対象になる。見分ける決まりは `Scripts/issue-run.ps1` の `Get-UndecidableReport` と `.claude/issue-run/stop-hook.ps1` の 2 か所にあり、同じにしておく（2026-11-13 にキットの UE 版から取り込んだ。それまでは 30 回押し返して 4 回まで回していた）。

## ラベル

| ラベル | 付ける人 | 意味 |
|---|---|---|
| `claude-run` | ユーザー | やってよい。ひな形から作ると最初から付く |
| `claude-working` | スクリプト | 実行中 |
| `claude-done` | スクリプト | 合格した。確認して閉じる |
| （前提待ち） | スクリプト | ラベルは付けない。「## 前提」の Issue が済むまで始めず、まとめに WAITING と出る |
| `claude-failed` | スクリプト | 合格の条件か確認コマンドが無い・回数切れ・判定不能（合格の条件が両立しない）・異常終了。理由はコメント。直して外すと再び対象になる |

ラベルは最初の実行で自動で作られる。

## 準備（最初の1回）

1. **PowerShell 7（`pwsh`）と GitHub CLI（`gh`）を入れる。** issue-run は pwsh 7 でしか動かない（Windows PowerShell 5.1 では起動しない）。
   ```powershell
   winget install --id Microsoft.PowerShell -e
   winget install --id GitHub.cli -e
   gh auth login
   ```
2. git と GitHub のリポジトリ（`origin`）を用意する（`Docs/Guides/Working/github-repo.md`）。
3. 無人の `claude -p` は対話のログインと別に認証が切れることがある（kaedevn 2026-10-14 に `OAuth session expired` で落ちた）。長期のトークンを作って環境変数に入れる:
   ```powershell
   claude setup-token
   [Environment]::SetEnvironmentVariable('CLAUDE_CODE_OAUTH_TOKEN', '<表示されたトークン>', 'User')
   ```
   新しいターミナルを開いてから使う。
4. 試し: `pwsh Scripts\issue-run.ps1 -DryRun` で、対象の Issue・合格の条件の行数・守るファイル・渡す指示文を見る。合格の条件（箇条書きと確認コマンド）に、無人の回の設定の deny が書き換えを断るパス（`$SettingsTemplate` の `Edit(//{{REPO}}/…)`・`Write(//{{REPO}}/…)`。いまは直下の `CLAUDE.md`・`.claude/**`・`Docs/InSpecs/**`）に当たる語があれば、Issue ごとに「deny のパス: <語>, …（無人の回では直せない。…）」の 1 行で知らせる（関数 `Get-DenyEditPaths`・`Get-DeniedMentions`）。知らせるだけで起動は止めない。直させる条件なら人が直す（`issue-goal-setting.md` 4.4）。

## 起動

```powershell
pwsh Scripts\issue-run.ps1                    # 札の付いた Issue を全部、順に
pwsh Scripts\issue-run.ps1 -Issue 12          # 1件だけ
pwsh Scripts\issue-run.ps1 -WorkDir 'C:\Users\<you>\Documents\UnityProject\KaedeScapeBuii-wt2'   # 作業場所を指定
```

| 引数 | 既定 | 意味 |
|---|---|---|
| `-Repo` | `origin` から | `owner/name` |
| `-RoundMinutes` | 90 | 1回の起動の上限。超えたら打ち切って、同じ会話を再開する |
| `-MaxRounds` | 4 | 再開の回数の上限。超えたら `claude-failed` |
| `-MaxIssues` | 20 | 1回に回す件数の上限 |
| `-LimitWaitMinutes` / `-MaxLimitWaits` | 30 / 16 | 利用上限に当たったら待ってやり直す（回数に数えない） |
| `-Model` | `claude-opus-5-5` | 無人の回に使うモデル |
| `-WorkDir` | （選ぶ） | 作業場所の worktree。指定すると選ぶ画面を出さない |

- **作業場所は起動するときに選ぶ。** 窓から起動すると worktree の一覧が出るので、番号で選ぶ（Enter なら起動したフォルダー）。**自分が Unity で開いている作業場所は選ばない**（テストが全部 `BLOCKED` になり、合格できない）。
- **worktree ごとに 1 本ずつ、同時に動かせる。** 同じ Issue を取り合ったら両方とも譲る。
- **worktree の Unity は `Library/` を別に持つ。** 新しい worktree の最初のテストは全部を取り込むので長い（数分〜）。先に 1 回 `pwsh -NoProfile -File Scripts/unity-test.ps1 -CompileOnly` を回しておくと、無人の回の時間を使わない。worktree を作るのはユーザー（CLAUDE.md）。

## 動いている間に見るもの

`claude -p` は終わるまで窓に何も出さない。進み具合は、逐次書かれる会話の記録 `~/.claude/projects/<プロジェクト>/<セッションID>.jsonl` の最新のものを見る（ツールの呼び出しが並ぶ）。セッション ID は `Logs/IssueRun/<日時>/` の各回の JSON にも出る。

## 終わった後に見るもの

読み方と、合格しなかったときの直し方は `Docs/Guides/Procedures/issue-goal-setting.md` の 8 章。

1. `Docs/Reports/YYYY/MM/DD/NN-issue-run.md` — 合格しなかった → 合格した、の順のまとめ
2. 各 Issue のコメント — 1 行目に結果・**かかった分と開始〜終了の時刻**（分の単位。例 `6 分（2026-10-22 09:36〜09:42）`。始まりは「実行中」の札を付けた直後、終わりは合否が決まった時。起動前の点検は含まない）・回数・コミットの数・作業場所・`HEAD`。続いて合格の条件ごとの判定表・やったこと・コミット・**選んだこと（Claude が自分で決めた点と戻し方）**・やらなかったこと・未採用の改善
3. 合格したものは確認して閉じ、push する
4. 中身のログは `Logs/IssueRun/<日時>/`

## Issue の書き方

**`Docs/Guides/Procedures/issue-goal-setting.md` が正。** ここには書かない。ひな形は `.github/ISSUE_TEMPLATE/claude-run.md`。会話の中で作るなら `github-issue` スキル。

## 部品

| ファイル | 役目 |
|---|---|
| `Scripts/issue-run.ps1` | 起動・再開・確認コマンド・ラベルとコメント・点検・まとめ |
| `Scripts/unity-test.ps1` | 確認コマンドが呼ぶテストの入口（`Result:` 行・0 件は FAIL・エディタが開いていれば BLOCKED） |
| `.claude/issue-run/prompt.md` | 渡す指示文（Claude の振る舞いを変えたいときはここ） |
| `.claude/issue-run/settings.json` | `--settings` で渡す設定（deny・Stop hook・env） |
| `.claude/issue-run/stop-hook.ps1` | 合格するまで返答を終えさせない |
