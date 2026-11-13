# issue-gh.ps1 — issue-create・issue-result・issue-close が読み込む共通の部品（. で読む。単独では使わない）。
#
# gh を探す: PATH に無いシェル（Claude Code の Bash など）でも C:\Program Files\GitHub CLI\gh.exe を使い、
# その場所を $env:PATH の先頭に足す（子で回す issue-run.ps1 の `& gh` も見つかるように。Bash で gh が無いと止まったことがある）。

$script:Gh = (Get-Command gh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $script:Gh) {
    $cand = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
    if (Test-Path -LiteralPath $cand) { $script:Gh = $cand }
}
if ($script:Gh) {
    $dir = Split-Path $script:Gh -Parent
    if (-not (($env:PATH -split ';') -contains $dir)) { $env:PATH = "$dir;$env:PATH" }
}

# 引数はそのまま gh に渡す（param を書かない: --json などを PowerShell の引数として読ませないため）
function Invoke-Gh {
    $GhArgs = @($args | ForEach-Object { [string]$_ })
    if (-not $script:Gh) { throw 'gh が無い（GitHub CLI を入れる。Docs/Guides/Working/github-repo.md）' }
    $out = & $script:Gh @GhArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "gh $($GhArgs -join ' ') が失敗: $out" }
    return $out
}

function Write-Result([string]$Status, [string]$Text, [int]$Code) { Write-Host "Result: $Status  $Text"; exit $Code }
