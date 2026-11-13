# Sync-Lanes.ps1 — レーン同期。各レーン（worktree のブランチ）を main に入れ、その main を各レーンに入れる。
#
# 元は Unreal Engine のプロジェクトの Scripts/Sync-Lanes.ps1（origin/main 3cdd050b・2026-09-16 新設）。Unity 向けに変えたのは
# 「次に要る作業（next）」の判定（bake・UE ビルド → テスト・パッケージ）と、Unity エディタが開いているレーンの知らせの 2 点。
# レーンの決まりの正: Docs/Guides/Working/worktree-lanes.md。手順はスキル .claude/skills/lane-sync/SKILL.md。
#
# 統合セッション（main の worktree）から 1 回だけ叩く。レーンのセッションは叩かない（セッションは自分の worktree から出ない）。
#
#   pwsh .\Scripts\Sync-Lanes.ps1            # 実行
#   pwsh .\Scripts\Sync-Lanes.ps1 -DryRun    # 何が起きるかだけ出す（git を書き換えない）
#
# やること（順番が契約）
#   0. 前提を確かめる。main の worktree にいる・main に追跡ファイルの未コミット変更が無い・
#      各レーンの worktree が clean。破れていたら該当レーンは SKIP（main が汚れていれば全部止める）
#   1. レーン → main   : main で `git merge --no-edit <lane>`。ff できれば ff、できなければマージコミット。
#                        衝突したら `git merge --abort` して FAIL（他レーンは続ける）
#   2. main → レーン   : 各 worktree で `git merge --ff-only main`。1 の後は main ⊇ レーンなので必ず ff
#   3. 取り込んだ差分の中身を見て、レーン側で次に要る作業（テスト / パッケージ）を出す
#
# 出すもの
#   レーンごとの表と、最後に `Result: PASS` か `Result: FAIL`。合否はこの行だけで読む。
#   終了コード 0 = 全レーン同期済み（SKIP も 0 件）。それ以外は 1。
#
# Unity について
#   Library/ は worktree ごとに別実体（git に入らない）。取り込んだ後に Unity がそのレーンを開くと、変わったアセットを
#   取り込み直す。エディタが開いているレーンでは、同期の後にエディタ側で取り込みが走る（止めない・閉じない）。
#   C# や Packages が動いたレーンは、そのレーンのセッションが作業前に unity-test.ps1 を回す（ここでは印を出すだけ）。
param([switch]$DryRun)

# 'Stop' にしない: git が標準エラーに書く進み具合（Fast-forward など）で止まらないよう、終了コードは RunGit が見る
$ErrorActionPreference = 'Continue'
# 出力を UTF-8 に（Git Bash などから呼ぶと既定の CP932 で日本語が化ける。unity-test.ps1 と同じ）
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$Root = Split-Path $PSScriptRoot -Parent

# 関数名を git にしない（PowerShell は関数がコマンドより優先・大文字小文字も区別しない＝自分を呼んで無限再帰する）
function RunGit { param([string]$Dir, [Parameter(ValueFromRemainingArguments)][string[]]$GitArgs)
    $out = & git.exe -C $Dir @GitArgs 2>&1
    return [pscustomobject]@{ Code = $LASTEXITCODE; Text = (($out | ForEach-Object { "$_" }) -join "`n") }
}

# この worktree のフォルダーを開いている Unity エディタの PID（無ければ空）。隣の worktree と取り違えないよう末尾を見る
function Get-UnityHolder([string]$Dir) {
    $norm = $Dir.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
    @(Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -and ($_.CommandLine.Replace('\', '/').ToLowerInvariant() -match ([regex]::Escape($norm) + '/?(?=["\s]|$)'))
        } | ForEach-Object { $_.ProcessId }) -join ','
}

# ---- 0. 前提 -------------------------------------------------------------------------------
$fail = New-Object System.Collections.Generic.List[string]

$mainBranch = (RunGit $Root rev-parse --abbrev-ref HEAD).Text.Trim()
if ($mainBranch -ne 'main') { Write-Host "Result: FAIL  main の worktree ではない（HEAD=$mainBranch）。$Root から叩く"; exit 1 }

$mainDirty = (RunGit $Root status --porcelain --untracked-files=no).Text.Trim()
if ($mainDirty) {
    Write-Host "main に追跡ファイルの未コミット変更がある。先にコミットする（スキル lane-sync の手順 1）:"
    Write-Host $mainDirty
    Write-Host "Result: FAIL  main dirty"
    exit 1
}
$mainUntracked = (RunGit $Root status --porcelain --untracked-files=all).Text -split "`n" | Where-Object { $_ -like '??*' }
if ($mainUntracked) {
    Write-Host "main の未追跡ファイル（同期は止めない。コミットするか捨てるかは手順 1 で決める）:"
    $mainUntracked | ForEach-Object { Write-Host "  $_" }
}

# worktree 一覧（porcelain）。main 以外がレーン。
$lanes = @()
$cur = @{}
foreach ($line in ((RunGit $Root worktree list --porcelain).Text -split "`n")) {
    if ($line -like 'worktree *') { $cur = @{ Path = $line.Substring(9) } }
    elseif ($line -like 'branch *') { $cur.Branch = $line.Substring(7) -replace '^refs/heads/', '' }
    elseif ($line -eq '') { if ($cur.Path -and $cur.Branch -and $cur.Branch -ne 'main') { $lanes += [pscustomobject]$cur }; $cur = @{} }
}
if ($cur.Path -and $cur.Branch -and $cur.Branch -ne 'main') { $lanes += [pscustomobject]$cur }
if ($lanes.Count -eq 0) { Write-Host "Result: FAIL  レーンの worktree が見つからない（まだ作っていなければ Docs/Guides/Working/worktree-lanes.md の「レーンを作る」）"; exit 1 }

$mainBefore = (RunGit $Root rev-parse --short HEAD).Text.Trim()
$rows = @()
foreach ($l in $lanes) {
    $dirty = (RunGit $l.Path status --porcelain).Text.Trim()
    $rows += [pscustomobject]@{
        Lane    = Split-Path $l.Path -Leaf
        Branch  = $l.Branch
        Path    = $l.Path
        Before  = (RunGit $l.Path rev-parse --short HEAD).Text.Trim()
        Ahead   = [int](RunGit $Root rev-list --count "main..$($l.Branch)").Text.Trim()   # レーン独自
        Behind  = [int](RunGit $Root rev-list --count "$($l.Branch)..main").Text.Trim()   # main 独自
        Dirty   = $dirty
        Unity   = Get-UnityHolder $l.Path
        ToMain  = ''
        ToLane  = ''
        After   = ''
        Next    = ''
    }
}

Write-Host ("main {0}  レーン {1} 本" -f $mainBefore, $rows.Count)
foreach ($r in $rows) {
    $d = if ($r.Dirty) { 'DIRTY' } else { 'clean' }
    $u = if ($r.Unity) { "  Unity 使用中（PID $($r.Unity)）" } else { '' }
    Write-Host ("  {0,-24} {1,-28} {2}  レーン独自 {3} / main独自 {4}  {5}{6}" -f $r.Lane, $r.Branch, $r.Before, $r.Ahead, $r.Behind, $d, $u)
    if ($r.Dirty) { Write-Host ($r.Dirty -split "`n" | ForEach-Object { "      $_" }) }
}

if ($DryRun) { Write-Host "Result: DRY-RUN  (git は書き換えていない)"; exit 0 }

# ---- 1. レーン → main ------------------------------------------------------------------------
foreach ($r in $rows) {
    if ($r.Dirty) { $r.ToMain = 'SKIP(dirty)'; $fail.Add("$($r.Lane): worktree が汚れている。レーンのセッションがコミットしてから"); continue }
    if ($r.Ahead -eq 0) { $r.ToMain = 'nothing'; continue }
    $m = RunGit $Root merge --no-edit $r.Branch
    if ($m.Code -ne 0) {
        RunGit $Root merge --abort | Out-Null
        $r.ToMain = 'CONFLICT'
        $fail.Add("$($r.Lane): main へのマージが衝突。abort 済み。手で解く（シーン・プレハブの衝突は YAML を手で混ぜない）:`n$($m.Text)")
        continue
    }
    $r.ToMain = if ($m.Text -match 'Fast-forward') { "ff(+$($r.Ahead))" } else { "merge(+$($r.Ahead))" }
}
$mainAfter = (RunGit $Root rev-parse --short HEAD).Text.Trim()

# ---- 2. main → レーン ------------------------------------------------------------------------
foreach ($r in $rows) {
    if ($r.ToMain -like 'SKIP*' -or $r.ToMain -eq 'CONFLICT') { $r.ToLane = 'SKIP'; $r.After = $r.Before; continue }
    $m = RunGit $r.Path merge --ff-only main
    if ($m.Code -ne 0) {
        $r.ToLane = 'FAIL'
        $r.After = (RunGit $r.Path rev-parse --short HEAD).Text.Trim()
        $fail.Add("$($r.Lane): main の ff 取り込みに失敗:`n$($m.Text)")
        continue
    }
    $r.After = (RunGit $r.Path rev-parse --short HEAD).Text.Trim()
    $r.ToLane = if ($m.Text -match 'Already up to date') { 'up-to-date' } else { 'ff' }

    # ---- 3. レーン側で次に要る作業（取り込んだ差分のパスで決める） ----
    if ($r.Before -ne $r.After) {
        $files = (RunGit $r.Path diff --name-only "$($r.Before)..$($r.After)").Text -split "`n" | Where-Object { $_ }
        $next = @()
        # パッケージが動いた → Unity が開くときに解決し直す（初回は時間がかかる）
        if ($files | Where-Object { $_ -like 'Packages/*' }) { $next += 'パッケージ' }
        # C#・アセンブリの定義・設定・Assets が動いた → そのレーンでテスト
        if ($files | Where-Object { $_ -match '\.(cs|asmdef|asmref)$' -or $_ -like 'Assets/*' -or $_ -like 'ProjectSettings/*' -or $_ -like 'Packages/*' }) { $next += 'テスト' }
        $r.Next = if ($next) { $next -join '+' } else { '-' }
    } else { $r.Next = '-' }
}

# ---- 出力 ------------------------------------------------------------------------------------
Write-Host ""
Write-Host ("main: {0} -> {1}" -f $mainBefore, $mainAfter)
Write-Host ("{0,-24} {1,-28} {2,-9} {3,-12} {4,-12} {5,-9} {6}" -f 'lane', 'branch', 'before', 'lane->main', 'main->lane', 'after', 'next')
foreach ($r in $rows) {
    Write-Host ("{0,-24} {1,-28} {2,-9} {3,-12} {4,-12} {5,-9} {6}" -f $r.Lane, $r.Branch, $r.Before, $r.ToMain, $r.ToLane, $r.After, $r.Next)
}
if ($rows | Where-Object { $_.Next -like '*テスト*' }) {
    Write-Host ""
    Write-Host "next=テスト のレーンは、そのレーンのセッションが作業前に pwsh -NoProfile -File Scripts/unity-test.ps1 を回す（Library/ は worktree ごとに別。初回の取り込みは長い）。"
}
if ($rows | Where-Object { $_.Unity -and $_.ToLane -eq 'ff' }) {
    Write-Host "Unity が開いているレーンは、エディタが変わったアセットを取り込み直す（止めない・閉じない）。"
}

Write-Host ""
if ($fail.Count -gt 0) {
    $fail | ForEach-Object { Write-Host "FAIL: $_" }
    Write-Host ("Result: FAIL  {0}/{1} レーン未同期" -f $fail.Count, $rows.Count)
    exit 1
}
Write-Host ("Result: PASS  {0} レーンすべて {1}" -f $rows.Count, $mainAfter)
exit 0
