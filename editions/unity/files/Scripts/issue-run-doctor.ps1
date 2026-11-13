# issue-run-doctor.ps1 — Issue 駆動（無人実行）に要るものが、この PC・この作業場所にそろっているかを点検する。
#
# 再現の手順の正: Docs/Guides/Working/issue-driven-development.md の「再現」。新しい PC・新しい worktree・
# Claude Code や gh を更新した後に、issue-run.ps1 を起動する前に回す。何も書き換えない（読むだけ）。
#
#   pwsh -NoProfile -File Scripts/issue-run-doctor.ps1                  # 点検だけ（数秒）
#   powershell -NoProfile -ExecutionPolicy Bypass -File Scripts/issue-run-doctor.ps1   # pwsh がまだ無い PC で（5.1 の既定の実行ポリシー Restricted を、この 1 回だけ外す）
#   pwsh -NoProfile -File Scripts/issue-run-doctor.ps1 -RunTests        # さらに unity-test.ps1 で EditMode を回す（1〜2 分）
#
# 1 行ずつ OK / WARN / NG を出し、最後の行が `Result: PASS`（NG 0）か `Result: FAIL  NG <n>`。終了コード 0 / 1。
# WARN は「動くが、無人で長く回すには直したほうがよい」もの（長期トークンが無い・ラベルがまだ無い など）。
# Windows PowerShell 5.1 でも動く（pwsh が無いことを NG として知らせるため）。
param([switch]$RunTests)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$Root = Split-Path $PSScriptRoot -Parent
$script:ng = 0
$script:warn = 0

function Report([string]$Level, [string]$Item, [string]$Text) {
    if ($Level -eq 'NG') { $script:ng++ } elseif ($Level -eq 'WARN') { $script:warn++ }
    Write-Host ('{0,-4} {1}: {2}' -f $Level, $Item, $Text)
}

function Find-Exe([string]$Name, [string[]]$Candidates) {
    $c = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return $c.Source }
    foreach ($p in $Candidates) { if (Test-Path -LiteralPath $p) { return $p } }
    return $null
}

# --- 道具 ---
$pwsh = Find-Exe 'pwsh' @("$env:ProgramFiles\PowerShell\7\pwsh.exe", "$env:LOCALAPPDATA\Microsoft\WindowsApps\pwsh.exe")
if ($pwsh) { Report 'OK' 'pwsh' ("{0}（{1}）" -f (& $pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'), $pwsh) }
else { Report 'NG' 'pwsh' 'PowerShell 7 が無い。issue-run.ps1 は 7 でしか動かない → winget install --id Microsoft.PowerShell -e' }

$git = Find-Exe 'git' @()
if ($git) { Report 'OK' 'git' (& git --version) } else { Report 'NG' 'git' 'git が無い → winget install --id Git.Git -e' }

$gh = Find-Exe 'gh' @("$env:ProgramFiles\GitHub CLI\gh.exe")
if (-not $gh) { Report 'NG' 'gh' 'GitHub CLI が無い → winget install --id GitHub.cli -e' }
else {
    Report 'OK' 'gh' ((& $gh --version | Select-Object -First 1) + "（$gh）")
    if (-not (Get-Command gh -CommandType Application -ErrorAction SilentlyContinue)) {
        Report 'NG' 'gh の PATH' 'この窓の PATH に gh が無い（issue-run.ps1 は gh を名前で呼ぶ）。入れた後に開いた新しい窓で回す'
    }
    $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $auth = (& $gh auth status 2>&1 | Out-String)
    $authCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    if ($authCode -ne 0) { Report 'NG' 'gh のログイン' 'ログインしていない → gh auth login（ブラウザが開かなければ https://github.com/login/device にコードを入れる）' }
    elseif ($auth -notmatch "'repo'") { Report 'NG' 'gh のログイン' "権限 repo が無い → gh auth refresh -s repo" }
    else { Report 'OK' 'gh のログイン' (([regex]::Match($auth, 'account (\S+)')).Groups[1].Value + '・権限 repo あり') }
}

$claude = Find-Exe 'claude' @("$env:USERPROFILE\.local\bin\claude.exe")
if ($claude) { Report 'OK' 'claude' (& $claude --version) } else { Report 'NG' 'claude' 'Claude Code が無い（https://code.claude.com の手順で入れる）' }
if ([Environment]::GetEnvironmentVariable('CLAUDE_CODE_OAUTH_TOKEN', 'User') -or $env:CLAUDE_CODE_OAUTH_TOKEN) { Report 'OK' '長期トークン' 'CLAUDE_CODE_OAUTH_TOKEN がある' }
else { Report 'WARN' '長期トークン' "CLAUDE_CODE_OAUTH_TOKEN が無い。無人の claude -p は対話のログインと別に切れることがある（元のプロジェクトで 2026-10-14 に切れた）→ claude setup-token → [Environment]::SetEnvironmentVariable('CLAUDE_CODE_OAUTH_TOKEN','<トークン>','User')" }

# --- 作業場所 ---
if ($git) {
    $top = (& git -C $Root rev-parse --show-toplevel 2>$null)
    if (-not $top) { Report 'NG' 'git の作業場所' "$Root が git の作業フォルダーでない" }
    else {
        Report 'OK' 'git の作業場所' ("{0}（{1}）" -f $top, (& git -C $Root branch --show-current))
        $origin = [string](& git -C $Root remote get-url origin 2>$null)
        $om = [regex]::Match($origin, 'github\.com[:/]([^/]+)/(.+?)(?:\.git)?/?$')
        if (-not $om.Success) { Report 'NG' 'origin' "GitHub でない（'$origin'）→ Docs/Guides/Working/github-repo.md §1" }
        else {
            $repo = "$($om.Groups[1].Value)/$($om.Groups[2].Value)"
            Report 'OK' 'origin' $repo
            if ($gh -and $authCode -eq 0) {
                $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
                $labels = @((& $gh label list --repo $repo --limit 200 --json name 2>$null | Out-String | ConvertFrom-Json) | ForEach-Object { $_.name })
                $ErrorActionPreference = $prevEap
                $missing = @('claude-run', 'claude-working', 'claude-done', 'claude-failed' | Where-Object { $labels -notcontains $_ })
                if ($missing.Count) { Report 'WARN' 'ラベル' ("まだ無い: {0}（issue-run.ps1 の最初の実行で作られる。Issue に claude-run を付けるには先に要る → gh label create claude-run --repo $repo）" -f ($missing -join ', ')) }
                else { Report 'OK' 'ラベル' 'claude-run・claude-working・claude-done・claude-failed' }
            }
        }
        $dirty = @(& git -C $Root status --porcelain)
        if ($dirty.Count) { Report 'WARN' '作業ツリー' "未コミットが $($dirty.Count) 件。無人の回のコミットと混ざる" } else { Report 'OK' '作業ツリー' '変更 0' }
    }
}

# --- 部品 ---
foreach ($f in '.claude/issue-run/prompt.md', '.claude/issue-run/stop-hook.ps1', '.github/ISSUE_TEMPLATE/claude-run.md', 'Scripts/issue-run.ps1', 'Scripts/unity-test.ps1') {
    if (Test-Path -LiteralPath (Join-Path $Root $f)) { Report 'OK' '部品' $f } else { Report 'NG' '部品' "$f が無い" }
}
$settingsPath = Join-Path $Root '.claude/issue-run/settings.json'
if (-not (Test-Path -LiteralPath $settingsPath)) { Report 'NG' '設定' '.claude/issue-run/settings.json が無い' }
else {
    $raw = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8
    try {
        $s = $raw | ConvertFrom-Json
        $deny = @($s.permissions.deny)
        # Docs/InSpecs は人が書く入力の文書の唯一の置き場（2026-10-22 ユーザー指示）。無人の Claude にも書かせない
        $need = 'AskUserQuestion', 'Bash(git push:*)', 'PowerShell(git push:*)', 'Edit(//{{REPO}}/CLAUDE.md)', 'Write(//{{REPO}}/.claude/**)', 'Edit(//{{REPO}}/Docs/InSpecs/**)', 'Write(//{{REPO}}/Docs/InSpecs/**)'
        $lack = @($need | Where-Object { $deny -notcontains $_ })
        if ($lack.Count) { Report 'NG' '設定' ("deny に無い: {0}" -f ($lack -join ', ')) }
        elseif ($deny -contains 'Edit(CLAUDE.md)' -or $deny -contains 'Edit(**/CLAUDE.md)') { Report 'NG' '設定' '裸の CLAUDE.md の deny がある（どの深さにも効き、作る物の中の CLAUDE.md まで断る。元のプロジェクトで実際に断られた）' }
        elseif ($raw -notmatch '\{\{STOP_HOOK\}\}') { Report 'NG' '設定' 'Stop hook の {{STOP_HOOK}} が無い' }
        else { Report 'OK' '設定' "deny $($deny.Count) 個・Stop hook・env $(@($s.env.PSObject.Properties).Count) 個" }
    } catch { Report 'NG' '設定' "JSON として読めない: $($_.Exception.Message)" }
}

# --- Unity ---
$verFile = Join-Path $Root 'ProjectSettings/ProjectVersion.txt'
if (Test-Path $verFile) {
    $ver = ((Get-Content $verFile | Where-Object { $_ -like 'm_EditorVersion:*' }) -replace '^m_EditorVersion:\s*', '').Trim()
    $unity = if ($env:UNITY_EXE) { $env:UNITY_EXE } else { "$env:ProgramFiles\Unity\Hub\Editor\$ver\Editor\Unity.exe" }
    if (Test-Path -LiteralPath $unity) { Report 'OK' 'Unity' "$ver（$unity）" } else { Report 'NG' 'Unity' "プロジェクトの版 $ver のエディタが無い（$unity）→ Unity Hub で入れるか、環境変数 UNITY_EXE で指す" }
    $norm = $Root.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
    $holders = @(Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -and ($_.CommandLine.Replace('\', '/').ToLowerInvariant() -match ([regex]::Escape($norm) + '/?(?=["\s]|$)'))
        })
    if ($holders.Count) { Report 'WARN' 'Unity の使用中' "エディタがこの作業場所を開いている（PID $(($holders | ForEach-Object { $_.ProcessId }) -join ', ')）。この作業場所で無人の回を起動すると、テストが BLOCKED になる" }
    else { Report 'OK' 'Unity の使用中' 'この作業場所を開いている Unity は無い' }
    if (-not (Test-Path (Join-Path $Root 'Library'))) { Report 'WARN' 'Library' 'まだ無い（初めての取り込みで数分かかる）。先に unity-test.ps1 -CompileOnly を 1 回回しておくと無人の回の時間を使わない' }
}

if ($RunTests) {
    if (-not $pwsh) { Report 'NG' 'テスト' 'pwsh が無いので回さない' }
    else {
        $out = & $pwsh -NoProfile -File (Join-Path $Root 'Scripts/unity-test.ps1') 2>&1 | Out-String
        $last = ($out.Trim() -split "`n" | Select-Object -Last 1).Trim()
        if ($LASTEXITCODE -eq 0) { Report 'OK' 'テスト' $last } else { Report 'NG' 'テスト' $last }
    }
}

if ($script:ng) { Write-Host "Result: FAIL  NG $($script:ng)・WARN $($script:warn)"; exit 1 }
Write-Host "Result: PASS  WARN $($script:warn)"
exit 0
