# unity-test.ps1 — Unity をバッチモードで起動して、コンパイルの確かめかテスト（EditMode / PlayMode）を回す。
#
# 合否は最後の `Result:` 行と終了コードで読む（0 = PASS・1 = FAIL・3 = 回せなかった）。表や散文から合格と書かない。
# Issue の確認コマンド・design-cycle のテスト・commit の前の確かめは、どれもこの入口を使う（Docs/Guides/Procedures/unity-test-procedure.md）。
#
#   pwsh -NoProfile -File Scripts/unity-test.ps1                          # EditMode を全部
#   pwsh -NoProfile -File Scripts/unity-test.ps1 -Platform All            # EditMode と PlayMode
#   pwsh -NoProfile -File Scripts/unity-test.ps1 -Filter '<名前空間>.Tests.SmokeTests'   # 1 本・1 クラスだけ（名前空間.クラス[.メソッド]。; 区切り・正規表現も可）
#   pwsh -NoProfile -File Scripts/unity-test.ps1 -CompileOnly             # スクリプトがコンパイルできるかだけ
#
# pwsh 7 と Windows PowerShell 5.1 の両方で動く。5.1 は実行ポリシーが既定で Restricted（スクリプトを実行できない）なので、
# 5.1 で回すときは powershell -NoProfile -ExecutionPolicy Bypass -File … と書く（2026-10-22 にこの PC で実際に止められた）。
# Unity エディタがこのプロジェクトを開いていると、バッチモードは同じフォルダーを開けない（ロックされる）。
# そのときは起動せずに `Result: BLOCKED` で 3 を返す。エディタを勝手に閉じない（CLAUDE.md）。
# テストが 0 件のときは FAIL にする（フィルターの書き間違いで「何も回さずに合格」になるのを防ぐ）。
param(
    [ValidateSet('EditMode', 'PlayMode', 'All')]
    [string]$Platform = 'EditMode',
    [string]$Filter = '',
    [switch]$CompileOnly,
    [string]$ProjectPath = '',
    [string]$UnityExe = '',
    [int]$TimeoutMinutes = 30
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

if (-not $ProjectPath) { $ProjectPath = Split-Path $PSScriptRoot -Parent }
$ProjectPath = [System.IO.Path]::GetFullPath($ProjectPath)

function Write-Result([string]$Status, [string]$Text, [int]$Code) {
    Write-Host "Result: $Status  $Text"
    exit $Code
}

# --- エディタの場所: 引数 → 環境変数 UNITY_EXE → ProjectVersion.txt の版の Hub の既定の場所 ---
if (-not $UnityExe) { $UnityExe = $env:UNITY_EXE }
if (-not $UnityExe) {
    $verFile = Join-Path $ProjectPath 'ProjectSettings/ProjectVersion.txt'
    $ver = ((Get-Content $verFile | Where-Object { $_ -like 'm_EditorVersion:*' }) -replace '^m_EditorVersion:\s*', '').Trim()
    $UnityExe = "C:\Program Files\Unity\Hub\Editor\$ver\Editor\Unity.exe"
}
if (-not (Test-Path -LiteralPath $UnityExe)) { Write-Result 'BLOCKED' "Unity のエディタが無い: $UnityExe（-UnityExe か環境変数 UNITY_EXE で指定する）" 3 }

# --- このプロジェクトを開いている Unity がいれば回さない ---
$norm = $ProjectPath.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
$holders = @(Get-CimInstance Win32_Process -Filter "Name='Unity.exe'" -ErrorAction SilentlyContinue | Where-Object {
        # 末尾を見る: 隣の worktree（<プロジェクト>-wt2 など）を同じフォルダーと取り違えない
        $_.CommandLine -and ($_.CommandLine.Replace('\', '/').ToLowerInvariant() -match ([regex]::Escape($norm) + '/?(?=["\s]|$)'))
    })
if ($holders.Count) {
    Write-Result 'BLOCKED' ("Unity がこのプロジェクトを開いている（PID {0}）。エディタを閉じてから回す。止めない" -f (($holders | ForEach-Object { $_.ProcessId }) -join ', ')) 3
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $ProjectPath "Logs/UnityTest/$stamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Quote([string]$s) { if ($s -match '[\s"]') { '"' + $s.Replace('"', '\"') + '"' } else { $s } }

function Invoke-Unity([string[]]$UnityArgs, [string]$LogFile) {
    $all = @('-batchmode', '-projectPath', $ProjectPath, '-logFile', $LogFile) + $UnityArgs
    $argLine = ($all | ForEach-Object { Quote $_ }) -join ' '
    $p = Start-Process -FilePath $UnityExe -ArgumentList $argLine -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit($TimeoutMinutes * 60 * 1000)) {
        $p.Kill(); $p.WaitForExit()
        return -1
    }
    return $p.ExitCode
}

function Get-CompileErrors([string]$LogFile) {
    if (-not (Test-Path $LogFile)) { return @('（ログが無い）') }
    return @(Select-String -Path $LogFile -Pattern 'error CS\d+|Scripts have compiler errors' | ForEach-Object { $_.Line.Trim() } | Select-Object -Unique -First 20)
}

function Show-LogTail([string]$LogFile) {
    if (Test-Path $LogFile) { Get-Content $LogFile -Tail 25 | ForEach-Object { Write-Host "  | $_" } }
}

# --- コンパイルだけ ---
if ($CompileOnly) {
    $log = Join-Path $outDir 'compile.log'
    Write-Host "コンパイルの確かめ（ログ $log）"
    $code = Invoke-Unity @('-nographics', '-quit') $log
    $errors = Get-CompileErrors $log
    if ($code -eq -1) { Write-Result 'FAIL' "時間切れ（$TimeoutMinutes 分）" 1 }
    if ($errors.Count -or $code -ne 0) {
        $errors | ForEach-Object { Write-Host "  $_" }
        if (-not $errors.Count) { Show-LogTail $log }
        Write-Result 'FAIL' "コンパイル（exit $code・エラー $($errors.Count) 行）" 1
    }
    Write-Result 'PASS' 'コンパイル（エラー 0）' 0
}

# --- テスト ---
$platforms = if ($Platform -eq 'All') { @('EditMode', 'PlayMode') } else { @($Platform) }
$summary = @()
$failed = $false

foreach ($plat in $platforms) {
    $xml = Join-Path $outDir "$plat-results.xml"
    $log = Join-Path $outDir "$plat.log"
    $uArgs = @('-runTests', '-testPlatform', $plat, '-testResults', $xml)
    if ($plat -eq 'EditMode') { $uArgs += '-nographics' }
    if ($Filter) { $uArgs += @('-testFilter', $Filter) }
    Write-Host "$plat を回す（ログ $log）"
    $code = Invoke-Unity $uArgs $log

    if ($code -eq -1) { $summary += "$plat 時間切れ"; $failed = $true; continue }
    if (-not (Test-Path $xml)) {
        # 結果の XML が無い = テストまで行かなかった（コンパイルエラー・起動失敗）
        $errors = Get-CompileErrors $log
        $errors | ForEach-Object { Write-Host "  $_" }
        if (-not $errors.Count) { Show-LogTail $log }
        $summary += "$plat 結果なし（exit $code）"; $failed = $true; continue
    }

    [xml]$doc = Get-Content -LiteralPath $xml -Raw -Encoding UTF8
    $run = $doc.'test-run'
    $total = [int]$run.total; $pass = [int]$run.passed; $fail = [int]$run.failed; $skip = [int]$run.skipped
    foreach ($tc in @($doc.SelectNodes("//test-case[@result='Failed']"))) {
        Write-Host "  FAIL $($tc.fullname)"
        $msg = [string]$tc.failure.message
        if ($msg) { ($msg.Trim() -split "`n" | Select-Object -First 5) | ForEach-Object { Write-Host "       $_" } }
    }
    $summary += "$plat $pass/$total（失敗 $fail・飛ばし $skip）"
    if ($total -eq 0) { Write-Host "  $plat のテストが 0 件（フィルター・テストのアセンブリを確かめる）"; $failed = $true }
    elseif ($fail -gt 0 -or $code -ne 0) { $failed = $true }
}

if ($failed) { Write-Result 'FAIL' ($summary -join ' / ') 1 }
Write-Result 'PASS' ($summary -join ' / ') 0
