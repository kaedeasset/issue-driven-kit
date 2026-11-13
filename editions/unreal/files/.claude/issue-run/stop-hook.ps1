# stop-hook.ps1 — issue-run の Claude が返答を終えようとしたときに呼ばれる（Stop hook）。
# 合格していなければ {"decision":"block"} を返して、同じプロセスのまま作業を続けさせる。
# 指示文で「止まるな」と書くだけでは保証にならないので、終わってよいかを仕組みで決める。
# ここで見るのは、報告ファイルが「## 結果: 合格」・守るファイルが開始時のまま、の 2 つだけ（数秒。報告が判定不能なら押し返さない）。
# 確認コマンドは回さない。issue-run.ps1 が回の後に 1 回だけ回し、落ちれば出力を付けて同じ会話を再開する
# （2026-10-15: hook・判定役・スクリプトで 3 回回していた。重い確認が 90 分の上限の中で何度も走る）。
#
# issue-run.ps1 が環境変数で渡すもの:
#   ISSUE_RUN_PROBE      起動前の点検のときだけ。ここに印を書いて終わる（hook が読み込まれた証拠）
#   ISSUE_RUN_ROOT       リポジトリの直下（確認コマンドをここで実行する）
#   ISSUE_RUN_REPORT     報告ファイル
#   ISSUE_RUN_PROTECT    守るファイルの指紋（「SHA256<TAB>パス」の行。issue-run.ps1 の Save-ProtectSnapshot が書く）
#   ISSUE_RUN_STATE      押し返した回数を数えるファイル
#   ISSUE_RUN_MAXBLOCKS  押し返す上限（超えたら終わらせ、外側の issue-run.ps1 が続きを決める）
# 公式の上限（ツールを呼ばずに8回続けて押し返すと Claude Code が hook を無視する）とは別に、合計で数える。
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$null = [Console]::In.ReadToEnd()   # hook の入力（使わないが読み切る）

if ($env:ISSUE_RUN_PROBE) { Set-Content -Path $env:ISSUE_RUN_PROBE -Value 'stop-hook ran' -Encoding utf8; exit 0 }
if (-not $env:ISSUE_RUN_REPORT) { exit 0 }
$runDir = if ($env:ISSUE_RUN_ROOT) { $env:ISSUE_RUN_ROOT } else { (Get-Location).Path }

function Get-NotPassReason {
    $claimed = (Test-Path $env:ISSUE_RUN_REPORT) -and ((Get-Content $env:ISSUE_RUN_REPORT -Raw -Encoding utf8) -match '(?m)^##\s*結果:\s*合格\s*$')
    if (-not $claimed) { return "報告ファイル $($env:ISSUE_RUN_REPORT) に「## 結果: 合格」が無い。合格の条件を全部、実行結果で満たしてから書く。" }

    if ($env:ISSUE_RUN_PROTECT -and (Test-Path $env:ISSUE_RUN_PROTECT)) {
        $changed = @(foreach ($line in (Get-Content $env:ISSUE_RUN_PROTECT -Encoding utf8 | Where-Object { $_ })) {
                $hash, $rel = $line -split "`t", 2
                $full = Join-Path $runDir $rel
                if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { $rel; continue }
                if ((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash -ne $hash) { $rel }
            })
        if ($changed.Count) { return "確認コマンドが使うファイルを変えた: $($changed -join ', ')。合格の判定に使うファイルは変えない。git で開始時の中身に戻してから、作る側を直す。" }
    }

    return ''
}

# 判定不能（合格の条件どうし、または条件と守るファイルが両立しない）と決まった形で書いてあれば、押し返さず回数も数えない。
# 形: 行「## 結果: 判定不能」と、中身のある節「## 両立しない条件」。issue-run.ps1 の Get-UndecidableReport と同じ決まり（変えるときは両方）。
# 人が Issue の条件か守るファイルを直す。
if (Test-Path $env:ISSUE_RUN_REPORT) {
    $reportText = ([string](Get-Content $env:ISSUE_RUN_REPORT -Raw -Encoding utf8)).Replace("`r", '')
    $section = [regex]::Match($reportText, '(?m)^[ \t]*##[ \t]*両立しない条件[ \t]*$')
    if (($reportText -match '(?m)^[ \t]*##[ \t]*結果:[ \t]*判定不能[ \t]*$') -and $section.Success) {
        $body = $reportText.Substring($section.Index + $section.Length)
        $nextHead = [regex]::Match($body, '(?m)^## ')
        if ($nextHead.Success) { $body = $body.Substring(0, $nextHead.Index) }
        if ($body.Trim()) { exit 0 }
    }
}

$why = Get-NotPassReason
if (-not $why) { exit 0 }

$count = 0
if ($env:ISSUE_RUN_STATE -and (Test-Path $env:ISSUE_RUN_STATE)) { $count = [int](Get-Content $env:ISSUE_RUN_STATE -Raw) }
$count++
if ($env:ISSUE_RUN_STATE) { Set-Content -Path $env:ISSUE_RUN_STATE -Value $count -Encoding ascii }
$maxBlocks = if ($env:ISSUE_RUN_MAXBLOCKS) { [int]$env:ISSUE_RUN_MAXBLOCKS } else { 30 }
if ($count -gt $maxBlocks) { exit 0 }

$reason = "$why`nまだ終われない（無人実行・$count/$maxBlocks 回目の押し返し）。質問せず、自分で選んで進める。断られた操作は使わずに、できる作業を続ける。"
@{ decision = 'block'; reason = $reason } | ConvertTo-Json -Compress
exit 0
