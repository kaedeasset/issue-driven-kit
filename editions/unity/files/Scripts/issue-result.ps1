# issue-result.ps1 — 無人の回が終わったと言われたときに、Issue の結果をまとめて見る（読むだけ）。
#
# 「終わった」と言われて見ると、まだ回っていなかったことがある。そこで「回った跡」から見る:
#   Issue の状態とラベル・issue-run.ps1 の最後のコメント（頭の 1 行と ## 結果）・その回のコミットが手元にあるか・
#   まだコミットしていないまとめ（Docs/Reports/YYYY/MM/DD/NN-issue-run.md）
#
#   pwsh -NoProfile -File Scripts/issue-result.ps1 -Issue 3
#   pwsh -NoProfile -File Scripts/issue-result.ps1 -Issue 3 -Full      # コメントを全部出す
#
# 最後の行 `Result: PASS  #<n> 合格（claude-done）…`（0）・`Result: FAIL  #<n> 未合格（claude-failed）…`（1）・
# `Result: RUNNING  #<n> いま回っている…`（2。ラベル claude-working か Logs/IssueRun/run.issue がその番号）・`Result: NOTRUN  #<n> まだ回っていない…`（2）。
param(
    [Parameter(Mandatory)][int]$Issue,
    [switch]$Full
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. (Join-Path $PSScriptRoot 'issue-gh.ps1')

$v = Invoke-Gh issue view $Issue --json 'number,title,state,labels,comments,url' | Out-String | ConvertFrom-Json
$labels = @($v.labels | ForEach-Object { $_.name })
Write-Host "#$($v.number) $($v.title)"
Write-Host "  $($v.state)・ラベル $($labels -join ', ')・$($v.url)"

$runs = @($v.comments | Where-Object { $_.body -like 'issue-run.ps1*' })
# 動いている最中（issue-run.ps1 が claude-working を付けている）。コメントは終わってから付く
$nowRunning = (Test-Path Logs/IssueRun/run.issue) -and ((Get-Content Logs/IssueRun/run.issue -Raw).Trim() -eq "$Issue")
if ($labels -contains 'claude-working' -or $nowRunning) {
    $last = Get-ChildItem Logs/IssueRun -Directory -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
    $rep = if ($last) { Get-ChildItem $last.FullName -Filter "issue-$Issue-report.md" -ErrorAction SilentlyContinue } else { $null }
    $head = if ($rep) { (Get-Content $rep.FullName -TotalCount 1 -Encoding utf8) } else { '（報告はまだ無い）' }
    $since = if ($last) { [int]((Get-Date) - $last.CreationTime).TotalMinutes } else { '?' }
    Write-Result 'RUNNING' "#$Issue いま回っている（$($last.Name) から $since 分・報告の頭: $head）。終わるとコメントとラベル claude-done／claude-failed が付く" 2
}
if (-not $runs.Count) {
    $last = Get-ChildItem Logs/IssueRun -Directory -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
    $lock = Test-Path Logs/IssueRun/run.issue
    $running = if ($lock) { "・いま動いている回の番号 $((Get-Content Logs/IssueRun/run.issue -Raw).Trim())" } else { '' }
    Write-Result 'NOTRUN' "#$Issue まだ回っていない（issue-run のコメントが無い・最新の回 $($last.Name)$running）。別の窓で pwsh Scripts\issue-run.ps1 -Issue $Issue" 2
}

$c = $runs[-1].body -replace "`r", ''
$first = ($c -split "`n")[0]
Write-Host ''
Write-Host $first
if ($Full) { Write-Host $c }
else {
    $res = [regex]::Match($c, '(?ms)^## 結果.*?(?=^## やったこと|\z)').Value.Trim()
    if ($res) { Write-Host $res }
    foreach ($sec in '選んだこと', '未採用の改善') {
        $s = [regex]::Match($c, "(?ms)^## $sec.*?(?=^## |\z)").Value.Trim()
        if ($s) { Write-Host ''; Write-Host $s }
    }
}

# その回のコミットが手元のブランチにあるか
if ($first -match '・HEAD ([0-9a-f]{7,40})') {
    $sha = $Matches[1]
    & git cat-file -e "$sha^{commit}" 2>$null
    $have = $LASTEXITCODE -eq 0
    if ($have) { & git merge-base --is-ancestor $sha HEAD 2>$null; $have = $LASTEXITCODE -eq 0 }
    Write-Host ''
    Write-Host ("コミット {0}: {1}" -f $sha.Substring(0, 7), $(if ($have) { 'このブランチにある' } else { 'このブランチに無い（別の worktree の回か、まだ取り込んでいない）' }))
}

# issue-run.ps1 が書くまとめ（Docs/Reports/YYYY/MM/DD/NN-issue-run.md）のうち、まだコミットしていない物
$untracked = @(git status --porcelain --untracked-files=all -- Docs/Reports | Where-Object { $_ -match '^\?\? .*-issue-run\.md$' } | ForEach-Object { $_.Substring(3) })
if ($untracked.Count) { Write-Host "まだコミットしていないまとめ: $($untracked -join ', ')" }

if ($labels -contains 'claude-done') { Write-Result 'PASS' "#$Issue 合格（claude-done）・$($v.state)" 0 }
if ($labels -contains 'claude-failed') { Write-Result 'FAIL' "#$Issue 未合格（claude-failed）。理由はコメント" 1 }
Write-Result 'NOTRUN' "#$Issue 回った跡はあるが、合否のラベルが無い（途中で止まった・いま回っている）" 2
