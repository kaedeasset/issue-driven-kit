#Requires -Version 7
# call-function.ps1 — Unity 版の脚本（既定は issue-run.ps1）から、名前を指した関数だけを構文木で取り出して読み込み、-Code を回す。
# 脚本の本体（gh・ロック・claude -p）は回さない。外に触る所（Get-CimInstance・Get-GitTop など）は -Code の中で先に
# 偽の関数を定義して差し替える（取り出した関数は、偽の関数より後に読み込まないよう -Stubs で先に回す）。
#   -Names  取り出す関数の名前（カンマ区切り）
#   -Script 取り出す元の脚本の名前（editions/unity/files/Scripts/ の中。省略すると issue-run.ps1）
#   -Stubs  先に回す偽の定義（省略可）
#   -Code   取り出した後に回すコード。出力が試験の答え
param([Parameter(Mandatory)][string]$Names, [string]$Script = 'issue-run.ps1', [string]$Stubs = '', [Parameter(Mandatory)][string]$Code)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$kit = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $kit "editions/unity/files/Scripts/$Script"), [ref]$null, [ref]$null)
$want = @($Names -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$found = @($ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -in $want }, $true))
$missing = @($want | Where-Object { $_ -notin $found.Name })
if ($missing.Count) { Write-Host "関数が無い: $($missing -join ', ')"; exit 2 }
if ($Stubs) { . ([scriptblock]::Create($Stubs)) }
foreach ($fn in $found) { . ([scriptblock]::Create($fn.Extent.Text)) }
. ([scriptblock]::Create($Code))
exit 0
