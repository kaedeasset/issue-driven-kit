# issue-close.ps1 — 合格（claude-done）の Issue に決まった形のコメントを付けて閉じる（.claude/skills/github-issue の C の 4）。
#
# Issue を閉じるのは外への書き込み。ユーザーが「閉じて」と言ったときだけ回す（CLAUDE.md 原則 1）。
# claude-done が付いていない Issue は閉じない（-Force で閉じる。そのときはコメントに理由を書く）。
#
#   pwsh -NoProfile -File Scripts/issue-close.ps1 -Issue 1,2,3 -Note '人の確かめは EXE で OK'
#
# 最後の行 `Result: PASS  閉じた #1 #2`（0）・`Result: FAIL  …`（1）。
param(
    [Parameter(Mandatory)][string[]]$Issue,
    [string]$Note = '',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
. (Join-Path $PSScriptRoot 'issue-gh.ps1')

$nums = @($Issue | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().TrimStart('#') } | Where-Object { $_ } | ForEach-Object { [int]$_ })
$today = Get-Date -Format 'yyyy-MM-dd'
$closed = @(); $skipped = @()
foreach ($n in $nums) {
    $v = Invoke-Gh issue view $n --json 'state,labels' | Out-String | ConvertFrom-Json
    $labels = @($v.labels | ForEach-Object { $_.name })
    if ($v.state -eq 'CLOSED') { $skipped += "#$n（もう閉じている）"; continue }
    if (-not ($labels -contains 'claude-done') -and -not $Force) { $skipped += "#$n（claude-done が無い）"; continue }
    $text = if ($labels -contains 'claude-done') { "合格（claude-done）を確認して閉じる（$today ユーザー指示）。" } else { "合格のラベルは無いが閉じる（$today ユーザー指示）。" }
    if ($Note) { $text += $Note }
    Invoke-Gh issue comment $n --body $text | Out-Null
    Invoke-Gh issue close $n | Out-Null
    $closed += "#$n"
}
if ($skipped.Count) { Write-Host "閉じなかった: $($skipped -join '・')" }
if (-not $closed.Count) { Write-Result 'FAIL' '閉じた Issue が無い' 1 }
Write-Result 'PASS' "閉じた $($closed -join ' ')" 0
