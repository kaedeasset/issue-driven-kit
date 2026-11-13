#Requires -Version 7
# issue-run.ps1 — GitHub Issue を1件ずつ、無人の Claude Code（claude -p）に合格まで進めさせる。
#
# 使い方と Issue の書き方の正: Docs/Guides/Working/issue-run.md
# 検討の記録: Docs/Reports/2026/10/14/03-overnight-issue-run-study.md
#
#   pwsh Scripts\issue-run.ps1                     # ラベル claude-run の付いた Issue を全部、順に（時間帯は関係ない。UE が動いていればその回はビルドを禁じて渡す）
#   pwsh Scripts\issue-run.ps1 -Issue 12            # 1件だけ
#   pwsh Scripts\issue-run.ps1 -DryRun              # 対象・合格の条件・渡す指示文を見るだけ（Claude は起動しない）
#   pwsh Scripts\issue-run.ps1 -WorkDir 'D:\Unreal Projects\kaedevn-adv'   # 作業場所を指定（選ぶ画面を出さない）
#
# 作業場所（worktree）: 窓から起動すると worktree の一覧を出して選ばせる（Enter で起動したフォルダー）。
# 入力が窓でなければ起動したフォルダー。スクリプトの置き場では決めない。worktree ごとに 1 本ずつ、同時に動かせる。
#
# 止まらないための分担:
#   - 続けるかどうかはこのスクリプトが決める。報告ファイルが「## 結果: 合格」になるまで、同じ会話を
#     --resume で「続けて」と再開する（最大 -MaxRounds 回）。区切りで返答を終えても止まらない。
#   - 合格の条件と ```pwsh の確認コマンドの両方が無い Issue は起動しない（ゴールと決まった判定が無いと回らない。
#     公式の「一番の失敗は早すぎる勝利宣言」「決まった判定が一番強い」— Docs/Reports/2026/10/14/04）。
#   - 確認コマンドが名指しするリポジトリのファイル（テストのスクリプト等）は守る。開始時の中身から変わっていたら
#     合格にしない（公式の「テストを消さない・書き換えない」に当たる）。
#   - Issue へのコメントとラベルはスクリプトが行う（Claude に外への書き込みをさせない）。
#   - 本文の「## 前提」に書いた Issue（#番号）が合格（claude-done）か閉じられるまで、その Issue は始めない。
#     始める直前に見るので、同じ実行の中で前の段が合格すれば、続けて次の段が始まる（段を順につなぐ）。
#   - 質問のツール（AskUserQuestion）は渡さない。決定は Claude が自分で選んで報告に書く。
#   - 指示文だけでは止まらない保証にならないので、Claude Code の設定でも塞ぐ
#     （.claude/issue-run/settings.json を --settings で渡す。対話のセッションには効かない）:
#       Stop hook（stop-hook.ps1）… 報告が「合格」で確認コマンドも通るまで、返答を終えさせない
#       deny … push・Issue への書き込み・削除・プロセス停止・CLAUDE.md と .claude/ の書き換え等を必ず断る
#       env  … 自動更新を止める・コマンドの時間切れを 90 分まで延ばす
#     -p は壊れた設定を黙って無視するので、起動前の点検で hook と deny が効いたことを実際に確かめる。
# ラベル:
#   claude-run      やってよい（ユーザーが付ける）
#   claude-working  実行中（スクリプトが付け外し）
#   claude-done     合格した・確認待ち（閉じるのはユーザー）
#   claude-failed   合格の条件が無い・回数切れ・異常終了（理由はコメント。直して外すと再び対象）
param(
    [string]$Repo = 'mkanakureon/kaedevn',
    [int]$Issue = 0,
    [int]$MaxIssues = 20,
    [int]$RoundMinutes = 90,
    [int]$MaxRounds = 4,
    [int]$LimitWaitMinutes = 30,
    [int]$MaxLimitWaits = 16,
    [string]$Model = 'claude-opus-5-5',   # 既定は Opus 5.5（2026-10-16 ユーザー指示。対話の既定のモデルに引きずられない）
    [string]$WorkDir = '',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# gh・git・claude は UTF-8 で出す。既定（日本語の Windows は CP932）のまま読むと、Issue の本文の日本語が化けて
# 「## 合格の条件」が見つからず、どの Issue も起動しなくなる（2026-10-14 に Issue #1 の -DryRun で実際に起きた）
. (Join-Path $PSScriptRoot 'lib/text.ps1')   # $Utf8NoBom（BOM 無し UTF-8 の唯一の定義）
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
# -Mode night/day は 2026-10-15 に廃止した。PowerShell は引数名の頭の一致を受け付けるので、
# 古い書き方の -Mode night が -Model night になり、モデル night で起動しようとする。はっきり止める
if ($Model -in 'night', 'day') { throw "-Mode は廃止した（2026-10-15・時間帯は関係ない）。引数なしで起動する: pwsh Scripts\issue-run.ps1" }

function Get-GitTop([string]$Dir) {
    if (-not $Dir -or -not (Test-Path -LiteralPath $Dir -PathType Container)) { return '' }
    $top = & git -C $Dir rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $top) { return '' }
    return [System.IO.Path]::GetFullPath(([string]$top).Trim())
}

function Get-Worktrees([string]$AnyRoot) {
    $list = [System.Collections.Generic.List[object]]::new()
    $cur = $null
    foreach ($line in (& git -C $AnyRoot worktree list --porcelain)) {
        if ($line -like 'worktree *') { $cur = [pscustomobject]@{ Path = [System.IO.Path]::GetFullPath($line.Substring(9)); Branch = '' }; $list.Add($cur) }
        elseif ($line -like 'branch *' -and $cur) { $cur.Branch = $line.Substring(7) -replace '^refs/heads/', '' }
        elseif ($line -eq 'detached' -and $cur) { $cur.Branch = '(detached)' }
    }
    return @($list)
}

# その worktree で issue-run が動いていれば PID、いなければ 0（自分は数えない）
function Get-RunningPid([string]$Root) {
    $lock = Join-Path $Root 'Saved/IssueRun/run.lock'
    if (-not (Test-Path -LiteralPath $lock)) { return 0 }
    $p = 0
    if (-not [int]::TryParse(([string](Get-Content -LiteralPath $lock -Raw)).Trim(), [ref]$p) -or $p -eq $PID) { return 0 }
    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -match '^(pwsh|powershell)$') { return $p }
    return 0
}

# 作業場所を決める。-WorkDir があればそれ。窓から起動したら worktree の一覧から選ばせる（Enter で起動したフォルダー）。
# 窓でなければ起動したフォルダー。スクリプトの置き場では決めない
# （2026-10-15: kaedevn-adv のスクリプトから起動され、ユーザーに覚えのない worktree で動いていた）。
function Resolve-WorkRoot {
    if ($WorkDir) {
        $top = Get-GitTop $WorkDir
        if (-not $top) { throw "-WorkDir が git の作業フォルダーでない: $WorkDir" }
        return $top
    }
    $here = Get-GitTop $PWD.Path
    if ([Console]::IsInputRedirected) {
        if (-not $here) { throw "起動したフォルダーが git の作業フォルダーでない: $($PWD.Path)。-WorkDir で指定する" }
        return $here
    }
    $trees = @(Get-Worktrees $(if ($here) { $here } else { Split-Path $PSScriptRoot -Parent }))
    Write-Host '作業場所（worktree）を選ぶ。* が起動したフォルダー（Enter でそれ）:'
    for ($i = 0; $i -lt $trees.Count; $i++) {
        $w = $trees[$i]
        $busy = Get-RunningPid $w.Path
        Write-Host ('  {0} {1}) {2}  [{3}]{4}' -f $(if ($w.Path -eq $here) { '*' } else { ' ' }), ($i + 1), $w.Path, $w.Branch, $(if ($busy) { "  ← 実行中（PID $busy）" } else { '' }))
    }
    while ($true) {
        $ans = ([string](Read-Host '番号')).Trim()
        $pick = $null
        $n = 0
        if (-not $ans) { $pick = $here }
        elseif ([int]::TryParse($ans, [ref]$n) -and $n -ge 1 -and $n -le $trees.Count) { $pick = $trees[$n - 1].Path }
        if (-not $pick) { Write-Host "1〜$($trees.Count) の番号を入れる"; continue }
        if (Get-RunningPid $pick) { Write-Host 'そこでは別の issue-run が動いている。ほかを選ぶ'; continue }
        return $pick
    }
}

$RepoRoot = Resolve-WorkRoot
$Branch = (& git -C $RepoRoot branch --show-current).Trim()
Write-Host ("作業場所: {0}（{1}）" -f $RepoRoot, $Branch)
$PromptFile = Join-Path $RepoRoot '.claude/issue-run/prompt.md'
$SettingsTemplate = Join-Path $RepoRoot '.claude/issue-run/settings.json'
$StopHook = Join-Path $RepoRoot '.claude/issue-run/stop-hook.ps1'
$RunStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDir = Join-Path $RepoRoot "Saved/IssueRun/$RunStamp"
$LockFile = Join-Path $RepoRoot 'Saved/IssueRun/run.lock'
$IssueFile = Join-Path $RepoRoot 'Saved/IssueRun/run.issue'   # いま進めている Issue の番号（ほかの worktree の実行が読む）
$RuntimeSettings = Join-Path $LogDir 'settings.json'
$MaxStopBlocks = 30

$LabelRun = 'claude-run'
$LabelWorking = 'claude-working'
$LabelDone = 'claude-done'
$LabelFailed = 'claude-failed'
$SkipLabels = @($LabelWorking, $LabelDone, $LabelFailed)

# JSON・記録の任意の欄（無い・$Obj が $null なら $null）。Set-StrictMode の下では無い欄を . で読むと止まる
# （claude -p の JSON は回によって permission_denials・api_error が無い。NO-CRITERIA の記録には Reason が無い）
function Get-Field($Obj, [string]$Name) {
    if ($null -ne $Obj -and $Obj.PSObject.Properties[$Name]) { return $Obj.$Name }
    return $null
}

function Write-Step([string]$Text) { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Text) }

function Invoke-Gh {
    param([string[]]$GhArgs)
    $out = & gh @GhArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "gh $($GhArgs -join ' ') が失敗: $out" }
    return $out
}

function Set-IssueLabel([int]$Number, [string[]]$Add = @(), [string[]]$Remove = @()) {
    $ghArgs = @('issue', 'edit', "$Number", '--repo', $Repo)
    foreach ($l in $Add) { $ghArgs += @('--add-label', $l) }
    foreach ($l in $Remove) { $ghArgs += @('--remove-label', $l) }
    Invoke-Gh $ghArgs | Out-Null
}

# コメント本文はファイル経由で渡す（引数だと長さと引用符で壊れる）
function Add-IssueComment([int]$Number, [string]$Body) {
    $tmp = Join-Path $LogDir "comment-$Number-$(Get-Random).md"
    Set-Content -Path $tmp -Value $Body -Encoding utf8
    Invoke-Gh @('issue', 'comment', "$Number", '--repo', $Repo, '--body-file', $tmp) | Out-Null
}

function Initialize-Labels {
    $have = @((Invoke-Gh @('label', 'list', '--repo', $Repo, '--limit', '200', '--json', 'name') | Out-String | ConvertFrom-Json) | ForEach-Object { $_.name })
    $want = [ordered]@{
        $LabelRun     = @('1d76db', 'Claude に無人で進めさせてよい')
        $LabelWorking = @('fbca04', 'issue-run.ps1 が実行中')
        $LabelDone    = @('0e8a16', 'Claude が合格させた・確認待ち')
        $LabelFailed  = @('b60205', '合格の条件が無い・回数切れ・異常終了')
    }
    foreach ($name in $want.Keys) {
        if ($have -contains $name) { continue }
        Invoke-Gh @('label', 'create', $name, '--repo', $Repo, '--color', $want[$name][0], '--description', $want[$name][1]) | Out-Null
        Write-Step "ラベルを作った: $name"
    }
}

function Get-TargetIssues {
    if ($Issue -gt 0) {
        return @(Invoke-Gh @('issue', 'view', "$Issue", '--repo', $Repo, '--json', 'number,title,labels,body') | Out-String | ConvertFrom-Json)
    }
    $list = Invoke-Gh @('issue', 'list', '--repo', $Repo, '--label', $LabelRun, '--state', 'open', '--limit', '200', '--json', 'number,title,labels,body') | Out-String | ConvertFrom-Json
    $targets = @($list | Where-Object {
            $names = @($_.labels | ForEach-Object { $_.name })
            -not ($names | Where-Object { $SkipLabels -contains $_ })
        } | Sort-Object number)
    return @($targets | Select-Object -First $MaxIssues)
}

# 本文の「## 合格の条件」節から、条件の行と ```pwsh の確認コマンドを取り出す。
function Get-PassCriteria([string]$Body) {
    $text = ($Body -replace "`r", '') -replace '(?s)<!--.*?-->', ''
    $m = [regex]::Match($text, '(?ms)^##\s*合格の条件\s*$(.*?)(?=^##\s|\z)')
    if (-not $m.Success) { return [pscustomobject]@{ Items = @(); Check = '' } }
    $section = $m.Groups[1].Value
    $check = ''
    $cm = [regex]::Match($section, '(?ms)^```(?:pwsh|powershell)\s*$(.*?)^```')
    if ($cm.Success) { $check = $cm.Groups[1].Value.Trim() }
    $noCode = [regex]::Replace($section, '(?ms)^```.*?^```', '')
    $items = @($noCode -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^(-|\*|\d+\.)\s+\S' })
    return [pscustomobject]@{ Items = $items; Check = $check }
}

# 本文の「## 前提」節の #番号 を取り出す。
function Get-Prerequisites([string]$Body) {
    $text = ($Body -replace "`r", '') -replace '(?s)<!--.*?-->', ''
    $m = [regex]::Match($text, '(?ms)^##\s*前提\s*$(.*?)(?=^##\s|\z)')
    if (-not $m.Success) { return @() }
    return @([regex]::Matches($m.Groups[1].Value, '#(\d+)') | ForEach-Object { [int]$_.Groups[1].Value } | Select-Object -Unique)
}

# 前提の Issue のうち、まだ済んでいないものを「#番号（理由）」で返す。閉じられていれば済み。
# claude-done でも、そのときのコミットがこの worktree のブランチに無ければ済んでいない
# （worktree ごとに同時に動かすと、前の段が別のブランチで合格していることがある）。
function Get-UnmetPrerequisites([int[]]$Numbers) {
    $unmet = foreach ($n in $Numbers) {
        $v = Invoke-Gh @('issue', 'view', "$n", '--repo', $Repo, '--json', 'state,labels,comments') | Out-String | ConvertFrom-Json
        if ($v.state -eq 'CLOSED') { continue }
        $names = @($v.labels | ForEach-Object { $_.name })
        if (-not ($names -contains $LabelDone)) { "#$n（合格していない）"; continue }
        $last = @($v.comments | Where-Object { $_.body -like 'issue-run.ps1*' }) | Select-Object -Last 1
        if (-not $last) { continue }
        # コメントの頭の「HEAD <sha>」を見る。それが無い古いコメントは、本文に出てくるコミットを全部見る
        $hm = [regex]::Match($last.body, '・HEAD ([0-9a-f]{7,40})）')
        $cands = if ($hm.Success) { @($hm.Groups[1].Value) } else { @([regex]::Matches($last.body, '\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b') | ForEach-Object { $_.Value } | Select-Object -Unique) }
        $shas = @($cands | Where-Object { & git -C $RepoRoot cat-file -e "$_^{commit}" 2>$null; $LASTEXITCODE -eq 0 })
        $missing = @($shas | Where-Object { & git -C $RepoRoot merge-base --is-ancestor $_ HEAD 2>$null; $LASTEXITCODE -ne 0 })
        if ($missing.Count) { "#$n（合格したコミット $($missing[0]) がブランチ $Branch に無い）" }
    }
    return @($unmet)
}

# ほかの worktree で動いている issue-run が、いま進めている Issue の番号
function Get-OtherRunningIssues {
    $nums = foreach ($w in (Get-Worktrees $RepoRoot)) {
        if ($w.Path -eq $RepoRoot -or -not (Get-RunningPid $w.Path)) { continue }
        $f = Join-Path $w.Path 'Saved/IssueRun/run.issue'
        $n = 0
        if ((Test-Path -LiteralPath $f) -and [int]::TryParse(([string](Get-Content -LiteralPath $f -Raw)).Trim(), [ref]$n)) { $n }
    }
    return @($nums)
}

# 確認コマンドの中の語のうち、git が管理しているファイルを指すものを「守るファイル」にする。
# 管理外（ビルドで作り直される exe・生成物）は守らない（毎回変わるので合格にならなくなる）。
function Get-ProtectedFiles([string]$Code) {
    $tracked = [System.Collections.Generic.HashSet[string]]::new([string[]]@(& git -C $RepoRoot ls-files), [System.StringComparer]::OrdinalIgnoreCase)
    $found = [System.Collections.Generic.List[string]]::new()
    foreach ($tok in ($Code -split '[\s;|&(){}=,]+')) {
        $p = $tok.Trim().Trim('"', "'", '`')
        if (-not $p -or $p.StartsWith('-')) { continue }
        $full = Join-Path $RepoRoot $p
        # 頭の ./ と / だけを取る。TrimStart('.', '/') は .github のような点で始まるフォルダーの点まで取り、守れなかった（キットの Unity 版 2026-10-22 の直し）
        $rel = $p.Replace([char]92, [char]47) -replace '^(\./|/)+', ''
        if ((Test-Path -LiteralPath $full -PathType Leaf) -and $tracked.Contains($rel) -and -not $found.Contains($rel)) { $found.Add($rel) }
    }
    return @($found)
}

# 設定（$SettingsTemplate の JSON の文字列）の deny のうち、作業場所の直下の書き換えを断るパス
# （Edit(//{{REPO}}/<パス>)・Write(//{{REPO}}/<パス>) の <パス>）を、重ならずに並べて返す。
function Get-DenyEditPaths([string]$SettingsText) {
    $found = [System.Collections.Generic.List[string]]::new()
    foreach ($rule in @(($SettingsText | ConvertFrom-Json).permissions.deny)) {
        $m = [regex]::Match([string]$rule, '^(?:Edit|Write)\(//\{\{REPO\}\}/(.+)\)$')
        if ($m.Success -and -not $found.Contains($m.Groups[1].Value)) { $found.Add($m.Groups[1].Value) }
    }
    return @($found)
}

# 文字列（合格の条件と確認コマンド）の中で、作業場所の直下から見て deny のパスに当たる語を、重ならずに返す。
# `**` で終わるパスはその下全部に当たる。頭にフォルダーが付いた語（Templates/NewWork/CLAUDE.md など）は当たらない。大文字小文字は区別する。
function Get-DeniedMentions([string]$Text, [string[]]$Paths) {
    $hits = [System.Collections.Generic.List[string]]::new()
    foreach ($raw in ($Text -split '[\s`''"・、。,;|&(){}=\[\]「」『』（）]+')) {
        $word = $raw.Replace([char]92, [char]47) -replace '^(\./)+', ''
        if (-not $word) { continue }
        $matched = @($Paths | Where-Object { if ($_.EndsWith('/**', [System.StringComparison]::Ordinal)) { $word.StartsWith($_.Substring(0, $_.Length - 2), [System.StringComparison]::Ordinal) } else { $word -ceq $_ } }).Count -gt 0
        if ($matched -and -not $hits.Contains($word)) { $hits.Add($word) }
    }
    return @($hits)
}

# 報告が「判定不能」（合格の条件どうし、または条件と守るファイルが両立しない）か。
# 行「## 結果: 判定不能」と、中身のある節「## 両立しない条件」がそろえば節の中身を返す。そろわなければ ''。
# stop-hook.ps1 も同じ決まりで見る（そちらは押し返さないだけ。変えるときは両方）。
function Get-UndecidableReport([string]$Text) {
    $t = ([string]$Text).Replace("`r", '')
    if ($t -notmatch '(?m)^[ \t]*##[ \t]*結果:[ \t]*判定不能[ \t]*$') { return '' }
    $m = [regex]::Match($t, '(?m)^[ \t]*##[ \t]*両立しない条件[ \t]*$')
    if (-not $m.Success) { return '' }
    $rest = $t.Substring($m.Index + $m.Length)
    $next = [regex]::Match($rest, '(?m)^## ')
    if ($next.Success) { $rest = $rest.Substring(0, $next.Index) }
    return $rest.Trim()
}

# 守るファイルの中身の指紋（SHA256）を「指紋<TAB>パス」で書く。stop-hook.ps1 も同じ形式で読む。
function Save-ProtectSnapshot([string[]]$Files, [string]$OutFile) {
    $lines = foreach ($f in $Files) { "{0}`t{1}" -f (Get-FileHash -LiteralPath (Join-Path $RepoRoot $f) -Algorithm SHA256).Hash, $f }
    Set-Content -Path $OutFile -Value @($lines) -Encoding utf8
}

function Get-ChangedProtected([string]$SnapshotFile) {
    if (-not (Test-Path $SnapshotFile)) { return @() }
    $changed = foreach ($line in (Get-Content $SnapshotFile -Encoding utf8 | Where-Object { $_ })) {
        $hash, $rel = $line -split "`t", 2
        $full = Join-Path $RepoRoot $rel
        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { $rel; continue }
        if ((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash -ne $hash) { $rel }
    }
    return @($changed)
}

# UE エディタ・ビルドは同時1本（CLAUDE.md）。動いていれば、このセッションでのビルドとエディタ起動を禁じて渡す。
function Get-UeState {
    $names = 'UnrealEditor', 'UnrealEditor-Cmd', 'UnrealBuildTool', 'LiveCodingConsole'
    $running = @(Get-Process -Name $names -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessName } | Sort-Object -Unique)
    if ($running.Count -eq 0) { return 'UE エディタもビルドも動いていない。ただし UE の組み立て・エディタは、Issue の確認コマンドが使うとき（最終段階の試験）だけ、最後に 1 回使う（同時1本は守る）。' }
    return "いま動いている: $($running -join ', ')。このセッションではフルビルド・UE エディタの起動をしない。ビルドの要らない条件を先に満たし、ビルドが要る条件は報告の判定表に「未判定（UE 使用中）」と書いて NOT-PASS で返す。"
}

function New-IssuePrompt([int]$Number, [string]$ReportPath, [string[]]$Protected = @()) {
    $branch = (& git -C $RepoRoot branch --show-current).Trim()
    $text = Get-Content $PromptFile -Raw -Encoding utf8
    return $text.Replace('{{REPO}}', $Repo).Replace('{{NUMBER}}', "$Number").
        Replace('{{BRANCH}}', $branch).Replace('{{UE_STATE}}', (Get-UeState)).Replace('{{REPORT}}', $ReportPath).
        Replace('{{PROTECTED}}', $(if ($Protected -and $Protected.Count) { ($Protected | ForEach-Object { "``$_``" }) -join '・' } else { '（なし）' }))
}

function New-ContinuePrompt([string]$Reason) {
    return @(
        'まだ合格していない。続けて。',
        "理由: $Reason",
        "UE: $(Get-UeState)",
        '合格の条件を全部、実行結果で満たすまで進める。報告ファイルを最新にし、全部満たしたら「## 結果: 合格」と書く。'
    ) -join "`n"
}

# claude -p を1回起動する。指示文は標準入力から渡す（引数だと改行と引用符が壊れる）。
# 1回目は -SessionId で会話の ID を決めておき、2回目以降は -Resume でその会話を続ける
# （時間切れで JSON が返らなくても、続きから再開できる）。
function Invoke-Claude([string]$PromptText, [int]$Minutes, [string]$OutFile, [string]$SessionId = '', [switch]$Resume, [hashtable]$EnvVars = @{}) {
    $psi = [System.Diagnostics.ProcessStartInfo]::new((Get-Command claude -CommandType Application | Select-Object -First 1).Source)
    $cliArgs = @('-p', '--output-format', 'json', '--permission-mode', 'auto', '--permission-prompts', 'none',
        '--disallowed-tools', 'AskUserQuestion', '--settings', $RuntimeSettings)
    if ($SessionId) { $cliArgs += $(if ($Resume) { @('--resume', $SessionId) } else { @('--session-id', $SessionId) }) }
    if ($Model) { $cliArgs += @('--model', $Model) }
    foreach ($a in $cliArgs) { $psi.ArgumentList.Add($a) }
    $psi.WorkingDirectory = $RepoRoot
    $psi.Environment['ISSUE_RUN_ROOT'] = $RepoRoot
    foreach ($k in $EnvVars.Keys) { $psi.Environment[$k] = [string]$EnvVars[$k] }
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardInputEncoding = $Utf8NoBom
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    $proc.StandardInput.Write($PromptText)
    $proc.StandardInput.Close()

    $timedOut = -not $proc.WaitForExit($Minutes * 60 * 1000)
    if ($timedOut) { $proc.Kill($true); $proc.WaitForExit() }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    Set-Content -Path $OutFile -Value $stdout -Encoding utf8
    if ($stderr) { Set-Content -Path "$OutFile.stderr.txt" -Value $stderr -Encoding utf8 }

    $parsed = $null
    try { $parsed = $stdout | ConvertFrom-Json } catch { <# JSON でない出力（認証切れ・上限の文など）は Json=$null で返し、呼び元が Raw を見る #> }
    return [pscustomobject]@{ TimedOut = $timedOut; Json = $parsed; Raw = "$stdout`n$stderr" }
}

function Test-AuthError($Res) { return $Res.Raw -match 'Failed to authenticate|OAuth session expired|Invalid API key|/login' }
function Test-LimitError($Res) {
    if ($Res.Json -and -not (Get-Field $Res.Json 'is_error')) { return $false }
    # JSON の api_error / api_error_status を先に見る（2026-10-16: 「You've hit your session limit · resets 11:30am」が
    # 文の照合に当たらず、待たずに 4 回を使い切った）。文の照合は JSON が返らなかったときの保険
    if ($Res.Json -and ([string](Get-Field $Res.Json 'api_error') -eq 'usage_limit_reached' -or [int](Get-Field $Res.Json 'api_error_status') -eq 429)) { return $true }
    return $Res.Raw -match '(?i)usage limit|rate limit|session limit|limit reached|limit will reset|resets at|resets \d'
}

function Invoke-PassCheck([string]$Code, [string]$OutFile) {
    $out = & pwsh -NoProfile -WorkingDirectory $RepoRoot -Command $Code 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    Set-Content -Path $OutFile -Value "exit=$exitCode`n$out" -Encoding utf8
    $tail = ($out.Trim() -split "`n" | Select-Object -Last 30) -join "`n"
    return [pscustomobject]@{ Passed = ($exitCode -eq 0); Tail = $tail; ExitCode = $exitCode }
}

# 1 件の開始〜終了を分の単位で書く。同じ日なら終わりは時刻だけ（例 2026-10-22 09:36〜09:42）・日をまたげば日付も
function Format-Span([datetime]$From, [datetime]$To) {
    $endText = if ($From.Date -eq $To.Date) { $To.ToString('HH:mm') } else { $To.ToString('yyyy-MM-dd HH:mm') }
    return '{0}〜{1}' -f $From.ToString('yyyy-MM-dd HH:mm'), $endText
}

function Get-Tail([string]$Text, [int]$Max = 1500) {
    $t = ([string]$Text).Trim()
    if ($t.Length -gt $Max) { return '…' + $t.Substring($t.Length - $Max) }
    return $t
}

# --- 眠らせない（このスクリプトが動いている間だけ。終われば OS が元に戻す） ---
Add-Type -Namespace IssueRun -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$ES_CONTINUOUS = [uint32]'0x80000000'
$ES_SYSTEM_REQUIRED = [uint32]'0x00000001'

# --- 窓の簡易編集モードを切る（このスクリプトが動いている間だけ。終われば戻す） ---
# 窓の中をクリックすると選択モードに入り、画面への出力で止まる（2026-10-14 に #4 で 24 分止まった）
Add-Type -Namespace IssueRun -Name Console -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern System.IntPtr GetStdHandle(int nStdHandle);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(System.IntPtr h, out uint mode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(System.IntPtr h, uint mode);
'@
$ConsoleIn = [IssueRun.Console]::GetStdHandle(-10)
$ConsoleModeBefore = [uint32]0
$HaveConsole = [IssueRun.Console]::GetConsoleMode($ConsoleIn, [ref]$ConsoleModeBefore)   # 入力が窓でなければ何もしない
$ENABLE_QUICK_EDIT_MODE = [uint32]'0x0040'
$ENABLE_EXTENDED_FLAGS = [uint32]'0x0080'

# --- 二重起動を防ぐ ---
New-Item -ItemType Directory -Force -Path (Split-Path $LockFile) | Out-Null
if (Test-Path $LockFile) {
    $otherPid = [int](Get-Content $LockFile -Raw)
    if (Get-Process -Id $otherPid -ErrorAction SilentlyContinue) { Write-Step "別の issue-run が動いている（PID $otherPid）。終了する。"; exit 3 }
}

foreach ($f in $PromptFile, $SettingsTemplate, $StopHook) { if (-not (Test-Path $f)) { throw "無人実行の部品が無い: $f — Docs/Guides/Working/issue-run.md の「準備」" } }
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw 'gh にログインしていない。gh auth login を先に。' }

$targets = @(Get-TargetIssues)   # @() で包む（1 件・0 件だと配列が崩れ、Set-StrictMode の下で .Count が止まる）
Write-Step ("対象 {0} 件: {1}" -f $targets.Count, (($targets | ForEach-Object { "#$($_.number)" }) -join ' '))
if ($DryRun) {
    $denyPaths = @(Get-DenyEditPaths (Get-Content $SettingsTemplate -Raw -Encoding utf8))
    foreach ($t in $targets) {
        $c = Get-PassCriteria $t.body
        Write-Host ("#{0} 合格の条件 {1} 行・確認コマンド {2}" -f $t.number, $c.Items.Count, $(if ($c.Check) { 'あり' } else { 'なし' }))
        if ($c.Items.Count -eq 0 -or -not $c.Check) { Write-Host '  → 合格の条件か確認コマンドが無いので起動しない'; continue }
        Write-Host ("  守るファイル: {0}" -f ((Get-ProtectedFiles $c.Check) -join ', '))
        $denyHits = @(Get-DeniedMentions (($c.Items -join "`n") + "`n" + $c.Check) $denyPaths)
        if ($denyHits.Count) { Write-Host ("  deny のパス: {0}（無人の回では直せない。直す必要があれば人が直す。変えないことを確かめるだけなら無視してよい）" -f ($denyHits -join ', ')) }
        $pre = @(Get-Prerequisites $t.body)
        if ($pre.Count) { Write-Host ("  前提: {0}（いま済んでいないもの: {1}）" -f (($pre | ForEach-Object { "#$_" }) -join ' '), ((Get-UnmetPrerequisites $pre) -join ' ')) }
    }
    if ($targets.Count -gt 0) {
        $c0 = Get-PassCriteria $targets[0].body
        Write-Host '--- 1件目に渡す指示文 ---'; Write-Host (New-IssuePrompt $targets[0].number '<報告ファイル>' (Get-ProtectedFiles $c0.Check))
    }
    exit 0
}
if ($targets.Count -eq 0) { exit 0 }

Set-Content -Path $LockFile -Value $PID -Encoding ascii
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
[IssueRun.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null
if ($HaveConsole) { [IssueRun.Console]::SetConsoleMode($ConsoleIn, ($ConsoleModeBefore -band (-bnot $ENABLE_QUICK_EDIT_MODE)) -bor $ENABLE_EXTENDED_FLAGS) | Out-Null }
$results = [System.Collections.Generic.List[object]]::new()
$aborted = ''

try {
    Initialize-Labels

    # 前回が途中で落ちていたら、実行中のラベルが残っている。外して対象に戻す。
    # ほかの worktree の実行が進めている Issue のラベルは生きているので外さない。
    $othersBusy = Get-OtherRunningIssues
    $stale = Invoke-Gh @('issue', 'list', '--repo', $Repo, '--label', $LabelWorking, '--state', 'open', '--json', 'number') | Out-String | ConvertFrom-Json
    foreach ($s in @($stale)) {
        if (-not $s -or $othersBusy -contains [int]$s.number) { continue }
        Set-IssueLabel $s.number -Remove @($LabelWorking); Write-Step "前回の実行中のラベルを外した: #$($s.number)"
    }

    # 設定の実体を作る（hook のパスを絶対パスに）。JSON として読めなければここで止める
    # {{REPO}} は作業場所の POSIX 形（D:\x\y → d/x/y）。設定の deny の //{{REPO}}/CLAUDE.md が、この worktree の直下だけに効く
# （裸の CLAUDE.md・.claude/** はどの深さにも効いて製品の雛形まで断る。/path は --settings のファイルの場所が基準なので使えない。2026-10-17 実測）
$repoPosix = $RepoRoot.Substring(0, 1).ToLower() + $RepoRoot.Substring(2).Replace([char]92, [char]47).TrimEnd('/')
$settingsText = (Get-Content $SettingsTemplate -Raw -Encoding utf8).Replace('{{STOP_HOOK}}', $StopHook.Replace([char]92, [char]47)).Replace('{{REPO}}', $repoPosix)
    $null = $settingsText | ConvertFrom-Json
    Set-Content -Path $RuntimeSettings -Value $settingsText -Encoding utf8

    # 起動前の点検: 認証・Stop hook が呼ばれる・deny が効く、の3つを実際に確かめる。
    # （認証が切れていると全件が数秒で失敗する。-p は壊れた設定を黙って無視するので、効いた証拠を取る）
    $probeMark = Join-Path $LogDir 'probe-stop-hook.txt'
    $probe = Invoke-Claude 'これは点検。Bash ツールで `git stash list` を1回だけ実行し、結果を1行で答えて終わる。断られたら、断られたと1行で答えて終わる。' 5 (Join-Path $LogDir 'probe.json') -EnvVars @{ ISSUE_RUN_PROBE = $probeMark }
    if ((Test-AuthError $probe) -or -not $probe.Json -or (Get-Field $probe.Json 'is_error')) {
        throw "claude -p が動かない（認証切れなど）: $(Get-Field $probe.Json 'result') — 手順は Docs/Guides/Working/issue-run.md の「準備」"
    }
    if (-not (Test-Path $probeMark)) { throw "Stop hook が呼ばれなかった（設定が読まれていない）。$RuntimeSettings と claude の版を確かめる" }
    if (-not @(Get-Field $probe.Json 'permission_denials').Count) { throw "deny が効かなかった（git stash が断られなかった）。$RuntimeSettings を確かめる" }
    Write-Step '点検: 認証・Stop hook・deny とも効いている'

    # 1 件ごとに対象を GitHub から取り直す。起動した後に直した本文・足した Issue も拾う
    # （2026-10-14: 起動時の本文を使い続けたため、起動後に直した確認コマンドが効かず、S1 が合格できない形で始まった）
    $seen = [System.Collections.Generic.HashSet[int]]::new()
    while ($seen.Count -lt $MaxIssues) {
        $t = @(Get-TargetIssues | Where-Object { -not $seen.Contains([int]$_.number) }) | Select-Object -First 1
        if (-not $t) { break }
        [void]$seen.Add([int]$t.number)
        $number = [int]$t.number
        $criteria = Get-PassCriteria $t.body
        if ($criteria.Items.Count -eq 0 -or -not $criteria.Check) {
            $missing = @()
            if ($criteria.Items.Count -eq 0) { $missing += '「## 合格の条件」の箇条書き' }
            if (-not $criteria.Check) { $missing += '「## 合格の条件」の中の ```pwsh の確認コマンド（exit 0 で合格）' }
            Write-Step "#$number 合格の条件か確認コマンドが無いので起動しない"
            Add-IssueComment $number "issue-run.ps1: **起動しなかった** — 本文に $($missing -join ' と ') が無い。書いて $LabelFailed を外すと次の回で対象になる。"
            Set-IssueLabel $number -Add @($LabelFailed)
            $results.Add([pscustomobject]@{ Number = $number; Title = $t.title; Status = 'NO-CRITERIA'; Minutes = 0; Rounds = 0; Commits = @(); Denials = @(); Report = '' })
            continue
        }

        $unmet = @(Get-UnmetPrerequisites (Get-Prerequisites $t.body))
        if ($unmet.Count) {
            $waitFor = $unmet -join ' '
            Write-Step "#$number 前提 $waitFor が済んでいないので、今回は始めない"
            $results.Add([pscustomobject]@{ Number = $number; Title = $t.title; Status = 'WAITING'; Minutes = 0; Rounds = 0; Commits = @(); Denials = @(); Report = ''; Reason = "前提 $waitFor が済んでいない（合格か閉じられるか、合格したコミットをこのブランチに入れると次の実行で始まる）" })
            continue
        }

        # 番号を先に書いてから、ほかの worktree の実行と取り合っていないか見る（両方が同じ Issue を拾ったら両方とも譲る）
        Set-Content -Path $IssueFile -Value $number -Encoding ascii
        if ((Get-OtherRunningIssues) -contains $number) {
            Remove-Item $IssueFile -ErrorAction SilentlyContinue
            Write-Step "#$number はほかの worktree の実行が進めているので飛ばす"
            continue
        }

        $protected = @(Get-ProtectedFiles $criteria.Check)
        Write-Step "#$number $($t.title) を始める（条件 $($criteria.Items.Count) 行・守るファイル $($protected.Count) 件）"
        Set-IssueLabel $number -Add @($LabelWorking)
        $reportPath = Join-Path $LogDir "issue-$number-report.md"
        $headBefore = (& git -C $RepoRoot rev-parse HEAD).Trim()
        $started = Get-Date
        $sessionId = [guid]::NewGuid().ToString()
        $haveSession = $false
        $checkFile = Join-Path $LogDir "issue-$number-check.ps1"
        Set-Content -Path $checkFile -Value $criteria.Check -Encoding utf8
        $protectFile = Join-Path $LogDir "issue-$number-protect.tsv"
        Save-ProtectSnapshot $protected $protectFile
        $issueEnv = @{
            ISSUE_RUN_REPORT = $reportPath; ISSUE_RUN_PROTECT = $protectFile
            ISSUE_RUN_STATE = (Join-Path $LogDir "issue-$number-stopblocks.txt"); ISSUE_RUN_MAXBLOCKS = $MaxStopBlocks
        }
        $denials = [System.Collections.Generic.List[string]]::new()
        $status = 'NOT-PASS'
        $reason = ''
        $round = 0
        $waits = 0
        $lastResult = ''
        $undecidable = ''

        while ($round -lt $MaxRounds) {
            $round++
            $promptText = if ($haveSession) { New-ContinuePrompt $reason } else { New-IssuePrompt $number $reportPath $protected }
            Write-Step "#$number 回 $round/$MaxRounds"
            $res = Invoke-Claude $promptText $RoundMinutes (Join-Path $LogDir "issue-$number-round$round.json") $sessionId -Resume:$haveSession -EnvVars $issueEnv
            if ($haveSession -and $res.Raw -match '(?i)no conversation found') {
                # 前の回が会話を残さずに落ちていた。新しい会話で最初の指示から始め直す
                $sessionId = [guid]::NewGuid().ToString()
                $haveSession = $false
                $round--
                continue
            }
            $haveSession = $true

            if (Test-AuthError $res) { $aborted = "認証が切れた（#$number の途中）"; $status = 'ABORTED'; break }
            if ((Test-LimitError $res) -and $waits -lt $MaxLimitWaits) {
                $waits++
                $round--   # 上限待ちは回数に数えない
                $reason = '利用上限で中断した。中断したところから続ける。'
                Write-Step "利用上限。$LimitWaitMinutes 分待ってやり直す（$waits/$MaxLimitWaits）"
                Start-Sleep -Seconds ($LimitWaitMinutes * 60)
                continue
            }
            $pd = Get-Field $res.Json 'permission_denials'
            if ($pd) {
                foreach ($d in $pd) { $denials.Add([string](Get-Field $d 'tool_name')) }
            }
            $lastResult = [string](Get-Field $res.Json 'result')

            if ($res.TimedOut) { $reason = "1回の上限 $RoundMinutes 分を超えて打ち切った。途中から続ける。"; continue }
            $reportText = if (Test-Path $reportPath) { [string](Get-Content $reportPath -Raw -Encoding utf8) } else { '' }
            $claimed = $reportText -match '(?m)^##\s*結果:\s*合格\s*$'
            if (-not $claimed) {
                # 判定不能（合格の条件が両立しない）と決まった形で書いてあれば、確認コマンドを回さず、次の回へ進まずに人へ返す
                # （作る側をどう直しても合格できない Issue で 4 回を使い切らない。キットの Node 版 2026-11-12 と同じ決まり）
                $undecidable = Get-UndecidableReport $reportText
                if ($undecidable) { Write-Step "#$number 報告が判定不能（合格の条件が両立しない）。次の回へ進まない"; break }
                $reason = "報告ファイルが「## 結果: 合格」になっていない。判定表で未合格の条件を満たす。最後の返答: $(Get-Tail $lastResult 400)"
                continue
            }
            $changedProtected = @(Get-ChangedProtected $protectFile)
            if ($changedProtected.Count) {
                $reason = "確認コマンドが使うファイルを変えた: $($changedProtected -join ', ')。合格の判定に使うファイルは変えない。git で開始時の中身に戻してから、作る側を直す。"
                Write-Step "#$number 守るファイルが変わった（$($changedProtected -join ', ')）。続けさせる"
                continue
            }
            $chk = Invoke-PassCheck $criteria.Check (Join-Path $LogDir "issue-$number-check$round.txt")
            if (-not $chk.Passed) {
                $reason = "「合格」と書いたが、Issue の確認コマンドが失敗した（exit $($chk.ExitCode)）。出力の末尾:`n$($chk.Tail)"
                Write-Step "#$number 確認コマンドが失敗（exit $($chk.ExitCode)）。続けさせる"
                continue
            }
            $status = 'PASS'
            break
        }
        if ($status -eq 'NOT-PASS') {
            $reason = if ($undecidable) { "報告が判定不能（合格の条件が両立しない）。人が Issue の条件か守るファイルを直す。`n$undecidable" }
            else { "$MaxRounds 回で合格しなかった。最後の理由: $reason" }
        }

        $commits = @(& git -C $RepoRoot log --oneline "$headBefore..HEAD")
        $report = if (Test-Path $reportPath) { Get-Content $reportPath -Raw -Encoding utf8 } else { "（報告ファイルが無い）`n`n最後の返答:`n$(Get-Tail $lastResult)" }
        $endedAt = Get-Date
        $minutes = [int]($endedAt - $started).TotalMinutes
        $span = Format-Span $started $endedAt
        $headAfter = (& git -C $RepoRoot rev-parse --short=8 HEAD).Trim()
        # 「・HEAD <sha>）」の形は Get-UnmetPrerequisites が読むので変えない。時刻は分の単位
        $head = "issue-run.ps1: **$status** — $minutes 分（$span）・$round 回・コミット $($commits.Count) 件・作業場所 $(Split-Path $RepoRoot -Leaf)（$Branch・HEAD $headAfter）・ログ Saved/IssueRun/$RunStamp/"
        $uniqDenials = @($denials | Sort-Object -Unique)
        $extra = @()
        if ($status -ne 'PASS') { $extra += "合格しなかった理由: $reason" }
        if ($uniqDenials.Count) { $extra += "auto mode に断られたツール: $($uniqDenials -join ', ')" }
        $commentBody = (@($head) + $extra + @('', $report)) -join "`n"
        if ($commentBody.Length -gt 60000) { $commentBody = $commentBody.Substring(0, 60000) + "`n`n…（長いので切った。全文は $reportPath）" }
        Add-IssueComment $number $commentBody
        Set-IssueLabel $number -Add @($(if ($status -eq 'PASS') { $LabelDone } else { $LabelFailed })) -Remove @($LabelWorking)

        $results.Add([pscustomobject]@{
                Number = $number; Title = $t.title; Status = $status; Minutes = $minutes; Span = $span; Rounds = $round
                Commits = $commits; Denials = $uniqDenials; Report = $report; Reason = $reason
            })
        Remove-Item $IssueFile -ErrorAction SilentlyContinue
        Write-Step "#$number → $status（$round 回・コミット $($commits.Count) 件）"
        if ($aborted) { break }
    }
}
catch {
    $aborted = $_.Exception.Message
    Write-Step "中断: $aborted"
}
finally {
    [IssueRun.Power]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
    if ($HaveConsole) { [IssueRun.Console]::SetConsoleMode($ConsoleIn, $ConsoleModeBefore) | Out-Null }
    Remove-Item $LockFile, $IssueFile -ErrorAction SilentlyContinue

    # --- 記録（Issue ごとに 1 本 Docs/IssueRuns/issue-NNNN.md。Issue の番号は変わらないので、回ごとに下へ書き足す。2026-10-22 ユーザーの指示） ---
    # Issue を 1 件も扱わずに止まった回（認証切れなど）は書かない（ログ Saved/IssueRun/<回>/ と画面に出る）
    $runDir = Join-Path $RepoRoot 'Docs/IssueRuns'
    New-Item -ItemType Directory -Force -Path $runDir | Out-Null
    foreach ($r in @($results | Sort-Object Number)) {
        $path = Join-Path $runDir ("issue-{0:D4}.md" -f [int]$r.Number)
        $lines = [System.Collections.Generic.List[string]]::new()
        if (Test-Path $path) { $lines.Add('') }
        else {
            $lines.Add("# #$($r.Number) $($r.Title)")
            $lines.Add('')
            $lines.Add("``Scripts/issue-run.ps1`` が回ごとに下へ書き足す（古い回が上）。")
            $lines.Add('')
        }
        $lines.Add("## $RunStamp — $($r.Status)")
        $lines.Add('')
        $denied = if ($r.Denials) { "・断られたツール $($r.Denials -join ', ')" } else { '' }
        $spanText = if (Get-Field $r 'Span') { "（$($r.Span)）" } else { '' }   # 起動しなかった・前提待ちの行には時刻が無い
        $lines.Add("作業場所 ``$RepoRoot``・ログ ``Saved/IssueRun/$RunStamp/``・$($r.Minutes) 分$spanText・$($r.Rounds) 回・コミット $($r.Commits.Count) 件$denied")
        if ($aborted) { $lines.Add(''); $lines.Add("**途中で止まった: $aborted**") }
        if ($r.Status -ne 'PASS' -and (Get-Field $r 'Reason')) { $lines.Add(''); $lines.Add("理由: $($r.Reason)") }
        if ($r.Commits.Count) { $lines.Add('') }
        foreach ($c in $r.Commits) { $lines.Add("- ``$c``") }
        if ($r.Report) { $lines.Add(''); $lines.Add(($r.Report -replace '(?m)^## ', '### ').TrimEnd()) }
        Add-Content -Path $path -Value ($lines -join "`n") -Encoding utf8
        Write-Step "記録: $path（#$($r.Number) $($r.Status)）"
    }
}
if ($aborted) { exit 1 }
