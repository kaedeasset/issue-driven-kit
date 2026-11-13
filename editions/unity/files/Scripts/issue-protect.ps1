# issue-protect.ps1 — 確認コマンドから「守るファイル」を出す関数 Get-ProtectedFiles（issue-run.ps1 と issue-create.ps1 が読む）。
#
# 守るファイルの決まりはここ 1 か所に置く（仕様 shared/spec/issue-run-spec.md 2.3 の Unity 版の実装）。
# 作業場所は 2 つ目の引数で受け取る（呼ぶ側の $RepoRoot を読まない）。
#
#   . (Join-Path $PSScriptRoot 'issue-protect.ps1')
#   $prot = @(Get-ProtectedFiles $check $root)

# 確認コマンドの中の語のうち、git が管理しているファイルを指すものを「守るファイル」にする。
# 管理外（ビルドで作り直される exe・生成物）は守らない（毎回変わるので合格にならなくなる）。
function Get-ProtectedFiles([string]$Code, [string]$Root) {
    $tracked = [System.Collections.Generic.HashSet[string]]::new([string[]]@(& git -C $Root ls-files), [System.StringComparer]::OrdinalIgnoreCase)
    $found = [System.Collections.Generic.List[string]]::new()
    foreach ($tok in ($Code -split '[\s;|&(){}=,]+')) {
        $p = $tok.Trim().Trim('"', "'", '`')
        if (-not $p -or $p.StartsWith('-')) { continue }
        $full = Join-Path $Root $p
        # 頭の ./ と / だけを取る。TrimStart('.', '/') は .github のような点で始まるフォルダーの点まで取り、守れなかった（2026-10-22）
        $rel = $p.Replace([char]92, [char]47) -replace '^(\./|/)+', ''
        if ((Test-Path -LiteralPath $full -PathType Leaf) -and $tracked.Contains($rel) -and -not $found.Contains($rel)) { $found.Add($rel) }
    }
    return @($found)
}
