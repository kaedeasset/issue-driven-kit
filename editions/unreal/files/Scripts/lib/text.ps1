# text.ps1 — BOM 無し UTF-8 で書く唯一の定義（Scripts の ps1 はファイルも標準入出力もこれを使う）。
# 使う側は dot-source する: . (Join-Path $PSScriptRoot 'lib/text.ps1')。関数と変数だけ。副作用なし。
#
#   $Utf8NoBom              BOM 無し UTF-8 の Encoding（[Console]::OutputEncoding・ProcessStartInfo・StreamWriter に渡す）
#   Save-AdvText $Path $Text  同じフォルダの一時ファイルに書き切ってから置き換える（途中で止まっても既存の記録を切り詰めない）
#   Save-AdvJson $Path $Obj   ConvertTo-Json -Depth 40・改行は LF・末尾に改行 1 つ

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Save-AdvText([string]$Path, [string]$Text) {
    $target = [IO.Path]::GetFullPath($Path)
    $temp = $target + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        # 変数でなくその場で作る（呼び出し元の範囲に $Utf8NoBom が見えないとき、例えば ScriptBlock を別の所で動かす試験でも書けるように）
        [IO.File]::WriteAllText($temp, $Text, [System.Text.UTF8Encoding]::new($false))
        [IO.File]::Move($temp, $target, $true)
    } finally {
        if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) }
    }
}
function Save-AdvJson([string]$Path, $Obj) {
    # PowerShell 7 の ConvertTo-Json は非 ASCII をそのまま書く。BOM 無し UTF-8・LF。
    $txt = ($Obj | ConvertTo-Json -Depth 40).Replace("`r`n", "`n")
    Save-AdvText $Path ($txt + "`n")
}
