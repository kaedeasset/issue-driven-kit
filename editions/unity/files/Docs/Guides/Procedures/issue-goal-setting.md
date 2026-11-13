# ゴールを決めて Issue に書く手順（無人の Claude に渡す前に）

ユーザーが書くもの・書き方・Issue への載せ方の正。無人で回す仕組みは `Docs/Guides/Working/issue-run.md`、回し方の中身（ゴール → 合格の条件 → 設計 → 実装 → テスト → 振り分け → 判定）は `.claude/skills/design-cycle/SKILL.md`。会話の中で Claude に作らせるなら `github-issue` スキル。

kaedevn（UE）の同じ文書（2026-10-14）を Unity 向けに直した。違いは確認コマンドの入口（`Scripts/unity-test.ps1`）と 4.3 だけ。

## 0. 流れ

```
① 決める（ユーザー）
   ↓
② 文書を書く … 大きいものは設計書。小さいものは要らない
   ↓
③ Issue を書く … 札（元の文書・合格の条件・確認コマンド）
   ↓
④ 試す … pwsh Scripts\issue-run.ps1 -DryRun
   ↓
⑤ 起動 … pwsh Scripts\issue-run.ps1。Unity で開いていない worktree を選ぶ
   ↓
⑥ 確認（終わった後） … まとめ → Issue のコメント → 閉じる／直して出し直す
```

**一番大事なのは③の「確認コマンド」。** 無人の Claude は、確認コマンドが exit 0 になるまで終われない。逆に言えば、確認コマンドが通れば終わる。確認コマンドがゴールそのものになる、と思って書く。

## 1. どの文書を書くか

| やりたいことの大きさ | ユーザーが書くもの | Claude に任せられるもの |
|---|---|---|
| **小さい**（バグを1つ直す・値を数件足す・文言を直す） | Issue だけ。「元の文書」には今ある文書の該当の節を書く | 実装・テスト |
| **中くらい**（既存の設計書の1節を実装する） | Issue だけ。設計書のその節に合格の条件が書いてあれば、Issue はそれを指す | 実装・テスト |
| **大きい**（新しい機能・新しい画面・仕組みの変更） | **2回に分ける。** 1回目は「設計書を書く」Issue、終わったら設計書を読んで直す、2回目に「実装する」Issue | 1回目: 設計書の下書き／2回目: 実装・テスト |
| **方針が決まっていない**（やるかどうか・どちらの方式か） | Issue にしない。先に決める（決めたら `Docs/Guides/Decisions/` に書く） | — |

設計が正しければ、実装のやり直しが減る（design-cycle）。設計の良し悪しはユーザーが読まないと決まらないので、大きいものは無人の回の間にユーザーの確認を1回はさむ。

## 2. ゴールを1文で書く

「誰が・何を見て・どう判断するか」まで書く（design-cycle §1）。

| 悪い | 良い |
|---|---|
| ジャンプを作る | プレイヤーがジャンプを押すと、地面にいるときだけ跳び、空中では跳ばない |
| テストを強くする | `PlayerMotorTests` が、空中でジャンプを押しても上向きの速度が付かないことも確かめる |
| 操作感を良くする | （無人には向かない。ユーザーが触って決める。→ 3.2） |

## 3. 合格の条件を書く

### 3.1 公式の3要素

1. **測れる終わりの状態が1つ** — テストの結果・終了コード・件数・ファイルがあるか
2. **確かめ方** — どのコマンドで、何が出たら合格か
3. **途中で変えてはいけないもの** — テスト・既存のデータ・ほかの機能

### 3.2 Issue に入れてよい条件・入れない条件

| 種類 | 例 | 無人の Issue では |
|---|---|---|
| 機械（コマンドで合否が出る） | テストが通る・コンパイルが通る・ファイルに節がそろっている | **合格の条件に入れ、確認コマンドで全部確かめる** |
| AI の判定（比べる相手と並べて判定） | 手本の画面と並べて見た目が以上か | 合格の条件に入れない。「やらないこと」に「判定はしない。撮影と記録まで」と書く |
| ユーザーの判定（実感） | 触って気持ちいいか・読みやすいか | 合格の条件に入れない。終わった後にユーザーがやる |

機械で測れない条件を入れると、Claude は自分で「合格」と書くしかなくなる。それが公式の言う一番の失敗（早すぎる勝利宣言）。

AI の判定をさせたいときは、合否の外に置いて書く（kaedevn #101 の形）: 「AI の判定が要る条件（設計書 §0.2 の F2）は、報告の前に判定役（作った本人でない別のエージェント）にさせて、結果を報告に書く（合否には入れない）」。

### 3.3 箇条書きと確認コマンドを対応させる

箇条書きの1行ずつが、確認コマンドのどこかで確かめられるようにする。確かめられない行は書かない（書くなら「やらないこと」へ）。

## 4. 確認コマンドを書く

Issue の「## 合格の条件」の中に ```` ```pwsh ```` で書く。**リポジトリの直下で実行され、exit 0 なら合格。**

### 4.1 既存の入口

| 対象 | コマンド | 合格 |
|---|---|---|
| EditMode のテスト（ふつうはこれ） | `pwsh -NoProfile -File Scripts/unity-test.ps1 -Filter '<名前空間.クラス>'` | exit 0（最後の行 `Result: PASS`） |
| 全部の EditMode | `pwsh -NoProfile -File Scripts/unity-test.ps1` | 同上 |
| PlayMode も | `pwsh -NoProfile -File Scripts/unity-test.ps1 -Platform All` | 同上 |
| コンパイルだけ | `pwsh -NoProfile -File Scripts/unity-test.ps1 -CompileOnly` | 同上 |

使い方の詳細は `Docs/Guides/Procedures/unity-test-procedure.md`。`unity-test.ps1` は、テストが 0 件・結果の XML が無い（コンパイルエラー）・エディタが開いている（BLOCKED・exit 3）を全部「合格でない」にする。

### 4.2 その Issue だけの確かめを書く

既存のテストに無いことは、確認コマンドの中に直接書く。**Issue の中に書いたものは Claude が書き換えられない**ので、一番固い。

```pwsh
# 例: 文書に必要な節がそろっている
$t = Get-Content 'Docs/Guides/Working/player-jump-design.md' -Raw
foreach ($h in '## 0. ゴールと合格の条件', '確認コマンド') {
    if ($t -notmatch [regex]::Escape($h)) { Write-Host "無い: $h"; exit 1 }
}

# 例: 特定のテストが結果の中にあって通った（名前で 0 件にならないことも見る）
pwsh -NoProfile -File Scripts/unity-test.ps1 -Filter 'KaedeScapeBuii.Tests.PlayerMotorTests'
if ($LASTEXITCODE) { exit 1 }

exit 0
```

- 落ちたときは `Write-Host` で理由を出す。その出力の末尾が Claude に渡り、次に何を直すかの手がかりになる。
- 最後は `exit 0`。
- 例の設計書・テストの名前は架空。実在のものに直して書く。
- 先頭に `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` を置く（日本語の出力を読み違えない。kaedevn の Issue はほぼ全部これで始まる）。
- 試しに作るもの（一時の作品・出力）は `Join-Path $env:TEMP "kaede-<名前>-$(Get-Random)"` か `Logs/` の下に作る。git の追跡物を作らない。
- **「直す前と同じ結果」を確かめるとき**は、Issue を書いた時点のコミットを `git show <sha>:<パス>` で取り出して同じ入力で回し、出力を比べる（kaedevn #101）。
- **大文字小文字だけの改名**（`Playermotor` → `PlayerMotor`）は Windows の `Test-Path` が区別しない。`git ls-files` の結果を `-ccontains`／`-cmatch` で比べる（kaedevn 10-14 の記事 §7-5）。
- **確認コマンドそのものの誤りで、作る側をどう直しても通らない形になっていないか**を見る。kaedevn #10 は判定の 1 行が出力先の絶対パスに必ず当たり、#38 は試しの作品が空で必ず誤りを出していた。どちらも 4 回を使い切り、Issue の本文を直して出し直した。

### 4.3 Unity でのテストの重さ

- `unity-test.ps1` は毎回 Unity を起動する（取り込み済みなら 1〜2 分、`Library/` が無い worktree の初回は数分〜）。確認コマンドの中で何度も呼ばない。`-Platform All` はまとめて 1 回で回る。
- **PlayMode は要るときだけ。** 設計で、ロジックをふつうの C# に出しておけば EditMode で確かめられる（design-cycle §2）。
- **コメントだけの変更**（頭書き・説明）は Unity を回さない。「変えたのはコメントの行だけ」を `git diff` で確かめる。
- ゲームの書き出し（Player のビルド）を確認コマンドに入れるのは、書き出しそのものがゴールの Issue だけ。

### 4.4 変えさせたくないファイルを守る

**確認コマンドに出てくる、git が管理しているファイルは、自動で守られる。** 開始時の中身から変わっていたら（消しても）合格にならない。

確認コマンドで使わないが守りたいファイルは、コメントの行にパスを書けば守られる:

```pwsh
# 守る: Assets/Tests/EditMode/PlayerMotorTests.cs
# 守る: Docs/Guides/Working/player-jump-design.md
pwsh -NoProfile -File Scripts/unity-test.ps1
```

- 守れるのは**ファイル単位**。フォルダを書いても守られない。フォルダごと変えさせたくないときは、確認コマンドの最後で `if (git status --porcelain -- <フォルダ>) { Write-Host '<フォルダ> を変えている'; exit 1 }` と見る（kaedevn #101）。
- **直させるファイルは、確認コマンドの中で変数を通して指す**（`$tests = 'Assets/Tests/EditMode'` → `"$tests/PlayerMotorTests.cs"`）。パスをそのまま書くと自動で守られ、直せなくなる（kaedevn #26 の書き方。「直すべきファイルは変数で指す」とコメントを残す）。
- **変数に入れるのはフォルダーまで**にする。`$man = 'Docs/…/manual.md'` のようにファイルのパスを丸ごと代入しても、そのパスは確認コマンドにそのまま書いてあるので守られる（説明書を直す Issue が 4 回とも合格できなかった）。
- **作業で直す必要のあるファイルを「守る」に入れない。** kaedevn #7 は、旧い名前を消す作業なのに、その名前が残る設計書を守っていて、4 回とも合格できなかった。
- **テストの `.cs` を守る**のが Unity での要。守らないと、Claude がテストの期待値を実装に合わせて直せてしまう。テストそのものを書かせる Issue では、守らずに「既存のテストを消さない・弱めない」を条件に書き、件数を確認コマンドで見る。
- どのファイルが守られるかは `-DryRun` の「守るファイル」に出る。作ったら `-DryRun` の「守るファイル」の行を**切らずに全部読み**、直させるファイルが 1 つも入っていないことを確かめる。
- **deny のパス（直下の `CLAUDE.md`・`.claude/`・`Docs/InSpecs/`）は合格の条件に入れない。直す必要があれば人が直す。** 無人の回の設定（`.claude/issue-run/settings.json`）の deny が書き換えを断るので、何回回しても満たせない（公開のキットで、直下の `CLAUDE.md` の 1 行を消す条件が 4 回とも満たせず、人が直して合格した）。変えないことを確かめるために書くのはよい。`-DryRun` は、合格の条件（箇条書きと確認コマンド）に deny のパスに当たる語があれば「deny のパス: …」の行で知らせる（頭にフォルダーが付いた `Templates/NewWork/CLAUDE.md` などは当たらない）。

## 5. Issue を書く

GitHub の「New issue」でひな形「Claude に無人で進めさせる」を選ぶ。ひな形が出ないうちは手で書き、ラベル `claude-run` を付ける。

| 欄 | 書くこと | 必須 |
|---|---|---|
| タイトル | 何をするかを1行 | ○ |
| やること | ゴールを1文（2 章）。**90 分 × 4 回で終わる大きさ** | ○ |
| 元の文書 | 設計書・計画書のパスと節 | ○ |
| 合格の条件 | 箇条書き（3 章）＋ ```` ```pwsh ```` の確認コマンド（4 章） | ○（どちらかが無いと起動しない） |
| 前提 | この Issue の前に済んでいるべき Issue（`- #1` のように）。同じ実行の中で前の段が合格すれば、続けて次の段が始まる | 任意 |
| 先に決めておくこと | Claude が迷いそうな点。書かなかった点は Claude が「git で戻せて範囲が小さいほう」を選ぶ | 任意 |
| やらないこと | 範囲の外。見た目の判定・PlayMode・パッケージの追加など | 任意 |

### 5.1 大きさの目安

- 1つの Issue に、確認コマンドで確かめる「終わりの状態」は1つか2つ。
- 「設計書の §4 を全部」ではなく「§4.2 だけ」。
- kaedevn の実測: 確認が重い段は約1時間、軽い段は約30分。7〜8時間なら 6〜8件、数時間なら 2〜3件を積む。前提でつないでおけば、途中で1件つまずいても後ろは前提待ちで止まるだけ。

### 5.2 段を順につなぐ

大きな作業を段に分けたら、2 段目から先の Issue に「## 前提」で前の段を書き、全部に `claude-run` を付けておく。番号の小さい順に回るので、1 段目が合格すると同じ実行の中で 2 段目が始まる。

- 後の段の確認コマンドが「前の段と同じ結果か」を比べるなら、前の段に比べるための記録を機械で読める形（JSON）で残させる。
- 前の段の Issue の最後に「## 次の段」を書いておくと、後で読むとき流れが分かる（スクリプトは読まない。kaedevn では 22 件が使った）。
- 設計書を書く Issue の合格の条件に「実装を分けた束（K1・K2…）の一覧と、束ごとの確認コマンドの案」を入れておくと、2 回目以降の Issue がその束を 1 つずつ指せる（kaedevn #20 → #25〜#27「#20 の束 K2」）。テストの名前の表では、束は印の文（「（K2）」など）に混ぜず**「束」の列**に書かせる（見本は 6.2。列の値で絞れば、印の書き方の揺れを確認コマンドで吸わずに済む。公開のキットで `（K2）` と `（束 K2）` が揺れた）。
- 人が手でやるもの（本番への配備・別の PC での確認など）も Issue にしてよいが、`claude-run` を付けない（kaedevn #17・#44）。

## 6. 例

### 6.1 小さい — バグを直す

````
タイトル: 空中でもジャンプできてしまう

## やること
プレイヤーが空中にいるとき、ジャンプを押しても跳ばないようにする。

## 元の文書
Docs/Guides/Working/player-movement-design.md の §3 ジャンプ

## 合格の条件
- 空中でジャンプを押しても、上向きの速度が付かない（PlayerMotorTests.JumpIgnoredInAir）
- 既存の EditMode のテストが全部通る

```pwsh
# 守る: Assets/Tests/EditMode/PlayerMotorTests.cs
pwsh -NoProfile -File Scripts/unity-test.ps1
if ($LASTEXITCODE) { exit 1 }
exit 0
```

## やらないこと
- PlayMode のテスト・操作感の調整
````

テスト `JumpIgnoredInAir` はユーザーが先に書いて（または Claude に別の Issue で書かせて）コミットしておく。守るファイルに入っているので、Claude は実装の側を直すしかない。

### 6.2 大きい・1回目 — 設計書を書かせる

````
タイトル: プレイヤーの移動の設計書を書く

## やること
プレイヤーの移動（歩く・走る・跳ぶ）の設計書を、design-cycle の形で書く。

## 元の文書
.claude/skills/design-cycle/SKILL.md（設計書の形）
Assets/InputSystem_Actions.inputactions（Player の Move・Jump・Sprint）

## 合格の条件
- 設計書が Docs/Guides/Working/player-movement-design.md にある
- §0 にゴール・合格の条件の表・実装の Issue に使う確認コマンドの案がある
- テストの名前（`KaedeScapeBuii.Tests.<EditMode|PlayMode>.<クラス>.<メソッド>`）の一覧の表があり、見出しの行が `| 束 | テストの名前 | 何を確かめるか |` で始まる（束は「束」の列に書き、名前の文に混ぜない。名前はバッククォートで囲む）

```pwsh
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dir = 'Docs/Guides/Working'   # 書かせる文書はフォルダーを変数に入れて組み立てる
$d = Join-Path $dir 'player-movement-design.md'
if (-not (Test-Path $d)) { Write-Host '設計書が無い'; exit 1 }
$t = Get-Content $d -Raw -Encoding utf8
foreach ($h in '## 0.', 'ゴール', '合格の条件', '確認コマンド', 'KaedeScapeBuii.Tests.') {
    if ($t -notmatch [regex]::Escape($h)) { Write-Host "無い: $h"; exit 1 }
}
if ($t -notmatch '(?m)^\| *束 *\| *テストの名前 *\| *何を確かめるか *\|') { Write-Host 'テストの名前の表に「束」の列が無い'; exit 1 }
exit 0
```

## やらないこと
- 実装（2回目の Issue でやる）
````

設計書のテストの名前の表は、この形にさせる（束は「束」の列に 1 つだけ書く。名前はバッククォートで囲む）。下は表の頭の数行。

| 束 | テストの名前 | 何を確かめるか |
|---|---|---|
| K1 | `KaedeScapeBuii.Tests.EditMode.PlayerMotorTests.WalkSpeedMatchesTable` | 歩く速さ |
| K1 | `KaedeScapeBuii.Tests.EditMode.PlayerMotorTests.SprintIsFasterThanWalk` | 走る速さ |
| K2 | `KaedeScapeBuii.Tests.EditMode.PlayerMotorTests.JumpIgnoredInAir` | 空中で跳ばない |

### 6.3 大きい・2回目 — 実装する

````
タイトル: プレイヤーの移動を実装する（設計書の束 K2）

## 前提
- #1

## やること
設計書の束 K2 を設計書どおりに実装し、束 K2 の合格の条件のうち機械で測れるものを全部満たす。

## 元の文書
Docs/Guides/Working/player-movement-design.md の束 K2

## 合格の条件
- 設計書のテストの名前の表で「束」の列が K2 の行のテスト（12 本）が全部ある・通る
- 既存のテストが全部通る

```pwsh
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# 守る: Docs/Guides/Working/player-movement-design.md
# テストの名前は設計書の表から読む（Issue に写さない。表が正）。「束」の列の値で行を絞る
$t = Get-Content 'Docs/Guides/Working/player-movement-design.md' -Raw -Encoding utf8
$rows = [regex]::Matches($t, '(?m)^\| *([^|`]+?) *\| *`(KaedeScapeBuii\.Tests\.(?:EditMode|PlayMode)\.\w+\.\w+)` *\|')
$names = @($rows | Where-Object { $_.Groups[1].Value -eq 'K2' } | ForEach-Object { $_.Groups[2].Value })
# 本数は Issue を書く人が設計書の表を数えて書く（12 は束 K2 の行の数。> 0 にしない。読めなかった名前は下で確かめられない）
if ($names.Count -ne 12) { Write-Host "表から読めた束 K2 の名前が $($names.Count) 本（12 本のはず）"; exit 1 }
pwsh -NoProfile -File Scripts/unity-test.ps1
if ($LASTEXITCODE) { Write-Host 'テストが通らない'; exit 1 }
# 名前ごとに結果の XML で Passed を見る（名前が違って 0 本になっても PASS にしない）
$x = Get-ChildItem Logs/UnityTest -Directory | Sort-Object Name | Select-Object -Last 1
$xml = [xml](Get-Content (Join-Path $x.FullName 'EditMode-results.xml') -Raw -Encoding utf8)
foreach ($n in $names) {
    $hit = @($xml.SelectNodes("//test-case[@fullname='$n' or starts-with(@fullname,'$n(')]"))
    if (-not $hit.Count) { Write-Host "テストが無い: $n"; exit 1 }
    if (@($hit | Where-Object { $_.result -ne 'Passed' }).Count) { Write-Host "通っていない: $n"; exit 1 }
}
exit 0
```

## やらないこと
- 操作感の判定（後でユーザーが触って決める）
````

例の束 K2 は EditMode のテストだけ。PlayMode のテストも入る束は `-Platform All` で回し、名前の 3 つ目（`EditMode`・`PlayMode`）で `<…>-results.xml` を選ぶ（#17 の確認コマンドと同じ読み方）。

設計書を「守る」に入れると、Claude は実装の都合で設計書を書き換えられない。設計を変えたくなったら合格にならず、報告の「やらなかったこと」に理由が残る（設計の直しはユーザーが決める）。

## 7. 札を付ける前の確かめ

- [ ] やることが1文で、90 分 × 4 回で終わる大きさ
- [ ] 元の文書のパスが実在する
- [ ] 合格の条件の箇条書きが、全部「機械で測れる」
- [ ] 箇条書きの1行ずつが、確認コマンドのどこかで確かめられる
- [ ] 確認コマンドを**自分で一度実行して**、今は落ちる（まだできていない）ことを見た。最初から通るなら、ゴールが書けていない
- [ ] 落ちたときの `Write-Host` の理由が「まだ作っていないから」になっている（確認コマンド自身の誤りで落ちていない）
- [ ] 変えさせたくないファイル（特にテストの `.cs`）が「守る」に入っている
- [ ] 見た目・操作感など本人の判断が要るものは「やらないこと」に入っている
- [ ] `pwsh Scripts\issue-run.ps1 -DryRun` で、条件の行数と守るファイルが期待どおり
- [ ] `-DryRun` に「deny のパス」の行が出たら、その語が直させる条件でない（変えないことを確かめるだけ）ことを確かめた（4.4）

## 8. 終わった後の確認

1. `Docs/Reports/YYYY/MM/DD/NN-issue-run.md`（まとめ。合格しなかったものが先）
2. 合格した Issue のコメント: 判定表・**選んだこと（Claude が自分で決めた点と戻し方）**・やらなかったこと
   - 選んだことが違っていたら、コメントの戻し方で戻し、「先に決めておくこと」に正しい決定を書いて、ラベル `claude-done` を外す（次の回でやり直す）
   - 良ければ閉じて push する
3. 合格しなかった Issue（`claude-failed`）: コメントの理由を見る
   - 合格の条件か確認コマンドが無い → 書き足す
   - 回数切れ → 大きすぎる。分ける
   - 守るファイルを変えようとした → 設計か確認コマンドが実情に合っていない。直す
   - 「報告が判定不能（合格の条件が両立しない）」 → 作る側をどう直しても合格できないと Claude が実行結果で示した。コメントの「両立しない条件」（ぶつかる 2 つ・根拠・直し方の推し）を読み、Issue の条件か守るファイルを直す
   - テストが全部 `BLOCKED` → その作業場所を Unity で開いていた。閉じてやり直す
   - 「最後の返答」が `You've hit your session limit` → 中身の不合格ではない。条件を変えずに `claude-failed` を外して出し直す
   - 権限で断られて 1 か所だけ書けなかった → 報告に用意された中身を手で入れてコミットし、出し直すか手で閉じる
   - 直したらラベル `claude-failed` を外す。**何を直したか・条件を変えたかをコメントに残す**（kaedevn の形: 「## 対応（日時・ユーザーのセッションから）」に、直したこと・「本文の合格の条件は変えない」・次にどうするか）
4. 閉じるときは「合格（claude-done）を確認して閉じる（YYYY-MM-DD ユーザー指示）」とコメントしてから閉じる
5. 「未採用の改善」に良いものがあれば、新しい Issue にする（自動では仕事にならない）

## 9. kaedevn の 109 件から分かったこと（2026-10-22 に読んだ）

| 何が起きたか | 件数・例 | ここでの手当て |
|---|---|---|
| 1 回で合格 | ほとんど。8〜30 分が多い | — |
| 利用上限で 2〜4 回目を 0 分で使い切った | #21・#31・#32・#35・#39 | `issue-run.ps1` が上限を JSON で見分けて待つ（直した版を持ってきた）。起きたら 8 章の 3 |
| deny が広すぎて、作る物の中の CLAUDE.md・スキルが書けなかった | #15・#33・#34・#38・#40 | deny はリポジトリ直下の `CLAUDE.md` と `.claude/` だけ（`.claude/issue-run/settings.json`）。作る物に同じ名前のファイルがあるなら Issue に書いておく |
| 守るファイルの中に、直す必要のある記述があった | #7 | 4.4「作業で直す必要のあるファイルを守らない」 |
| 確認コマンドの誤りで、作る側では通らない | #10・#38 | 4.2 の最後・7 章「落ちる理由が正しいこと」 |
| 無人の認証が切れて始まらなかった | #9 | `issue-run.md` の準備 3（`claude setup-token`） |
| 合格の条件どうしが両立せず、4 回を使い切った | キットの利用先（rpg-online-cloudflare #43。109 件の外） | 報告の「判定不能」（`issue-run.md`）。2026-11-13 にキットから取り込んだ |
