# issue-create.ps1 — Logs/IssueDrafts の下書き（<名前>.title.txt・<名前>.md）から Issue を作り、claude-run を付け、無人の回が拾えるかまで確かめる。
#
# .claude/skills/github-issue の A の 7〜8 で毎回手でする手順を 1 つにした:
#   1. 本文の ```pwsh の確認コマンドを取り出して構文を見る。<名前>.check.ps1 があれば本文の中身と同じかも見る。
#      issue-run と同じ関数（issue-protect.ps1 の Get-ProtectedFiles）で守るファイルを出し、「# 守る:」に無い物があるか、
#      -Change と重なれば FAIL（作る前に止める）
#   2. gh issue create --label claude-run
#   3. 作った直後は一覧に出ない（数十秒）ので、issue-run.ps1 -Issue <番号> -DryRun が「対象 1 件: #<番号>」になるまで 5 秒ごとに見る（90 秒まで）
#   4. 合格の条件の行数・確認コマンドの有無・守るファイルの数を出す。-Change に渡したファイルが（作った Issue を issue-run が読んだ）守るファイルに入っていたら FAIL（1 と同じ確かめを、gh から読み直した本文でもう一度）
#
#   pwsh -NoProfile -File Scripts/issue-create.ps1 -Draft Logs/IssueDrafts/<題>
#   pwsh -NoProfile -File Scripts/issue-create.ps1 -Draft Logs/IssueDrafts/<題> -Change Docs/Guides/Manuals/<説明書>.md
#   pwsh -NoProfile -File Scripts/issue-create.ps1 -Draft Logs/IssueDrafts/<題> -DryRun   # 作らずに下書きだけ見る
#
# 最後の行 `Result: PASS  #<番号> <URL>（条件 <n> 行・守る <n>）`／`Result: FAIL  <理由>`（0・1）。FAIL でも Issue を作った後なら番号を出す。
param(
    [Parameter(Mandatory)][string]$Draft,
    [string[]]$Change = @(),
    [string]$Label = 'claude-run',
    [int]$WaitSeconds = 90,
    [switch]$DryRun   # 1 の確かめだけ（作らない）
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. (Join-Path $PSScriptRoot 'issue-gh.ps1')

$Draft = $Draft -replace '\.(md|title\.txt|check\.ps1)$', ''
$titleFile = "$Draft.title.txt"; $bodyFile = "$Draft.md"; $checkFile = "$Draft.check.ps1"
foreach ($f in $titleFile, $bodyFile) { if (-not (Test-Path -LiteralPath $f)) { Write-Result 'FAIL' "下書きが無い: $f" 1 } }
$title = (Get-Content -LiteralPath $titleFile -Raw -Encoding utf8).Trim()
$body = (Get-Content -LiteralPath $bodyFile -Raw -Encoding utf8) -replace "`r", ''

# --- 1. 確認コマンド ---
$m = [regex]::Match($body, '(?ms)^```(?:pwsh|powershell)\s*$(.*?)^```')
if (-not $m.Success) { Write-Result 'FAIL' '本文に ```pwsh の確認コマンドが無い' 1 }
$check = $m.Groups[1].Value.Trim()
$t = $null; $e = $null
$null = [System.Management.Automation.Language.Parser]::ParseInput($check, [ref]$t, [ref]$e)
if ($e.Count) { Write-Result 'FAIL' "確認コマンドの構文の誤り $($e.Count) 個: $($e[0].Message)" 1 }
if (Test-Path -LiteralPath $checkFile) {
    $file = ((Get-Content -LiteralPath $checkFile -Raw -Encoding utf8) -replace "`r", '').Trim()
    if ($file -ne $check) { Write-Result 'FAIL' "本文の確認コマンドが $checkFile と違う（下書きを作り直す）" 1 }
}
Write-Host "確認コマンド: 構文 OK・守る $(@([regex]::Matches($check, '(?m)^# 守る:')).Count) 行"
# issue-run.ps1 が実際に守る物（パスのまま書いた管理下のファイル）を同じ関数で出し、宣言（# 守る: の行）と比べる
. (Join-Path $PSScriptRoot 'issue-protect.ps1')
$prot = @(Get-ProtectedFiles $check $root)
$decl = @([regex]::Matches($check, '(?m)^# 守る:\s*(\S+)') | ForEach-Object { $_.Groups[1].Value -replace '\\', '/' -replace '^(\./|/)+', '' })
$undecl = @($prot | Where-Object { $decl -notcontains $_ })
if ($undecl.Count) { Write-Result 'FAIL' "確認コマンドにパスのまま書いた管理下のファイルが「# 守る:」に無い: $($undecl -join ', ')（守るなら # 守る: に書く。直す・消す・作る物は変数で指す）" 1 }
$hit = @($Change | Where-Object { $prot -contains ($_ -replace '\\', '/') })
if ($hit.Count) { Write-Result 'FAIL' "直させるファイルが守るファイルに入っている: $($hit -join ', ')（パスを丸ごと書かず、フォルダーを変数に入れる）" 1 }
if ($DryRun) { Write-Result 'PASS' "下書き OK（作っていない）: $title" 0 }

# --- 2. 作る ---
$url = [string](Invoke-Gh issue create --title $title --body-file $bodyFile --label $Label | Select-Object -Last 1)
if ($url -notmatch '/issues/(\d+)') { Write-Result 'FAIL' "作った Issue の URL が読めない: $url" 1 }
$num = [int]$Matches[1]
Write-Host "作った: #$num $url"

# --- 3. 無人の回が拾えるまで待つ ---
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$dry = ''
do {
    $dry = (& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'issue-run.ps1') -Issue $num -DryRun -WorkDir $root 2>&1 | Out-String)
    if ($dry -match "対象 1 件: #$num\b") { break }
    Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)
if ($dry -notmatch "対象 1 件: #$num\b") { Write-Result 'FAIL' "#$num $url — $WaitSeconds 秒たっても issue-run の対象に出ない（あとで issue-run.ps1 -Issue $num -DryRun で見る）" 1 }

# --- 4. 中身 ---
$lines = $dry -split "`r?`n"
$head = $lines | Where-Object { $_ -match "^#$num 合格の条件" } | Select-Object -First 1
$prot = $lines | Where-Object { $_ -match '^\s+守るファイル: ' } | Select-Object -First 1
$protList = if ($prot) { @(($prot -replace '^\s+守るファイル: ', '') -split ',\s*' | Where-Object { $_ }) } else { @() }
Write-Host $head
$hit = @($Change | Where-Object { $protList -contains ($_ -replace '\\', '/') })
if ($hit.Count) { Write-Result 'FAIL' "#$num $url — 直させるファイルが守るファイルに入っている: $($hit -join ', ')（パスを丸ごと書かず、フォルダーを変数に入れる）" 1 }
if ($head -notmatch '確認コマンド あり') { Write-Result 'FAIL' "#$num $url — issue-run が確認コマンドを読めない: $head" 1 }
$n = if ($head -match '合格の条件 (\d+) 行') { $Matches[1] } else { '?' }
Write-Result 'PASS' "#$num $url（条件 $n 行・守る $($protList.Count)）" 0
