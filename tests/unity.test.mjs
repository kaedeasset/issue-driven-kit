// unity.test.mjs — Unity 版の無人の回（editions/unity/files/Scripts/issue-run.ps1）に入れた改善の試験（node --test tests/）。
// 設計 docs/design/unity-edition-decoupling-design.md の 3.4（A1〜A5）と 3.7（U3 の試験の名前）。
//   A1  エディタが開いていたら Issue を始めず BLOCKED（終了コード 3）で終わる（Get-UnityHolders を回して確かめる）
//   A2  残った実行中のラベルを、対象を数える前に外す（並び順を見る）
//   A3  無人の回の中（ISSUE_RUN_ROOT）では作業場所を聞かない（Resolve-WorkRoot・Invoke-PassCheck を回して確かめる）
//   A4  点検（-DryRun）は実行中のロックで止めない
//   A5  UNITY_EXE をユーザーの環境変数から読み、gh を PATH の外でも見つける
// 関数を回す分は Windows と pwsh があるときだけ（tests/unity/call-function.ps1 で構文木から取り出す）。文字列と並び順はいつも見る。
// 外に触る所（gh・Unity・Get-CimInstance）は回さない。npm のパッケージは使わない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { runWithRetry } from './helpers.mjs';

const kit = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = readFileSync(join(kit, 'editions/unity/files/Scripts/issue-run.ps1'), 'utf8').replace(/\r/g, '');
const lines = script.split('\n');
const isComment = (l) => /^\s*#/.test(l);
// 最初に当たった、注釈でない行の番号（0 始まり）。無ければ -1
const lineOf = (pred) => lines.findIndex((l) => !isComment(l) && pred(l));
// 関数の中身（次の function の行の前まで）。無ければ ''
const body = (name) => {
  const i = script.search(new RegExp(`^function ${name}\\b`, 'm'));
  if (i < 0) return '';
  const rest = script.slice(i + 1);
  const j = rest.search(/^function /m);
  return j < 0 ? rest : rest.slice(0, j);
};

const hasPwsh = process.platform === 'win32' && runWithRetry(() => spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'])).status === 0;
const callFn = (names, code, stubs = '') => {
  const r = runWithRetry(() => spawnSync('pwsh', ['-NoProfile', '-File', join(kit, 'tests/unity/call-function.ps1'), '-Names', names, '-Stubs', stubs, '-Code', code], { encoding: 'utf8' }));
  assert.equal(r.status, 0, `call-function.ps1 が落ちた: ${r.stdout}${r.stderr}`);
  return r.stdout.replace(/\r/g, '').trim();
};

// 対象を数えて出す行・本番の回を始める行（ロックを書く行）
const iCount = lineOf((l) => l.includes('対象 {0} 件'));
const iStart = lineOf((l) => /^Set-Content -Path \$LockFile/.test(l));

test('Unity 版: エディタが開いていたら Issue を始めず BLOCKED で終わる', () => {
  assert.notEqual(body('Get-UnityHolders'), '', '関数 Get-UnityHolders がある');
  assert.match(body('Get-UnityState'), /Get-UnityHolders/, '指示文の使用中の判定も同じ関数で見る');
  const iBlocked = lineOf((l) => l.includes('BLOCKED') && /exit 3\b/.test(l));
  assert.ok(iBlocked >= 0, 'BLOCKED と知らせて exit 3 で終わる行がある（注釈の行でなく）');
  assert.ok(iCount >= 0 && iStart >= 0 && iCount < iBlocked && iBlocked < iStart, `その行は対象を数えた後・回を始める前にある（数える ${iCount}・BLOCKED ${iBlocked}・始める ${iStart}）`);
  assert.match(lines[iBlocked], /\$unityHolders\.Count/, 'エディタが開いているときだけ終わる');
  // 点検は知らせるだけ（exit 3 にしない）
  const iDry = lineOf((l) => /^if \(\$DryRun\) \{/.test(l));
  const iDryBlocked = lineOf((l) => l.includes('BLOCKED') && l.includes('本番は始めずに終わる'));
  assert.ok(iDry >= 0 && iDryBlocked > iDry && iDryBlocked < iBlocked && !/exit 3/.test(lines[iDryBlocked]), '点検は BLOCKED を知らせるだけで終わらない');
});

test('Unity 版: エディタが開いていたら Issue を始めず BLOCKED で終わる（Get-UnityHolders を回す）', { skip: !hasPwsh && 'Windows と pwsh が要る' }, () => {
  // この作業場所・隣の worktree（-wt2）・別のフォルダーを開いた Unity を偽で 3 本並べ、この作業場所の 1 本だけを返すか
  const stubs = [
    'function Get-CimInstance {',
    "  @([pscustomobject]@{ ProcessId = 11; CommandLine = '\"C:\\Unity\\Unity.exe\" -projectPath \"C:\\work\\proj\"' },",
    "    [pscustomobject]@{ ProcessId = 12; CommandLine = '\"C:\\Unity\\Unity.exe\" -projectPath \"C:\\work\\proj-wt2\"' },",
    "    [pscustomobject]@{ ProcessId = 13; CommandLine = '\"C:\\Unity\\Unity.exe\" -projectPath C:/work/other' })",
    '}',
  ].join('\n');
  assert.equal(callFn('Get-UnityHolders', "$RepoRoot = 'C:\\work\\proj'; (@(Get-UnityHolders) | ForEach-Object { $_.ProcessId }) -join ','", stubs), '11');
  assert.equal(callFn('Get-UnityHolders', "$RepoRoot = 'C:\\work\\none'; @(Get-UnityHolders).Count", stubs), '0');
});

test('Unity 版: 残った実行中のラベルを、対象を数える前に外す', () => {
  const iRemove = lineOf((l) => l.includes('Remove @($LabelWorking)'));
  const iTargets = lineOf((l) => l.includes('@(Get-TargetIssues)'));
  assert.ok(iRemove >= 0 && iTargets >= 0 && iRemove < iTargets && iRemove < iCount, `外す所（${iRemove}）が、対象を集める行（${iTargets}）・数えて出す行（${iCount}）より前にある`);
  // 外す所はほかの worktree の実行の分を外さず、点検は外さずに知らせる
  const block = lines.slice(lineOf((l) => l.includes('$othersBusy = Get-OtherRunningIssues')), iRemove + 1).join('\n');
  assert.match(block, /\$othersBusy -contains/, 'ほかの worktree の実行が進めている Issue は外さない');
  assert.match(block, /if \(\$DryRun\) \{[^\n]*本番で外す[^\n]*continue \}/, '点検は外さずに知らせる');
  assert.ok(lineOf((l) => l.includes('Get-OtherRunningIssues') && l.includes('$othersBusy')) < iTargets, '前の回の残りを見るのも数える前');
});

test('Unity 版: 無人の回の中では作業場所を聞かない', () => {
  assert.match(body('Resolve-WorkRoot'), /\$env:ISSUE_RUN_ROOT/, 'Resolve-WorkRoot が ISSUE_RUN_ROOT を見る');
  const r = body('Resolve-WorkRoot');
  assert.ok(r.indexOf('$env:ISSUE_RUN_ROOT') < r.indexOf('Read-Host') || !r.includes('Read-Host'), 'ISSUE_RUN_ROOT を、聞くより前に見る');
  assert.match(body('Invoke-PassCheck'), /\$env:ISSUE_RUN_ROOT = \$RepoRoot/, 'Invoke-PassCheck が確認コマンドに ISSUE_RUN_ROOT を渡す');
});

test('Unity 版: 無人の回の中では作業場所を聞かない（Resolve-WorkRoot・Invoke-PassCheck を回す）', { skip: !hasPwsh && 'Windows と pwsh が要る' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-unity-run-'));
  try {
    // 入力が窓でも（[Console]::IsInputRedirected に頼らず）、ISSUE_RUN_ROOT があればそれを返す。選ぶ画面を出さない
    const stubs = "function Get-GitTop([string]$Path) { return $Path }\nfunction Get-Worktrees { throw '選ぶ画面に入った' }\nfunction Read-Host { throw '聞いた' }";
    assert.equal(callFn('Resolve-WorkRoot', `$WorkDir = ''; $env:ISSUE_RUN_ROOT = '${dir}'; Resolve-WorkRoot`, stubs), dir);
    // 確認コマンドの中で ISSUE_RUN_ROOT が作業場所になり、終わった後は残らない
    const out = join(dir, 'check.txt');
    const got = callFn('Invoke-PassCheck', [
      `$RepoRoot = '${dir}'`,
      "Remove-Item Env:ISSUE_RUN_ROOT -ErrorAction SilentlyContinue",
      `$r = Invoke-PassCheck 'Write-Output "root=$env:ISSUE_RUN_ROOT"' '${out}'`,
      "Write-Output \"passed=$($r.Passed)\"",
      "Write-Output \"after=[$env:ISSUE_RUN_ROOT]\"",
    ].join('\n'));
    assert.match(got, /passed=True/);
    assert.match(got, /after=\[\]/, '終わった後に ISSUE_RUN_ROOT を残さない');
    assert.ok(existsSync(out));
    assert.ok(readFileSync(out, 'utf8').includes(`root=${dir}`), `確認コマンドに ISSUE_RUN_ROOT が渡る: ${readFileSync(out, 'utf8')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Unity 版: 点検は実行中のロックで止めない', () => {
  const locks = lines.filter((l) => !isComment(l) && /Test-Path \$LockFile/.test(l));
  assert.equal(locks.length, 1, 'ロックを見る所は 1 か所');
  assert.match(locks[0], /^if \(-not \$DryRun -and \(Test-Path \$LockFile\)\)/, '点検（-DryRun）は実行中のロックで止めない');
  assert.ok(iStart > lineOf((l) => /^if \(\$DryRun\) \{/.test(l)), '点検はロックを書かない（点検の出口が、ロックを書く行より前）');
});

test('Unity 版: UNITY_EXE と gh を PATH の外でも見つける', () => {
  const iUnity = lineOf((l) => l.includes("GetEnvironmentVariable('UNITY_EXE', 'User')"));
  assert.ok(iUnity >= 0, 'UNITY_EXE をユーザーの環境変数から読む');
  assert.match(lines[iUnity], /if \(-not \$env:UNITY_EXE\)/, '今の環境変数にあればそれを使う');
  assert.ok(iUnity < iStart, 'claude -p と確認コマンドを起動する前に読む');
  const iGh = lineOf((l) => l.includes("Join-Path $env:ProgramFiles 'GitHub CLI'"));
  const iAuth = lineOf((l) => /^& gh auth status/.test(l));
  assert.ok(iGh >= 0 && iAuth >= 0 && iGh < iAuth, 'gh を使う前に、PATH に無ければ GitHub CLI のフォルダーを探す');
  assert.ok(script.includes('gh.exe'), 'gh.exe があるときだけ PATH に足す');
  assert.ok(!script.includes('issue-gh'), 'まだ無いファイルの名前を書かない');
});
