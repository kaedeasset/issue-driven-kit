// node.test.mjs — Node 版の試験（node --test）。基本設計の K-2・K-3（Node 側）と、外に触らない部品。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gitIn } from './helpers.mjs';

const kit = join(dirname(fileURLToPath(import.meta.url)), '..');
const nodeRoot = join(kit, 'editions/node');
const lib = await import('../editions/node/files/scripts/issue-run/lib.mjs');
const read = (p) => readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r/g, '');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);

test('K-2 Node 版に PowerShell が出てこない', () => {
  const files = walk(nodeRoot);
  const ps1 = files.filter((f) => f.toLowerCase().endsWith('.ps1')).map((f) => relative(kit, f));
  assert.deepEqual(ps1, [], `.ps1 がある: ${ps1.join(', ')}`);
  const bad = [];
  for (const f of files) {
    const lines = read(f).split('\n');
    lines.forEach((l, i) => {
      // pwsh という言葉・powershell の実行は不可。Claude の道具を断る設定の「PowerShell(…)」だけは許す（Windows の Claude Code の道具の名前）
      if (/\bpwsh\b/i.test(l) || /powershell(?!\()/i.test(l)) bad.push(`${relative(kit, f)}:${i + 1}: ${l.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('K-3（Node 側）見本を Unity 版と同じに読む', () => {
  const dir = join(kit, 'shared/fixtures/issues');
  let n = 0;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.expected.json'))) {
    const exp = JSON.parse(read(join(dir, f)));
    // Unity 版の見本の確認コマンドの塊（pwsh）を、Node 版の塊（js）に置き換えて読ませる。中身の読み方は同じでなければならない
    const body = read(join(dir, f.replace('.expected.json', '.md'))).replace(/^```(pwsh|powershell)\s*$/gm, '```js');
    const c = lib.parsePassCriteria(body);
    assert.deepEqual(c.items, exp.items, `${f} items`);
    assert.equal(c.check, exp.check, `${f} check`);
    assert.deepEqual(lib.parsePrerequisites(body), exp.prerequisites, `${f} prerequisites`);
    const tracked = new Set(exp.tracked.map((p) => p.toLowerCase()));
    const prot = lib.protectedFiles(c.check, {
      isFile: (p) => tracked.has(p.replaceAll('\\', '/').replace(/^(\.\/|\/)+/, '').toLowerCase()),
      isTracked: (rel) => tracked.has(rel.toLowerCase()),
    });
    assert.deepEqual(prot, exp.protected, `${f} protected`);
    n++;
  }
  assert.ok(n >= 13, `見本が ${n} 件`);
});

test('K-3（Node 側）Node 版の見本を答えどおりに読む', () => {
  const dir = join(kit, 'shared/fixtures/issues-node');
  let n = 0;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.expected.json'))) {
    const exp = JSON.parse(read(join(dir, f)));
    assert.equal(exp.checkLang, 'js', `${f} checkLang`);
    // Node 版の本文をそのまま読む（塊を置き換えない）
    const body = read(join(dir, f.replace('.expected.json', '.md')));
    const c = lib.parsePassCriteria(body);
    assert.deepEqual(c.items, exp.items, `${f} items`);
    assert.equal(c.check, exp.check, `${f} check`);
    assert.deepEqual(lib.parsePrerequisites(body), exp.prerequisites, `${f} prerequisites`);
    const tracked = new Set(exp.tracked.map((p) => p.toLowerCase()));
    const prot = lib.protectedFiles(c.check, {
      isFile: (p) => tracked.has(p.replaceAll('\\', '/').replace(/^(\.\/|\/)+/, '').toLowerCase()),
      isTracked: (rel) => tracked.has(rel.toLowerCase()),
    });
    assert.deepEqual(prot, exp.protected, `${f} protected`);
    n++;
  }
  assert.ok(n >= 4, `Node 版の見本が ${n} 件`);
});

test('Node 版の言語の塊だけを確認コマンドにする', () => {
  const body = '## 合格の条件\n\n- a が通る\n\n```pwsh\nexit 0\n```\n\n```js\nprocess.exit(0)\n```\n';
  assert.equal(lib.parsePassCriteria(body).check, 'process.exit(0)');
  assert.equal(lib.parsePassCriteria(body, ['pwsh']).check, 'exit 0');   // 言語は差し替えられる（キットの試験から渡す）
  assert.deepEqual(lib.parsePassCriteria('## 合格の条件\n\n```js\nx\n```\n').items, []);
});

test('点で始まるフォルダーの頭の点を取らない', () => {
  const t = new Set(['.github/issue_template/claude-run.md']);
  const prot = lib.protectedFiles('"./.github/ISSUE_TEMPLATE/claude-run.md"', { isFile: () => true, isTracked: (r) => t.has(r.toLowerCase()) });
  assert.deepEqual(prot, ['.github/ISSUE_TEMPLATE/claude-run.md']);
});

test('守るファイル: ファイルのパスを丸ごと変数に入れても守られる', () => {
  const t = new Set(['docs/guides/working/x-design.md']);
  const prot = lib.protectedFiles("const d = 'docs/guides/working/x-design.md';   // 書かせる文書は変数で指す", { isFile: () => true, isTracked: (r) => t.has(r) });
  assert.deepEqual(prot, ['docs/guides/working/x-design.md']);
});

test('守るファイル: フォルダーを変数に入れて組み立てたファイルは守られない', () => {
  const t = new Set(['docs/guides/working/x-design.md']);
  const prot = lib.protectedFiles("const dir = 'docs/guides/working';\nconst d = `${dir}/x-design.md`;", { isFile: (r) => t.has(r), isTracked: (r) => t.has(r) });
  assert.deepEqual(prot, []);
});

test('作業場所の POSIX 形', () => {
  assert.equal(lib.repoPosix('D:\\Unreal Projects\\kaedevn\\'), 'd/Unreal Projects/kaedevn');
  assert.equal(lib.repoPosix('/Users/mk/work/app'), 'Users/mk/work/app');
});

const denyPaths = () => lib.denyEditPaths(read(join(nodeRoot, 'files/.claude/issue-run/settings.json')));

test('実行用の設定（Node 版）: deny の Edit のパスを読む', () => {
  assert.deepEqual(denyPaths(), ['CLAUDE.md', '.claude/**', 'docs/inspecs/**', '.issue-kit/**']);
  // Bash(…) や作業場所の外の Edit は読まない
  assert.deepEqual(lib.denyEditPaths(JSON.stringify({ permissions: { deny: ['Bash(rm:*)', 'Edit(src/a.ts)', 'Write(//{{REPO}}/x/**)'] } })), ['x/**']);
});

test('DryRun（Node 版）: 合格の条件に deny のパスがあれば知らせる', () => {
  const paths = denyPaths();
  assert.deepEqual(lib.deniedMentions('- 直下の `CLAUDE.md` から 11.4.2 を消す', paths), ['CLAUDE.md']);
  assert.deepEqual(lib.deniedMentions('- `docs/inspecs/2026/10/a.md` を読む・`./.claude/skills/x/SKILL.md` を直す', paths), ['docs/inspecs/2026/10/a.md', '.claude/skills/x/SKILL.md']);
  assert.deepEqual(lib.deniedMentions("gitClean(['.claude/', 'src/']);", paths), ['.claude/']);
  assert.deepEqual(lib.deniedMentions('- `src/a.ts` を直す', paths), []);
  // 脚本: DryRun が設定から deny のパスを読んで知らせる（Claude は起動しない・終了コード 0 のまま）
  const runner = read(join(nodeRoot, 'files/scripts/issue-run/issue-run.mjs'));
  const dry = runner.slice(runner.indexOf('if (DRY_RUN) {'), runner.indexOf('process.exit(0);', runner.indexOf('if (DRY_RUN) {')));
  assert.match(dry, /L\.deniedMentions\(.*L\.denyEditPaths\(L\.readText\(SETTINGS_TEMPLATE\)\)\)/);
  assert.match(dry, /deny のパス/);
});

test('DryRun（Node 版）: 写しの元（editions/node/files/ の下）のパスは知らせない', () => {
  const paths = denyPaths();
  assert.deepEqual(lib.deniedMentions('- `CLAUDE.md`・`editions/node/files/CLAUDE.md` に 11.6.2 がある', paths), ['CLAUDE.md']);
  assert.deepEqual(lib.deniedMentions('- `editions/node/files/.claude/skills/x/SKILL.md` と `editions/node/files/docs/inspecs/README.md` を直す', paths), []);
});

test('開始〜終了の書き方と 1 行目の形', () => {
  assert.equal(lib.formatSpan(new Date(2026, 9, 22, 9, 36), new Date(2026, 9, 22, 9, 42)), '2026-10-22 09:36〜09:42');
  assert.equal(lib.formatSpan(new Date(2026, 9, 22, 23, 50), new Date(2026, 9, 23, 0, 40)), '2026-10-22 23:50〜2026-10-23 00:40');
  const h = lib.headLine({ status: 'PASS', minutes: 6, span: 'x', rounds: 1, commits: 2, folder: 'app', branch: 'main', head: '81093d6c', logDir: '.issue-run/logs/1/' });
  assert.deepEqual(lib.headShasFromComment(h), ['81093d6c']);
});

test('利用上限と認証切れの見分け', () => {
  assert.ok(lib.isLimitError({ is_error: true, api_error: 'usage_limit_reached' }, ''));
  assert.ok(lib.isLimitError(null, "You've hit your session limit · resets 11:30am"));
  assert.ok(!lib.isLimitError({ is_error: false }, 'rate limit'));
  assert.ok(lib.isAuthError('OAuth session expired'));
});

test('報告の「合格」の行', () => {
  assert.ok(lib.reportClaimsPass('## 結果: 合格\n| a |'));
  assert.ok(!lib.reportClaimsPass('## 結果: 未合格'));
});

test('報告の「判定不能」の行: 結果の行と両立しない条件の節がそろったときだけ読む', () => {
  const table = '| 合格の条件 | 判定 | 根拠 |\n|---|---|---|\n| a | NG | b |\n';
  const full = `## 結果: 判定不能\n${table}\n## 両立しない条件\n- 条件 A と守るファイル X がぶつかる\n- 直し方の推し: X を直す\n\n## やったこと\n- 何か\n`;
  assert.equal(lib.reportUndecidable(full), '- 条件 A と守るファイル X がぶつかる\n- 直し方の推し: X を直す');
  assert.equal(lib.reportUndecidable(full.replace(/\n/g, '\r\n')), '- 条件 A と守るファイル X がぶつかる\n- 直し方の推し: X を直す');
  assert.equal(lib.reportUndecidable(`  ## 結果: 判定不能  \n## 両立しない条件\nぶつかる`), 'ぶつかる', '行の前後の空白・節が終わりまで');
  assert.equal(lib.reportUndecidable(`## 結果: 判定不能\n${table}\n## やったこと\n- 何か\n`), '', '節が無い');
  assert.equal(lib.reportUndecidable(`## 結果: 判定不能\n## 両立しない条件\n  \n\n## やったこと\n- 何か\n`), '', '節が空');
  assert.equal(lib.reportUndecidable(`## 結果: 未合格\n## 両立しない条件\n- ぶつかる\n`), '', '結果が未合格');
  assert.equal(lib.reportUndecidable(`## 結果: 合格\n## 両立しない条件\n- ぶつかる\n`), '', '結果が合格');
  assert.equal(lib.reportUndecidable(`## 結果: 判定不能です\n## 両立しない条件\n- ぶつかる\n`), '', '結果の行が違う');
  assert.equal(lib.reportUndecidable(''), '');
  assert.equal(lib.reportUndecidable(undefined), '');
  assert.equal(lib.reportClaimsPass(full), false, '判定不能を合格と読まない');
  // 脚本が使う
  const script = read(join(nodeRoot, 'files/scripts/issue-run/issue-run.mjs'));
  assert.match(script, /L\.reportUndecidable\(/);
  assert.match(script, /報告が判定不能（合格の条件が両立しない）。人が Issue の条件か守るファイルを直す。/);
});

test('まとめ（Node 版）: 作業場所の絶対パスを書かない', () => {
  const base = { runStamp: '20261024-0859', repo: 'o/app', logDir: '.issue-run/logs/20261024-0859/', aborted: '', results: [] };
  for (const root of ['/Users/someone-mac/work/app', 'C:\\Users\\someone-win\\work\\app', '/Users/someone-mac/work/app/']) {
    const md = lib.summaryMarkdown({ ...base, root, branch: 'main' });
    assert.doesNotMatch(md, /someone|Users/);
    assert.match(md, /作業場所 app（main）/);
  }
  assert.match(lib.summaryMarkdown({ ...base, root: '/Users/someone-mac/x', folder: 'app', branch: 'lane-a' }), /作業場所 app（lane-a）/);
});

test('終わりの知らせ（Node 版）: Mac は通知を出し、ほかはベルだけ', () => {
  const results = [{ number: 7, status: 'PASS' }, { number: 8, status: 'NOT-PASS' }];
  const mac = lib.finishNotice({ platform: 'darwin', results });
  assert.equal(mac.bell, '\x07issue-run 終わり: #7 PASS #8 NOT-PASS');
  assert.deepEqual(mac.osascript, ['-e', 'display notification "issue-run 終わり: #7 PASS #8 NOT-PASS" with title "issue-run"']);
  for (const platform of ['win32', 'linux']) {
    const n = lib.finishNotice({ platform, results });
    assert.equal(n.bell, mac.bell);
    assert.equal(n.osascript, null);
  }
  // 中断の理由の " と \ を逃がす・改行は空白
  const ab = lib.finishNotice({ platform: 'darwin', results: [], aborted: 'gh "x" が C:\\a で失敗\n2 行目' });
  assert.match(ab.bell, /^\x07issue-run 終わり: なし（中断: /);
  assert.equal(ab.osascript[1], 'display notification "issue-run 終わり: なし（中断: gh \\"x\\" が C:\\\\a で失敗 2 行目）" with title "issue-run"');
  // --no-notify
  assert.deepEqual(lib.finishNotice({ platform: 'darwin', results, notify: false }), { bell: '', osascript: null });
  // 脚本は引数 --no-notify を読み、知らせを回の結果に響かせない
  const src = read(join(nodeRoot, 'files/scripts/issue-run/issue-run.mjs'));
  assert.match(src, /args\['no-notify'\]/);
  assert.match(src, /try \{ run\('osascript', notice\.osascript\); \} catch/);
});

test('対象 0 件（Node 版）: 履歴に 1 行残し、直近に合格した Issue を出す', () => {
  assert.equal(lib.runsLogLine({ runStamp: '20261024-085900', count: 0 }), '20261024-085900\t対象 0 件\tなし\t-\n');
  assert.equal(lib.runsLogLine({ runStamp: '20261024-085900', count: 2, results: [{ number: 7, status: 'PASS' }, { number: 8, status: 'NOT-PASS' }], summary: 'docs/reports/2026/10/24/01-issue-run.md' }),
    '20261024-085900\t対象 2 件\t#7 PASS #8 NOT-PASS\tdocs/reports/2026/10/24/01-issue-run.md\n');
  assert.equal(lib.runsLogLine({ runStamp: 's', count: 1, aborted: '認証が\n切れた\tx', summary: 'a.md' }), 's\t対象 1 件\tなし 中断: 認証が 切れた x\ta.md\n');
  assert.equal(lib.latestDoneText([{ number: 7, title: '終わりの知らせ', updatedAt: '2026-10-24T08:59:00Z' }]), '直近に合格した Issue: #7 終わりの知らせ（更新 2026-10-24T08:59:00Z）');
  assert.equal(lib.latestDoneText([]), '直近に合格した Issue: まだ無い');
  // 脚本: 0 件の所で履歴に足してから終わり、claude-done を閉じたものも含めて更新順に 1 件だけ問う。DryRun はその前に終わる
  const src = read(join(nodeRoot, 'files/scripts/issue-run/issue-run.mjs'));
  const zero = src.slice(src.indexOf('if (!targets.length) {'));
  assert.ok(src.indexOf('if (DRY_RUN) {') < src.indexOf('if (!targets.length) {'));
  assert.match(zero.slice(0, zero.indexOf('process.exit(0)')), /appendFileSync\(RUNS_LOG, L\.runsLogLine\(\{ runStamp: RUN_STAMP, count: 0 \}\)/);
  assert.match(zero, /'--state', 'all', '--search', 'sort:updated-desc', '--limit', '1'/);
  assert.match(src, /RUNS_LOG = join\(ROOT, LOG_BASE, 'runs\.log'\)/);
});

// 終わりの片付けの偽の関数。呼ばれた順と runs.log に渡したパスと窓の行を残す。notify を渡すと知らせの後に呼ぶ
function fakeFinish(writeSummary, notify = () => {}) {
  const calls = []; const logs = [];
  const summary = lib.finishRun({
    writeSummary: () => { calls.push('summary'); return writeSummary(); },
    appendRunsLog: (rel) => calls.push(`runs.log ${rel}`),
    notify: () => { calls.push('notify'); notify(); },
    log: (line) => logs.push(line),
  });
  return { summary, calls, logs };
}

test('終わりの片付け: まとめが書けなくても、runs.log の 1 行（まとめは -）と知らせは出す', () => {
  const r = fakeFinish(() => { throw new Error('ENOSPC: ディスクがいっぱい'); });
  assert.deepEqual(r.calls, ['summary', 'runs.log -', 'notify']);
  assert.deepEqual(r.logs, ['まとめを書けなかった: ENOSPC: ディスクがいっぱい']);
  assert.equal(r.summary, '-');
  // runs.log に足せなくても知らせは出す
  const logs = []; let notified = false;
  lib.finishRun({ writeSummary: () => { throw new Error('x'); }, appendRunsLog: () => { throw new Error('EACCES'); }, notify: () => { notified = true; }, log: (l) => logs.push(l) });
  assert.ok(notified);
  assert.deepEqual(logs, ['まとめを書けなかった: x', 'runs.log に足せなかった: EACCES']);
  // 脚本の finally は finishRun を通す
  const src = read(join(nodeRoot, 'files/scripts/issue-run/issue-run.mjs'));
  assert.match(src.slice(src.lastIndexOf('} finally {')), /L\.finishRun\(\{/);
});

test('終わりの片付け: まとめが書けたら、runs.log の 1 行にまとめの相対パスを書く', () => {
  const r = fakeFinish(() => 'docs/reports/2026/10/27/01-issue-run.md');
  assert.deepEqual(r.calls, ['summary', 'runs.log docs/reports/2026/10/27/01-issue-run.md', 'notify']);
  assert.deepEqual(r.logs, []);
  assert.equal(r.summary, 'docs/reports/2026/10/27/01-issue-run.md');
});

test('終わりの片付け: 知らせが投げても、窓に 1 行出して終わる', () => {
  const r = fakeFinish(() => 'docs/reports/2026/10/27/01-issue-run.md', () => { throw new Error('osascript が無い'); });
  assert.deepEqual(r.calls, ['summary', 'runs.log docs/reports/2026/10/27/01-issue-run.md', 'notify']);
  assert.deepEqual(r.logs, ['知らせを出せなかった: osascript が無い']);
  assert.equal(r.summary, 'docs/reports/2026/10/27/01-issue-run.md');
});

// 権限を返す関数を外から与える（GitHub を呼ばない）。読めない人は投げる
const perms = { owner: 'admin', member: 'write', lead: 'maintain', guest: 'read', triager: 'triage' };
const permissionOf = (login) => { if (!(login in perms)) throw new Error('HTTP 404'); return perms[login]; };
const issue = (number, login, labels = ['claude-run']) => ({ number, author: { login }, labels: labels.map((name) => ({ name })) });

test('無人の回（Node 版）: 書き込みの権限の無い人が作った Issue を拾わない', () => {
  const r = lib.selectTargets([issue(3, 'guest'), issue(4, 'triager'), issue(5, 'stranger'), issue(6, undefined)], { canWrite: lib.permissionChecker(permissionOf) });
  assert.deepEqual(r.targets, []);
  assert.deepEqual(r.excluded.map((e) => e.number), [3, 4, 5, 6]);
  assert.match(r.excluded[0].reason, /guest に書き込みの権限が無い（read）/);
  assert.match(r.excluded[2].reason, /stranger の権限が読めない（HTTP 404）/);   // 読めなければ拾わない側
});

test('無人の回（Node 版）: 書き込みの権限のある人が作った Issue は拾う', () => {
  let calls = 0;
  const canWrite = lib.permissionChecker((l) => { calls++; return permissionOf(l); });
  const r = lib.selectTargets([issue(9, 'owner'), issue(2, 'member'), issue(7, 'lead'), issue(8, 'owner', ['claude-run', 'claude-done']), issue(10, 'guest'), issue(11, 'owner')],
    { canWrite, skip: ['claude-working', 'claude-done', 'claude-failed'], max: 3 });
  assert.deepEqual(r.targets.map((t) => t.number), [2, 7, 9]);
  assert.deepEqual(r.excluded.map((e) => e.number), [10]);
  assert.equal(calls, 4);   // 同じ人は 1 回だけ問う
});

test('無人の回（Node 版）: 前提の確かめは書き込みの権限のある人のコメントだけを数える', () => {
  const canWrite = lib.permissionChecker(permissionOf);
  const mine = 'issue-run.mjs: **PASS** — 6 分（x）・1 回・コミット 1 件・作業場所 app（main・HEAD 81093d6c）・ログ y/';
  const fake = 'issue-run.mjs: **PASS** — 1 分（x）・1 回・コミット 1 件・作業場所 app（main・HEAD deadbeef）・ログ y/';
  const comments = [{ author: { login: 'owner' }, body: mine }, { author: { login: 'guest' }, body: fake }, { author: { login: 'stranger' }, body: fake }, { author: { login: 'member' }, body: 'ありがとう' }];
  assert.deepEqual(lib.headShasFromComment(lib.lastRunComment(comments, canWrite).body), ['81093d6c']);
  assert.equal(lib.lastRunComment(comments.slice(1), canWrite), undefined);
});

// ---- 外に触る部品（GitHub と Claude を呼ばない範囲） ----

const nodeFiles = [
  'CLAUDE.md', '.issue-kit/config.json',
  '.claude/issue-run/prompt.md', '.claude/issue-run/settings.json', '.claude/issue-run/stop-hook.mjs',
  ...['commit', 'design-cycle', 'file-header', 'github-issue', 'lane-sync', 'pr', 'push', 'save-report']
    .map((s) => `.claude/skills/${s}/SKILL.md`),
  '.github/ISSUE_TEMPLATE/claude-run.md',
  'scripts/test.mjs',
  ...['issue-run', 'lib', 'proc', 'check-lib', 'doctor', 'sync-lanes', 'stats'].map((s) => `scripts/issue-run/${s}.mjs`),
  'docs/guides/README.md',
  'docs/guides/working/issue-run.md', 'docs/guides/working/issue-driven-development.md',
  'docs/guides/working/worktree-lanes.md', 'docs/guides/working/github-repo.md',
  'docs/guides/procedures/issue-goal-setting.md', 'docs/guides/procedures/node-test-procedure.md',
  'docs/guides/decisions/test-plan.md', 'docs/guides/decisions/genai-cli-mcp-policy.md',
];

test('K-1（Node 版）部品が全部あり、一覧に無い物が無い', () => {
  const root = join(nodeRoot, 'files');
  const have = walk(root).map((f) => relative(root, f).replaceAll('\\', '/'));
  assert.deepEqual(nodeFiles.filter((f) => !have.includes(f)), [], '無い');
  assert.deepEqual(have.filter((f) => !nodeFiles.includes(f)), [], '一覧に無い');
  assert.ok(existsSync(join(nodeRoot, 'install.mjs')));
  JSON.parse(read(join(root, '.claude/issue-run/settings.json')));
});

const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', ...opts });

test('入れる脚本（Node 版）: DryRun・本番・2 回目・ぶつかるとき', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-node-'));
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
    const inst = join(nodeRoot, 'install.mjs');
    const dry = node([inst, '--target', dir, '--dry-run']);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.ok(!existsSync(join(dir, 'CLAUDE.md')), 'DryRun なのに書いた');
    const r = node([inst, '--target', dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const f of nodeFiles) assert.ok(existsSync(join(dir, f)), `写っていない: ${f}`);
    assert.ok(read(join(dir, '.gitignore')).includes('.issue-run/'), '.gitignore に足していない');
    assert.ok(read(join(dir, '.gitignore')).includes('node_modules/'), '.gitignore の元の行を消した');
    assert.ok(existsSync(join(dir, 'docs/inspecs/.gitkeep')));
    const v = JSON.parse(read(join(dir, '.issue-kit/version')));
    assert.equal(v.edition, 'node');
    assert.ok(!walk(dir).some((f) => f.toLowerCase().endsWith('.ps1')), '.ps1 が入った');
    const again = node([inst, '--target', dir]);
    assert.match(again.stdout, /Result: PASS \(0 件を写した/);
    assert.equal(read(join(dir, '.gitignore')).split('.issue-run/').length, 2, '.gitignore に 2 回足した');
    // ぶつかるとき: 中身の違う既存のファイルは上書きせずに止まる
    writeFileSync(join(dir, 'scripts/test.mjs'), '// mine\n');
    const c = node([inst, '--target', dir]);
    assert.equal(c.status, 1);
    assert.match(c.stdout, /Result: FAIL \(ぶつかる 1 件\)/);
    assert.equal(read(join(dir, 'scripts/test.mjs')), '// mine\n', '上書きした');
    // --update は上げる（CLAUDE.md は利用先の物なので残す）
    writeFileSync(join(dir, 'CLAUDE.md'), '# mine\n');
    const u = node([inst, '--target', dir, '--update']);
    assert.equal(u.status, 0, u.stdout);
    assert.notEqual(read(join(dir, 'scripts/test.mjs')), '// mine\n');
    assert.equal(read(join(dir, 'CLAUDE.md')), '# mine\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('入れる脚本（Node 版）: 既にある CLAUDE.md は残し、キットの物を CLAUDE.kit.md として横に置いて残りを入れる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-node-aside-'));
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    writeFileSync(join(dir, 'CLAUDE.md'), '# mine\n');
    const inst = join(nodeRoot, 'install.mjs');
    const kitClaude = readFileSync(join(nodeRoot, 'files/CLAUDE.md'));
    // DryRun: 横に置く予定が一覧と合計に出て、何も書かない
    const dry = node([inst, '--target', dir, '--dry-run']);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.match(dry.stdout, /^aside +CLAUDE\.md → CLAUDE\.kit\.md$/m);
    assert.match(dry.stdout, /横に置く（[^）]*） 1/);
    assert.match(dry.stdout, /Result: PASS \(DryRun・何も書いていない\)/);
    assert.ok(!existsSync(join(dir, 'CLAUDE.kit.md')), 'DryRun なのに横に置いた');
    assert.ok(!existsSync(join(dir, 'scripts/test.mjs')), 'DryRun なのに書いた');
    // 本番: CLAUDE.md は元のまま・CLAUDE.kit.md はキットの物・ほかは全部入る
    const r = node([inst, '--target', dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Result: PASS \(\d+ 件を写した・横に置いた 1 件/);
    assert.match(r.stdout, /CLAUDE\.kit\.md（CLAUDE\.md に足す）/);
    assert.equal(read(join(dir, 'CLAUDE.md')), '# mine\n', '既にある CLAUDE.md を書き換えた');
    assert.deepEqual(readFileSync(join(dir, 'CLAUDE.kit.md')), kitClaude, 'CLAUDE.kit.md がキットの物と違う');
    for (const f of nodeFiles.filter((f) => f !== 'CLAUDE.md')) assert.ok(existsSync(join(dir, f)), `写っていない: ${f}`);
    const v = JSON.parse(read(join(dir, '.issue-kit/version')));
    assert.ok(!v.files.includes('CLAUDE.kit.md'), '版のファイルに横に置いた名前を入れた');
    // もう一度入れても PASS（何も写さない）
    const again = node([inst, '--target', dir]);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /Result: PASS \(0 件を写した・横に置いた 1 件/);
    assert.equal(read(join(dir, 'CLAUDE.md')), '# mine\n');
    // 横に置いた物が古くなっていれば、キットの物で書き直す
    writeFileSync(join(dir, 'CLAUDE.kit.md'), 'old\n');
    assert.equal(node([inst, '--target', dir]).status, 0);
    assert.deepEqual(readFileSync(join(dir, 'CLAUDE.kit.md')), kitClaude);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('入れる脚本（Node 版）: --update は利用先が手を入れる物を残し、一覧と最後の行に残した数を出して残りを上げる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-node-update-'));
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    const inst = join(nodeRoot, 'install.mjs');
    assert.equal(node([inst, '--target', dir]).status, 0);
    // 何も変えていなければ、残す物は無く「残した」を出さない
    const same = node([inst, '--target', dir, '--update']);
    assert.equal(same.status, 0, same.stdout + same.stderr);
    assert.doesNotMatch(same.stdout, /残した/);
    // 利用先が CLAUDE.md と脚本に手を入れた後に上げる
    writeFileSync(join(dir, 'CLAUDE.md'), '# mine\n');
    writeFileSync(join(dir, 'scripts/test.mjs'), '// mine\n');
    const u = node([inst, '--target', dir, '--update']);
    assert.equal(u.status, 0, u.stdout + u.stderr);
    assert.match(u.stdout, /^keep +CLAUDE\.md$/m);
    assert.match(u.stdout, /^update +scripts\/test\.mjs$/m);
    const lines = u.stdout.trim().split(/\r?\n/);
    const last = lines.at(-1);
    assert.match(last, /^Result: PASS \(1 件を写した・残した 1 件・版 node/);
    // 最後の行の前に、キットの物と比べるよう促す 1 行と残した物の一覧
    assert.equal(lines.at(-2), '  CLAUDE.md');
    assert.match(lines.at(-3), /上書きせずに残した。キットの物（<キット>\/editions\/node\/files\/<パス>）と比べて/);
    assert.equal(read(join(dir, 'CLAUDE.md')), '# mine\n', '残す物を上書きした');
    assert.deepEqual(readFileSync(join(dir, 'scripts/test.mjs')), readFileSync(join(nodeRoot, 'files/scripts/test.mjs')), '残りを上げていない');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('入れる脚本（Node 版）: 利用先が手を入れる物でないファイルがぶつかると、何も書かずに FAIL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-node-conflict-'));
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    writeFileSync(join(dir, 'CLAUDE.md'), '# mine\n');
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts/test.mjs'), '// mine\n');
    // .git の外のファイルの一覧（入れる脚本が書いたかを比べる）
    const list = () => walk(dir).map((f) => relative(dir, f).replaceAll('\\', '/')).filter((f) => !f.startsWith('.git/')).sort();
    const before = list();
    const r = node([join(nodeRoot, 'install.mjs'), '--target', dir]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /Result: FAIL \(ぶつかる 1 件\)/);
    const after = list();
    assert.deepEqual(after, before, '何か書いた');
    assert.ok(!existsSync(join(dir, 'CLAUDE.kit.md')), 'CLAUDE.kit.md を書いた');
    assert.equal(read(join(dir, 'CLAUDE.md')), '# mine\n');
    assert.equal(read(join(dir, 'scripts/test.mjs')), '// mine\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stop hook（Node 版）: 押し返す・終わらせる・守るファイル・点検の印', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-hook-'));
  try {
    const hook = join(nodeRoot, 'files/.claude/issue-run/stop-hook.mjs');
    const report = join(dir, 'report.md'), protect = join(dir, 'protect.tsv'), state = join(dir, 'state.txt');
    mkdirSync(join(dir, 'test'), { recursive: true });
    writeFileSync(join(dir, 'test/a.test.ts'), 'x');
    writeFileSync(protect, lib.snapshotLines(dir, ['test/a.test.ts']).join('\n') + '\n');
    const env = { ...process.env, ISSUE_RUN_ROOT: dir, ISSUE_RUN_REPORT: report, ISSUE_RUN_PROTECT: protect, ISSUE_RUN_STATE: state, ISSUE_RUN_MAXBLOCKS: '2' };
    const run = () => node([hook], { env, input: '{}' });
    // 報告が無い → 押し返す
    let r = run();
    assert.equal(JSON.parse(r.stdout).decision, 'block');
    assert.match(JSON.parse(r.stdout).reason, /1\/2 回目の押し返し/);
    // 合格と書いたが守るファイルを変えた → 押し返す
    writeFileSync(report, '## 結果: 合格\n');
    writeFileSync(join(dir, 'test/a.test.ts'), 'changed');
    r = run();
    assert.match(JSON.parse(r.stdout).reason, /確認コマンドが使うファイルを変えた: test\/a\.test\.ts/);
    // 上限を超えたら押し返さない
    r = run();
    assert.equal(r.stdout, '');
    // 戻せば終わってよい
    writeFileSync(join(dir, 'test/a.test.ts'), 'x');
    writeFileSync(state, '0');
    r = run();
    assert.equal(r.stdout, '');
    // 点検のとき
    const mark = join(dir, 'probe.txt');
    node([hook], { env: { ...process.env, ISSUE_RUN_PROBE: mark }, input: '{}' });
    assert.ok(existsSync(mark));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stop hook（Node 版）: 判定不能の報告なら押し返さずに終わらせる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-hook-'));
  try {
    const hook = join(nodeRoot, 'files/.claude/issue-run/stop-hook.mjs');
    const report = join(dir, 'report.md'), protect = join(dir, 'protect.tsv'), state = join(dir, 'state.txt');
    mkdirSync(join(dir, 'test'), { recursive: true });
    writeFileSync(join(dir, 'test/a.test.ts'), 'x');
    writeFileSync(protect, lib.snapshotLines(dir, ['test/a.test.ts']).join('\n') + '\n');
    const env = { ...process.env, ISSUE_RUN_ROOT: dir, ISSUE_RUN_REPORT: report, ISSUE_RUN_PROTECT: protect, ISSUE_RUN_STATE: state, ISSUE_RUN_MAXBLOCKS: '30' };
    const run = () => node([hook], { env, input: '{}' });
    // 判定不能の形（守るファイルが変わっていても）→ 押し返さず、回数も数えない
    writeFileSync(report, '## 結果: 判定不能\r\n| a | NG | b |\r\n\r\n## 両立しない条件\r\n- 条件 A と守るファイル X がぶつかる\r\n');
    writeFileSync(join(dir, 'test/a.test.ts'), 'changed');
    let r = run();
    assert.equal(r.stdout, '');
    assert.ok(!existsSync(state), '押し返しを数えた');
    // 節が空なら判定不能でない → 押し返す
    writeFileSync(report, '## 結果: 判定不能\n\n## 両立しない条件\n\n## やったこと\n- 何か\n');
    r = run();
    assert.equal(JSON.parse(r.stdout).decision, 'block');
    assert.match(JSON.parse(r.stdout).reason, /1\/30 回目の押し返し/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('仕様に判定不能の決まりがある', () => {
  const spec = read(join(kit, 'shared/spec/issue-run-spec.md'));
  const chapter = (n, m) => spec.split(new RegExp(`^## ${n}\\. `, 'm'))[1].split(new RegExp(`^## ${m}\\. `, 'm'))[0];
  const ch3 = chapter(3, 4), ch4 = chapter(4, 5), ch9 = chapter(9, 10);
  for (const w of ['## 結果: 判定不能', '## 両立しない条件', 'NOT-PASS', 'claude-failed', '確認コマンドを回さず', '次の回へ進まない']) assert.ok(ch3.includes(w), `3 章: ${w}`);
  assert.ok(ch4.includes('## 結果: 判定不能') && ch4.includes('押し返さず'), '4 章');
  const row = ch9.split('\n').find((l) => /^\| 判定不能/.test(l));
  assert.ok(row, '9 章の行');
  assert.equal(row.split('|').length - 2, 3, row);
  // 両方の版が実装している（Unity 版は 2026-11-13 に KaedeScapeBuii 29fc518 から写した）
  assert.doesNotMatch(row, /まだ/);
  assert.equal(row.match(/実装している/g).length, 2, row);
  // 版のひな形と文書
  const prompt = read(join(nodeRoot, 'files/.claude/issue-run/prompt.md'));
  for (const w of ['## 結果: 合格', '## 結果: 判定不能', '## 両立しない条件']) assert.ok(prompt.includes(w), `prompt.md: ${w}`);
  assert.ok(read(join(nodeRoot, 'files/docs/guides/working/issue-run.md')).includes('判定不能'));
});

// テストの入口を回す小さな作業場所を作る（scripts/test.mjs と、それが読み込む lib.mjs・proc.mjs を写す）。config が null なら設定を置かない
function entryProject(config, { pkg } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-test-'));
  mkdirSync(join(dir, 'scripts/issue-run'), { recursive: true });
  writeFileSync(join(dir, 'scripts/test.mjs'), readFileSync(join(nodeRoot, 'files/scripts/test.mjs')));
  for (const s of ['lib', 'proc']) writeFileSync(join(dir, `scripts/issue-run/${s}.mjs`), readFileSync(join(nodeRoot, `files/scripts/issue-run/${s}.mjs`)));
  if (config) { mkdirSync(join(dir, '.issue-kit')); writeFileSync(join(dir, '.issue-kit/config.json'), JSON.stringify(config)); }
  if (pkg) writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  return dir;
}
const lastLine = (r) => r.stdout.trim().split(/\r?\n/).at(-1);

test('テストの入口（Node 版）: 設定が無ければ FAIL', () => {
  const dir = entryProject(null);
  try {
    const r = node([join(dir, 'scripts/test.mjs')], { cwd: dir });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(lastLine(r), /^Result: FAIL \(\.issue-kit\/config\.json が無い。テストの道具を書く（例 \{ "test": \{ "runner": "vitest" \} \}）/);
    // 読めない・形が違うときも直し方を出して FAIL
    mkdirSync(join(dir, '.issue-kit'));
    writeFileSync(join(dir, '.issue-kit/config.json'), '{ 読めない');
    assert.match(lastLine(node([join(dir, 'scripts/test.mjs')], { cwd: dir })), /^Result: FAIL \(\.issue-kit\/config\.json が JSON として読めない/);
    writeFileSync(join(dir, '.issue-kit/config.json'), JSON.stringify({ test: { runner: 'jest' } }));
    assert.match(lastLine(node([join(dir, 'scripts/test.mjs')], { cwd: dir })), /^Result: FAIL \(\.issue-kit\/config\.json の test\.runner は vitest・node・command/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（Node 版）: package.json の issueKit を読まない', () => {
  const dir = entryProject(null, { pkg: { type: 'module', issueKit: { testRunner: 'node', testFiles: 'tests/*.test.mjs' } } });
  try {
    mkdirSync(join(dir, 'tests'));
    writeFileSync(join(dir, 'tests/a.test.mjs'), "import { test } from 'node:test';\ntest('通る', () => {});\n");
    const r = node([join(dir, 'scripts/test.mjs')], { cwd: dir });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(lastLine(r), /^Result: FAIL \(\.issue-kit\/config\.json が無い/);
    assert.ok(!existsSync(join(dir, '.issue-run/test-results/junit.xml')), '古い欄で回した');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（Node 版）: vitest が無ければ FAIL', () => {
  const dir = entryProject({ test: { runner: 'vitest' } });
  try {
    const r = node([join(dir, 'scripts/test.mjs')], { cwd: dir });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Result: FAIL \(vitest が無い/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// node --test で回す小さなプロジェクトを作り、テストの入口を回す
function nodeTestProject(tests) {
  const dir = entryProject({ test: { runner: 'node', files: ['tests/*.test.mjs'] } }, { pkg: { type: 'module' } });
  mkdirSync(join(dir, 'tests'));
  for (const [name, body] of Object.entries(tests)) writeFileSync(join(dir, 'tests', name), `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n${body}\n`);
  return dir;
}

test('テストの入口（Node 版）: node:test で 0 件なら FAIL', () => {
  const dir = nodeTestProject({ 'a.test.mjs': "test('ひとつめ', () => {});" });
  try {
    let r = node([join(dir, 'scripts/test.mjs'), '--filter', 'どれにも当たらない名前'], { cwd: dir });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Result: FAIL \(0\/0/);
    // ファイルが 1 本も無いときも FAIL
    rmSync(join(dir, 'tests/a.test.mjs'));
    r = node([join(dir, 'scripts/test.mjs')], { cwd: dir });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Result: FAIL/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（Node 版）: node:test で名前で絞れる', () => {
  const dir = nodeTestProject({ 'a.test.mjs': "test('通るもの', () => {});\ntest('落ちるもの', () => { assert.fail('x'); });", 'b.test.mjs': "test('別のファイル', () => {});" });
  try {
    const r = node([join(dir, 'scripts/test.mjs'), '--filter', '通るもの'], { cwd: dir });
    assert.equal(r.status, 0, r.stdout);
    assert.match(lastLine(r), /^Result: PASS 1\/1$/);
    assert.match(readFileSync(join(dir, '.issue-run/test-results/junit.xml'), 'utf8'), /name="通るもの"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（Node 版）: node:test で落ちる試験があれば FAIL', () => {
  const dir = nodeTestProject({ 'a.test.mjs': "test('通るもの', () => {});\ntest('落ちるもの', () => { assert.fail('x'); });" });
  try {
    let r = node([join(dir, 'scripts/test.mjs')], { cwd: dir });
    assert.equal(r.status, 1, r.stdout);
    assert.match(lastLine(r), /^Result: FAIL \(1\/2\)$/);
    // 全部通れば PASS
    writeFileSync(join(dir, 'tests/a.test.mjs'), "import { test } from 'node:test';\ntest('通るもの', () => {});\n");
    r = node([join(dir, 'scripts/test.mjs')], { cwd: dir });
    assert.equal(r.status, 0, r.stdout);
    assert.match(lastLine(r), /^Result: PASS 1\/1$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 偽のテストの道具（command の runner 用）。引数: <様子> [--only <名前>]。out/raw に JUnit の XML を回ごとに別の名前で書く。
// 様子: pass（2 本通る）・fail（1 本落ちる）・zero（testcase が無い）・none（何も書かない）・pass-exit1（通る XML を書いて終了コード 1）
const FAKE_TOOL = `import { mkdirSync, writeFileSync } from 'node:fs';
const [mode, flag, only] = process.argv.slice(2);
const cases = { pass: ['<testcase name="足せる" classname="M"/>', '<testcase name="引ける" classname="M"/>'],
  fail: ['<testcase name="足せる" classname="M"/>', '<testcase name="落ちる" classname="M"><failure message="x"/></testcase>'],
  zero: [], 'pass-exit1': ['<testcase name="足せる" classname="M"/>', '<testcase name="引ける" classname="M"/>'] }[mode];
console.log('fake tool: ' + mode);
if (flag === '--only') console.log('only: ' + only);
if (cases) {
  const picked = flag === '--only' ? cases.filter((c) => c.includes('name="' + only + '"')) : cases;
  mkdirSync('out/raw', { recursive: true });
  writeFileSync('out/raw/run-' + process.pid + '-' + Date.now() + '.xml', '<?xml version="1.0"?><testsuites><testsuite name="M">' + picked.join('') + '</testsuite></testsuites>');
}
process.exit(mode === 'pass-exit1' ? 1 : 0);
`;
function commandProject(mode, extra = {}) {
  const dir = entryProject({ test: { runner: 'command', command: ['node', 'tool.mjs', mode], resultDirs: ['out/raw'], ...extra } });
  writeFileSync(join(dir, 'tool.mjs'), FAKE_TOOL);
  return dir;
}
const entry = (dir, ...args) => node([join(dir, 'scripts/test.mjs'), ...args], { cwd: dir });

test('テストの入口（command）: 全部通れば PASS', () => {
  const dir = commandProject('pass');
  try {
    const r = entry(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(lastLine(r), 'Result: PASS 2/2');
    assert.match(r.stdout, /fake tool: pass/, '道具の出力を画面へ流していない');
    const merged = readFileSync(join(dir, '.issue-run/test-results/junit.xml'), 'utf8');
    assert.match(merged, /<testcase name="足せる" classname="M"\/>/);
    assert.match(merged, /<testsuite name="out\/raw\/run-/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（command）: 1 本落ちれば FAIL', () => {
  const dir = commandProject('fail');
  try {
    const r = entry(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(lastLine(r), 'Result: FAIL (1/2)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（command）: 0 件なら FAIL', () => {
  const dir = commandProject('zero');
  try {
    const r = entry(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(lastLine(r), /^Result: FAIL \(0\/0（テストが 0 件）\)$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（command）: 結果の XML が無ければ FAIL', () => {
  const dir = commandProject('none');
  try {
    const r = entry(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(lastLine(r), /^Result: FAIL \(結果の XML が無い（resultDirs: out\/raw）・node の終了コード 0\)$/);
    // 道具が見つからないときも FAIL（終了コードと理由）
    writeFileSync(join(dir, '.issue-kit/config.json'), JSON.stringify({ test: { runner: 'command', command: ['no-such-tool-kit-test'], resultDirs: ['out/raw'] } }));
    const n = entry(dir);
    assert.equal(n.status, 1, n.stdout + n.stderr);
    assert.match(lastLine(n), /^Result: FAIL \(結果の XML が無い（resultDirs: out\/raw）・no-such-tool-kit-test の終了コード \d+/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（command）: 前の回の XML を読まない', () => {
  const dir = commandProject('pass');
  try {
    assert.equal(entry(dir).status, 0);
    // 前の回の XML が残っていて、道具が何も書かない → FAIL。前の回の XML は消さない
    writeFileSync(join(dir, '.issue-kit/config.json'), JSON.stringify({ test: { runner: 'command', command: ['node', 'tool.mjs', 'none'], resultDirs: ['out/raw'] } }));
    const r = entry(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(lastLine(r), /^Result: FAIL \(結果の XML が無い/);
    assert.equal(readdirSync(join(dir, 'out/raw')).length, 1, '前の回の XML を消した');
    assert.ok(!existsSync(join(dir, '.issue-run/test-results/junit.xml')), '前の回の junit.xml が残っている');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（command）: すぐに回し直しても二重に数えない', () => {
  const dir = commandProject('pass');
  try {
    assert.equal(lastLine(entry(dir)), 'Result: PASS 2/2');
    const r = entry(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(lastLine(r), 'Result: PASS 2/2');
    assert.equal(readdirSync(join(dir, 'out/raw')).length, 2, '偽の道具が回ごとに別の名前で書いていない');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（command）: XML が通っても道具が非 0 なら FAIL', () => {
  const dir = commandProject('pass-exit1');
  try {
    const r = entry(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.equal(lastLine(r), 'Result: FAIL (2/2)');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（command）: filterArgs で名前で絞る・無ければ FAIL', () => {
  const dir = commandProject('fail', { filterArgs: ['--only', '{filter}'] });
  try {
    let r = entry(dir, '--filter', '足せる');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(lastLine(r), 'Result: PASS 1/1');
    r = entry(dir, '--filter', 'どれにも当たらない名前');
    assert.match(lastLine(r), /^Result: FAIL \(0\/0/);
    // 名前の $$ や $& をそのまま渡す（置き換えの記号として読まない）
    r = entry(dir, '--filter', 'a$$b$&');
    assert.match(r.stdout, /fake tool: fail/);
    assert.match(lastLine(r), /^Result: FAIL \(0\/0/);
    assert.ok(r.stdout.includes('only: a$$b$&'), r.stdout);
    // --file は受け付けない
    r = entry(dir, '--file', 'tool.mjs');
    assert.match(lastLine(r), /^Result: FAIL \(command では --file を使えない/);
    // filterArgs が無ければ名前で絞れない
    writeFileSync(join(dir, '.issue-kit/config.json'), JSON.stringify({ test: { runner: 'command', command: ['node', 'tool.mjs', 'pass'], resultDirs: ['out/raw'] } }));
    r = entry(dir, '--filter', '足せる');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(lastLine(r), /^Result: FAIL \(command で名前で絞れない（\.issue-kit\/config\.json の test\.filterArgs が無い/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（command）: Windows で .cmd の道具を起動できる', { skip: process.platform !== 'win32' && 'Windows だけ' }, () => {
  const dir = entryProject({ test: { runner: 'command', command: ['tool.cmd', 'a b'], resultDirs: ['out/raw'] } });
  try {
    writeFileSync(join(dir, 'tool.mjs'), FAKE_TOOL);
    // 引数（空白入り）を受け取り、偽の道具を pass で回す .cmd
    writeFileSync(join(dir, 'tool.cmd'), `@echo off\r\necho arg=%~1\r\n"${process.execPath}" "%~dp0tool.mjs" pass\r\n`);
    const r = entry(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /arg=a b/);
    assert.equal(lastLine(r), 'Result: PASS 2/2');
    // cmd.exe を通す道具の引数に % があれば起動せずに FAIL
    writeFileSync(join(dir, '.issue-kit/config.json'), JSON.stringify({ test: { runner: 'command', command: ['tool.cmd', '50%'], resultDirs: ['out/raw'] } }));
    const p = entry(dir);
    assert.equal(p.status, 1, p.stdout + p.stderr);
    assert.match(lastLine(p), /^Result: FAIL \(cmd\.exe を通す道具の引数に % と " は使えない/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 点検を一時の作業場所で回す（doctor.mjs と、それが読み込む lib.mjs・proc.mjs を写す）。files は { パス: 中身 }
function doctorIn(files, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-doctor-'));
  try {
    mkdirSync(join(dir, 'scripts/issue-run'), { recursive: true });
    for (const s of ['doctor', 'lib', 'proc']) writeFileSync(join(dir, `scripts/issue-run/${s}.mjs`), readFileSync(join(nodeRoot, `files/scripts/issue-run/${s}.mjs`)));
    for (const [p, body] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), body); }
    return node([join(dir, 'scripts/issue-run/doctor.mjs')], { cwd: dir, env: { ...process.env, ISSUE_KIT_LATEST_COMMIT: '', ...env } }).stdout;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const testLines = (out) => out.split(/\r?\n/).filter((l) => / (テストの仕組み|vitest|node_modules): /.test(l));

test('点検（Node 版）: テストの仕組みを設定から見る', () => {
  const pkg = JSON.stringify({ type: 'module', scripts: { test: 'node scripts/test.mjs' } });
  const cfg = (test) => JSON.stringify({ test });
  // 設定が無い → NG（package.json の古い欄があっても読まない）
  let out = doctorIn({ 'package.json': JSON.stringify({ ...JSON.parse(pkg), issueKit: { testRunner: 'node', testFiles: 'tests/*.test.mjs' } }) });
  assert.match(out, /NG {3}テストの仕組み: \.issue-kit\/config\.json が無い/);
  assert.match(out, /OK {3}npm test: node scripts\/test\.mjs/);
  // vitest → 依存と node_modules を見る
  out = doctorIn({ 'package.json': pkg, '.issue-kit/config.json': cfg({ runner: 'vitest' }) });
  assert.match(out, /OK {3}テストの仕組み: vitest/);
  assert.match(out, /NG {3}vitest: devDependencies に vitest が無い/);
  // node → vitest を求めない
  out = doctorIn({ 'package.json': pkg, '.issue-kit/config.json': cfg({ runner: 'node', files: ['tests/*.test.mjs'] }) });
  assert.match(out, /OK {3}テストの仕組み: node --test（test\.files: tests\/\*\.test\.mjs）/);
  assert.deepEqual(testLines(out).filter((l) => /vitest/.test(l)), []);
  // command → 道具の実体（作業場所の直下・PATH）。package.json が無くても npm test を見ない
  out = doctorIn({ '.issue-kit/config.json': cfg({ runner: 'command', command: ['tools/mvnw.cmd', 'verify'], resultDirs: ['target/surefire-reports'] }), 'tools/mvnw.cmd': '@echo off\r\n' });
  assert.match(out, /OK {3}テストの仕組み: command（tools\/mvnw\.cmd verify・道具 /);
  assert.doesNotMatch(out, /npm test|package\.json/);
  out = doctorIn({ '.issue-kit/config.json': cfg({ runner: 'command', command: ['git', 'status'], resultDirs: ['r'] }) });
  assert.match(out, /OK {3}テストの仕組み: command（git status・道具 /);
  out = doctorIn({ '.issue-kit/config.json': cfg({ runner: 'command', command: ['no-such-tool-kit-test'], resultDirs: ['r'] }) });
  assert.match(out, /NG {3}テストの仕組み: command の道具 no-such-tool-kit-test が見つからない/);
  out = doctorIn({ '.issue-kit/config.json': cfg({ runner: 'command', command: ['./mvnw'], resultDirs: ['r'] }) });
  assert.match(out, /NG {3}テストの仕組み: command の道具 \.\/mvnw が見つからない/);
});

test('点検（Node 版）: deny に .issue-kit が無ければ NG', () => {
  const settings = read(join(nodeRoot, 'files/.claude/issue-run/settings.json'));
  const s = JSON.parse(settings);
  assert.ok(s.permissions.deny.includes('Edit(//{{REPO}}/.issue-kit/**)') && s.permissions.deny.includes('Write(//{{REPO}}/.issue-kit/**)'), '版の設定に .issue-kit の deny が無い');
  const ok = doctorIn({ '.claude/issue-run/settings.json': settings });
  assert.match(ok, /OK {3}設定: deny /);
  for (const drop of ['Edit(//{{REPO}}/.issue-kit/**)', 'Write(//{{REPO}}/.issue-kit/**)']) {
    const without = { ...s, permissions: { ...s.permissions, deny: s.permissions.deny.filter((d) => d !== drop) } };
    const out = doctorIn({ '.claude/issue-run/settings.json': JSON.stringify(without) });
    assert.ok(out.split(/\r?\n/).some((l) => l.startsWith('NG   設定: deny に無い: ') && l.includes(drop)), `${drop}\n${out}`);
  }
});

test('入れる脚本（Node 版）: 設定のひな形を写し、--update で残す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-node-config-'));
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    const inst = join(nodeRoot, 'install.mjs');
    const tpl = readFileSync(join(nodeRoot, 'files/.issue-kit/config.json'));
    assert.deepEqual(JSON.parse(tpl.toString('utf8')), { test: { runner: 'vitest' } });
    // 初めて入れる: ひな形を写す
    const r = node([inst, '--target', dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(readFileSync(join(dir, '.issue-kit/config.json')), tpl);
    // 利用先が書き換えた後の --update: 残して知らせる
    const mine = JSON.stringify({ test: { runner: 'node', files: ['tests/*.test.mjs'] } });
    writeFileSync(join(dir, '.issue-kit/config.json'), mine);
    const u = node([inst, '--target', dir, '--update']);
    assert.equal(u.status, 0, u.stdout + u.stderr);
    assert.match(u.stdout, /^keep +\.issue-kit\/config\.json$/m);
    assert.match(lastLine(u), /残した 1 件/);
    assert.equal(read(join(dir, '.issue-kit/config.json')), mine, '利用先の設定を上書きした');
    assert.ok(existsSync(join(dir, '.issue-kit/version')), '版のファイルが無い');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // 初めて入れるときに既に設定があれば、残してキットの物を横に置く
  const dir2 = mkdtempSync(join(tmpdir(), 'kit-node-config-aside-'));
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir2]).status, 0);
    mkdirSync(join(dir2, '.issue-kit'));
    const mine = JSON.stringify({ test: { runner: 'command', command: ['dotnet', 'test'], resultDirs: ['r'] } });
    writeFileSync(join(dir2, '.issue-kit/config.json'), mine);
    const r = node([join(nodeRoot, 'install.mjs'), '--target', dir2]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^aside +\.issue-kit\/config\.json → \.issue-kit\/config\.kit\.json$/m);
    assert.equal(read(join(dir2, '.issue-kit/config.json')), mine);
    assert.ok(existsSync(join(dir2, '.issue-kit/config.kit.json')));
  } finally { rmSync(dir2, { recursive: true, force: true }); }
});

test('入れる脚本（Node 版）: 版のファイルにキットのリポジトリを書く', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-ver-'));
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    const r = node([join(nodeRoot, 'install.mjs'), '--target', dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // 期待する値はキットの origin から（GitHub でなければ空）
    const origin = spawnSync('git', ['-C', kit, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout.trim();
    const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(origin);
    const v = JSON.parse(read(join(dir, '.issue-kit/version')));
    assert.equal(v.repo, m ? `${m[1]}/${m[2]}` : '');
    if (m) assert.match(v.repo, /^[^/]+\/[^/]+$/);
    assert.match(v.commit, /^[0-9a-f]{40}$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// editions/node/ を一時のキットに写して git init・コミットし、そのキット自身に入れる（本物のキットの作業ツリーの汚れに左右されない）
function withSelfKit(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-self-'));
  try {
    cpSync(nodeRoot, join(dir, 'editions/node'), { recursive: true });
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    gitIn(dir, 'add', '-A', '-f');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'kit').status, 0);
    const install = (...args) => node([join(dir, 'editions/node/install.mjs'), '--target', dir, ...args]);
    const version = () => JSON.parse(read(join(dir, '.issue-kit/version')));
    fn({ dir, install, version });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('入れる脚本（Node 版）: キット自身に入れ直しても、写した物で dirty を true にしない', () => {
  withSelfKit(({ dir, install, version }) => {
    // 初めて入れる: 写した物は未コミットになるが、写す前のキットはきれい
    const r = install();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(version().dirty, false, r.stdout);
    assert.doesNotMatch(r.stdout, /未コミットの変更あり/);
    gitIn(dir, 'add', '-A', '-f');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'install').status, 0);
    // files/ の直しをコミットしてから入れ直す: 写す物があっても false
    writeFileSync(join(dir, 'editions/node/files/scripts/test.mjs'), '// changed\n');
    gitIn(dir, 'add', '-A');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'fix').status, 0);
    const u = install('--update');
    assert.equal(u.status, 0, u.stdout + u.stderr);
    assert.match(u.stdout, /^update +scripts\/test\.mjs$/m);
    assert.equal(read(join(dir, 'scripts/test.mjs')), '// changed\n');
    assert.equal(version().dirty, false, u.stdout);
    const head = gitIn(dir, 'rev-parse', 'HEAD').stdout.trim();
    assert.equal(version().commit, head);
  });
});

test('入れる脚本（Node 版）: キットの .issue-kit/version だけに差があっても dirty を true にしない', () => {
  withSelfKit(({ dir, install, version }) => {
    // 入れて、版のファイル（.issue-kit/version）を含めてコミットする
    assert.equal(install().status, 0);
    gitIn(dir, 'add', '-A', '-f');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'install').status, 0);
    // files/ の直しをコミットして入れ直す: 版のファイルが書き換わり、その差だけが残る
    writeFileSync(join(dir, 'editions/node/files/scripts/test.mjs'), '// changed\n');
    gitIn(dir, 'add', '-A');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'fix').status, 0);
    assert.equal(install('--update').status, 0);
    gitIn(dir, 'add', '-A', '-f', '--', '.', ':(exclude).issue-kit/version');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'reinstall').status, 0);
    assert.equal(gitIn(dir, 'status', '--porcelain').stdout.trim(), 'M .issue-kit/version');
    // もう一度入れ直す: 版のファイルの差だけなので false
    const u = install('--update');
    assert.equal(u.status, 0, u.stdout + u.stderr);
    assert.equal(version().dirty, false, u.stdout);
    assert.doesNotMatch(u.stdout, /未コミットの変更あり/);
    assert.equal(version().commit, gitIn(dir, 'rev-parse', 'HEAD').stdout.trim());
  });
});

test('入れる脚本（Node 版）: キットに未コミットの変更があれば dirty を true にする', () => {
  withSelfKit(({ dir, install, version }) => {
    // files/ を直してコミットせずに入れる: commit に写した中身が入っていないので true
    writeFileSync(join(dir, 'editions/node/files/scripts/test.mjs'), '// changed\n');
    const r = install();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(version().dirty, true, r.stdout);
    assert.match(r.stdout, /未コミットの変更あり/);
  });
});

// 点検をキットの版だけ見る形で回す。最新のコミットは環境変数で与える（GitHub を呼ばない）
function doctorKitVersion(version, latest) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-doctor-ver-'));
  try {
    mkdirSync(join(dir, 'scripts/issue-run'), { recursive: true });
    for (const s of ['doctor', 'lib', 'proc']) writeFileSync(join(dir, `scripts/issue-run/${s}.mjs`), readFileSync(join(nodeRoot, `files/scripts/issue-run/${s}.mjs`)));
    spawnSync('git', ['init', '-q', dir]);
    spawnSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/someone/app.git']);
    if (version) { mkdirSync(join(dir, '.issue-kit')); writeFileSync(join(dir, '.issue-kit/version'), JSON.stringify(version)); }
    const r = node([join(dir, 'scripts/issue-run/doctor.mjs')], { cwd: dir, env: { ...process.env, ISSUE_KIT_LATEST_COMMIT: latest } });
    return r.stdout.split(/\r?\n/).filter((l) => / キットの版: /.test(l));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const oldSha = 'a'.repeat(40), newSha = 'b1c2d3e'.padEnd(40, '0');

test('点検（Node 版）: キットの版が古ければ知らせる', () => {
  const lines = doctorKitVersion({ repo: 'owner/kit', commit: oldSha }, newSha);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /^WARN キットの版: 古い/);
  assert.ok(lines[0].includes('b1c2d3e'), '新しいコミットの短い SHA が無い');
  assert.ok(lines[0].includes('node <キット>/editions/node/install.mjs --target . --update'), '入れ直すコマンドが無い');
  // 読めないときも WARN（NG にしない）
  const none = doctorKitVersion({ repo: 'owner/kit', commit: oldSha }, '');
  assert.match(none[0], /^WARN キットの版: キットの最新を読めない/);
  // リポジトリの無い古い版のファイルも WARN
  assert.match(doctorKitVersion({ commit: oldSha }, newSha)[0], /^WARN キットの版: .*リポジトリが無い/);
});

test('点検（Node 版）: キットの版が新しければ OK', () => {
  const lines = doctorKitVersion({ repo: 'owner/kit', commit: newSha }, newSha);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /^OK {3}キットの版: owner\/kit の最新 b1c2d3e と同じ/);
});

// ---- テストの入口の決まり（仕様 11 章）と、それを支える部品（設計書 test-entry-config-design.md 2.6・2.12） ----

test('仕様にテストの入口の章がある', () => {
  const spec = read(join(kit, 'shared/spec/issue-run-spec.md'));
  assert.match(spec, /^## 11\. テストの入口/m);
  const ch11 = spec.split(/^## 11\. テストの入口/m)[1];
  for (const w of ['Result:', '終了コード', '0 件', '.issue-run/test-results/junit.xml', '.issue-kit/config.json', 'runner', 'resultDirs', 'filterArgs']) assert.ok(ch11.includes(w), w);
  const ch9 = spec.split(/^## 9\. /m)[1].split(/^## 10\. /m)[0];
  assert.match(ch9, /^\| テストの入口 \|/m);
  assert.match(ch9, /^\| テストの入口の設定 \|/m);
  // 表の列が崩れていない（9 章の 2 行は 3 列）
  for (const l of ch9.split('\n').filter((x) => /^\| テストの入口/.test(x))) assert.equal(l.replace(/\\\|/g, '').split('|').length - 2, 3, l);
});

test('テストの入口の設定: 無い・読めない・形が違うなら直し方を出す', () => {
  const ng = (text, re) => { const r = lib.parseTestConfig(text); assert.equal(r.ok, false, String(text)); assert.match(r.why, /^\.issue-kit\/config\.json /); assert.match(r.why, re, r.why); };
  ng(null, /が無い.*例 \{/);
  ng('{ 読めない', /JSON として読めない/);
  ng(JSON.stringify({ issueKit: { testRunner: 'node' } }), /test の欄が無い/);
  ng(JSON.stringify({ test: {} }), /test\.runner は vitest・node・command.*無い/);
  ng(JSON.stringify({ test: { runner: 'jest' } }), /test\.runner.*"jest"/);
  ng(JSON.stringify({ test: { runner: 'node' } }), /test\.files が無い/);
  ng(JSON.stringify({ test: { runner: 'node', files: 'tests/*.test.mjs' } }), /test\.files が無い/);
  ng(JSON.stringify({ test: { runner: 'command', command: [], resultDirs: ['r'] } }), /test\.command が無い/);
  ng(JSON.stringify({ test: { runner: 'command', command: ['dotnet', 'test'] } }), /test\.resultDirs が無い/);
  ng(JSON.stringify({ test: { runner: 'command', command: ['dotnet'], resultDirs: ['r'], filterArgs: '--filter' } }), /test\.filterArgs は文字列の配列/);
  const ok = (cfg) => { const r = lib.parseTestConfig(JSON.stringify(cfg)); assert.equal(r.ok, true, r.why); assert.deepEqual(r.config, cfg); };
  ok({ test: { runner: 'vitest' } });
  ok({ test: { runner: 'node', files: ['tests/*.test.mjs'] } });
  ok({ test: { runner: 'command', command: ['dotnet', 'test'], resultDirs: ['r'], filterArgs: ['--filter', 'DisplayName~{filter}'] } });
  assert.equal(lib.parseTestConfig('\uFEFF{ "test": { "runner": "vitest" } }').ok, true, 'BOM つきも読む');
});

test('JUnit の数え方: skipped を数えず failure と error を落ちたとする', () => {
  const xml = `<?xml version="1.0"?><testsuites tests="99" failures="0"><testsuite name="s">
<testcase name="通る" classname="c"/>
<testcase name="通る 2" classname="c"></testcase>
<testcase name="落ちる"><failure message="x">x</failure></testcase>
<testcase name="壊れる"><error message="y"/></testcase>
<testcase name="飛ばす"><skipped/></testcase>
</testsuite></testsuites>`;
  assert.deepEqual(lib.countJunit(xml), { ran: 4, bad: 2 });
  assert.deepEqual(lib.countJunit(''), { ran: 0, bad: 0 });
  assert.deepEqual(lib.countJunit('<testsuites tests="3"></testsuites>'), { ran: 0, bad: 0 }, '属性に頼らない');
  // node --test の「ファイルの名前の testcase」を外せる
  const withFile = `${xml}<testcase name="tests/a.test.mjs"/>`;
  assert.deepEqual(lib.countJunit(withFile, { isFileEntry: (n) => n === 'tests/a.test.mjs' }), { ran: 4, bad: 2 });
  assert.deepEqual(lib.countJunit(withFile), { ran: 5, bad: 2 });
});

test('JUnit の数え方: CDATA と system-out の中の文字で数えを誤らない', () => {
  const xml = `<testsuites><testsuite name="s">
<testcase name="a"><system-out><![CDATA[log </testcase><testcase name="偽"><failure>]]></system-out></testcase>
<testcase name="b"><system-err>&lt;failure&gt; <failure> <skipped/> </testcase></system-err></testcase>
<testcase name="c"><!-- <failure> --></testcase>
<testcase name="d"><failure><![CDATA[expected </testcase> <error>]]></failure></testcase>
</testsuite></testsuites>`;
  assert.deepEqual(lib.countJunit(xml), { ran: 4, bad: 1 });
  // 中身の無い <system-out/>（.NET が書く形）の後ろの testcase を隠さない
  const empty = '<testcase name="e"><system-out /></testcase><testcase name="f"><failure/><system-out>x</system-out></testcase>';
  assert.deepEqual(lib.countJunit(empty), { ran: 2, bad: 1 });
  assert.equal((lib.mergeJunit([{ name: 'e.xml', text: empty }]).match(/<testcase /g) ?? []).length, 2);
});

test('JUnit をまとめる: testcase をそのまま写す', () => {
  const a = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites><testsuite name="A" tests="2">
<testcase name="名前 &amp; 記号" classname="X.Y" time="0.1"/>
<testcase name="落ちる" classname="X.Y"><failure message="m"><![CDATA[a </testcase> b]]></failure><system-out>out</system-out></testcase>
</testsuite></testsuites>`;
  const b = '<testsuite name="B"><testsuite name="入れ子"><testcase name="飛ばす"><skipped/></testcase></testsuite></testsuite>';
  const merged = lib.mergeJunit([{ name: 'raw/a&<"b>.xml', text: a }, { name: 'b.xml', text: b }]);
  assert.match(merged, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<testsuites>\n/);
  assert.ok(merged.includes('<testsuite name="raw/a&amp;&lt;&quot;b&gt;.xml">'), merged);
  assert.ok(merged.includes('<testcase name="名前 &amp; 記号" classname="X.Y" time="0.1"/>'), merged);
  assert.ok(merged.includes('<testcase name="落ちる" classname="X.Y"><failure message="m"><![CDATA[a </testcase> b]]></failure><system-out>out</system-out></testcase>'), merged);
  assert.ok(merged.includes('<testcase name="飛ばす"><skipped/></testcase>'), merged);
  assert.equal((merged.match(/<testsuite /g) ?? []).length, 2, '入れ子は写さない');
  assert.deepEqual(lib.countJunit(merged), { ran: 2, bad: 1 });
  assert.equal(lib.mergeJunit([]), '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n</testsuites>\n');
});

test('新しい結果の選び方: できた物と変わった物だけを選ぶ', () => {
  const before = [
    { path: 'r/same.xml', mtimeMs: 100, size: 10 },
    { path: 'r/touched.xml', mtimeMs: 100, size: 10 },
    { path: 'r/grown.xml', mtimeMs: 100, size: 10 },
    { path: 'r/gone.xml', mtimeMs: 100, size: 10 },
  ];
  const after = [
    { path: 'r/same.xml', mtimeMs: 100, size: 10 },
    { path: 'r/touched.xml', mtimeMs: 200, size: 10 },
    { path: 'r/grown.xml', mtimeMs: 100, size: 12 },
    { path: 'r/new.xml', mtimeMs: 50, size: 10 },
  ];
  assert.deepEqual(lib.pickNewResults(before, after), ['r/touched.xml', 'r/grown.xml', 'r/new.xml']);
  assert.equal(lib.pickNewResults([], after).length, 4);
  assert.deepEqual(lib.pickNewResults(after, after), [], 'すぐに回し直して何も書かなければ何も選ばない');
});

test('指示文の確かめの行: runner に合わせた名前を出す', () => {
  assert.equal(lib.testRunnerLabel({ test: { runner: 'vitest' } }), 'vitest');
  assert.equal(lib.testRunnerLabel({ test: { runner: 'node', files: ['tests/*.test.mjs'] } }), 'node --test');
  assert.equal(lib.testRunnerLabel({ test: { runner: 'command', command: ['dotnet', 'test'], resultDirs: ['r'] } }), 'dotnet');
  assert.equal(lib.testRunnerLabel({ test: { runner: 'command', command: ['tools\\mvnw.cmd', '-q', 'verify'], resultDirs: ['r'] } }), 'mvnw.cmd');
  assert.equal(lib.testRunnerLabel({ test: { runner: 'command', command: ['./mvnw', 'verify'], resultDirs: ['r'] } }), 'mvnw');
  assert.equal(lib.testRunnerLabel(null), '.issue-kit/config.json の道具', '設定が無ければ設定の置き場を出す');
  // 指示文の行に入る
  const line = lib.workspaceStateText(lib.testRunnerLabel({ test: { runner: 'node', files: ['tests/*.test.mjs'] } }));
  assert.ok(line.includes('node scripts/test.mjs（node --test）'), line);
  assert.doesNotMatch(line, /vitest/);
  assert.ok(lib.workspaceStateText('dotnet').includes('node scripts/test.mjs（dotnet）'));
  assert.equal(lib.testRunnerOf, undefined, 'testRunnerOf は消した');
});

test('確認コマンドの手伝い: 長い出力でも Result 行を読む', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-check-lib-'));
  try {
    mkdirSync(join(dir, 'scripts', 'issue-run'), { recursive: true });
    cpSync(join(nodeRoot, 'files/scripts/issue-run/check-lib.mjs'), join(dir, 'scripts/issue-run/check-lib.mjs'));
    // 偽のテストの入口：2MB を出してから Result: PASS（spawnSync の既定の受け取りは 1MB）
    writeFileSync(join(dir, 'scripts', 'test.mjs'), "const line = 'x'.repeat(1023) + '\\n';\nfor (let i = 0; i < 2048; i++) process.stdout.write(line);\nconsole.log('Result: PASS 1/1');\n");
    const r = node(['--input-type=module', '-e', "import { runTests, done } from './scripts/issue-run/check-lib.mjs'; runTests(); done();"], { cwd: dir });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /OK {2}テスト 全部: Result: PASS 1\/1/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('テストの入口（command）: cmd.exe を通す道具の引数に % があれば起動しない', { skip: process.platform !== 'win32' && 'Windows だけ' }, async () => {
  const proc = await import('../editions/node/files/scripts/issue-run/proc.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'kit-cmd-'));
  try {
    // 起動されたら印のファイルを書く .cmd
    writeFileSync(join(dir, 'tool.cmd'), '@echo off\r\necho ran> "%~dp0ran.txt"\r\n');
    for (const bad of ['50%', '%PATH%', 'a"b']) {
      const r = proc.runInherit('tool.cmd', [bad], { cwd: dir });
      assert.equal(r.started, false, bad);
      assert.notEqual(r.code, 0, bad);
      assert.match(r.error, /cmd\.exe を通す道具の引数に % と " は使えない/);
      assert.equal(existsSync(join(dir, 'ran.txt')), false, `${bad} で起動した`);
    }
    // % が無ければ起動する（作業場所の直下の .cmd を名前で）
    const ok = proc.runInherit('tool.cmd', ['a b'], { cwd: dir });
    assert.equal(ok.code, 0, ok.error);
    assert.equal(existsSync(join(dir, 'ran.txt')), true, '起動していない');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('stats: 結果のコメントの 1 行目を読む', () => {
  const span = lib.formatSpan(new Date(2026, 10, 9, 9, 36), new Date(2026, 10, 9, 9, 42));
  const written = lib.headLine({ status: 'PASS', minutes: 6, span, rounds: 1, commits: 2, folder: 'app', branch: 'main', head: '81093d6c', logDir: '.issue-run/logs/1/' });
  assert.deepEqual(lib.parseResultHead(`${written}\n\n| 合格の条件 | 判定 |`), { script: 'issue-run.mjs', status: 'PASS', minutes: 6, rounds: 1, commits: 2 });
  assert.deepEqual(lib.parseResultHead('issue-run.ps1: **NOT-PASS** — 31 分（2026-11-09 23:50〜2026-11-10 00:21）・3 回・コミット 0 件・作業場所 x（main・HEAD abcdef1）・ログ y'),
    { script: 'issue-run.ps1', status: 'NOT-PASS', minutes: 31, rounds: 3, commits: 0 });
  assert.deepEqual(lib.parseResultHead('issue-run.ps1: **PASS** — 7 分・1 回・コミット 2 件・作業場所 x'),
    { script: 'issue-run.ps1', status: 'PASS', minutes: 7, rounds: 1, commits: 2 });
  assert.deepEqual(lib.parseResultHead('issue-run.mjs: **ABORTED** — 90 分（2026-11-09 10:00〜11:30）・2 回・コミット 1 件\r\n'),
    { script: 'issue-run.mjs', status: 'ABORTED', minutes: 90, rounds: 2, commits: 1 });
});

test('stats: 形の違う行は読まない', () => {
  for (const t of [
    '確かめました。ありがとう',
    'issue-run.mjs: **起動しなかった** — 合格の条件が無い',
    'issue-run.mjs: PASS — 6 分（2026-11-09 09:36〜09:42）・1 回・コミット 2 件',
    'issue-run.mjs: **OK** — 6 分（2026-11-09 09:36〜09:42）・1 回・コミット 2 件',
    'メモ\nissue-run.mjs: **PASS** — 6 分・1 回・コミット 2 件',
    '', null, undefined,
  ]) assert.equal(lib.parseResultHead(t), null, String(t));
});

test('stats: 上限の数を 1 か所で決める', () => {
  const { issues: maxIssues, comments: maxComments } = lib.STATS_LIMITS;
  const human = { body: '人のコメント' };
  const withComments = (number, n) => ({ number, labels: [], comments: Array.from({ length: n }, () => human) });
  // 引数なしの既定が STATS_LIMITS から読む：コメントが上限の数の Issue は知らせ、1 件少ない Issue は知らせない
  const s = lib.runStats([withComments(1, maxComments), withComments(2, maxComments - 1)]);
  assert.deepEqual(s.manyComments, [1]);
  assert.equal(s.truncated, false);
  // Issue が上限の数のときに切られたかもしれないと知らせる
  const full = Array.from({ length: maxIssues }, (_, i) => withComments(i + 1, 0));
  assert.equal(lib.runStats(full).truncated, true);
  assert.equal(lib.runStats(full.slice(1)).truncated, false);
});

test('stats: 回した・合格・1 回目で合格・分を数える', () => {
  const c = (status, minutes, rounds = 1) => ({ body: `issue-run.mjs: **${status}** — ${minutes} 分（2026-11-09 09:00〜09:30）・${rounds} 回・コミット 1 件・作業場所 a` });
  const human = { body: '人のコメント' };
  const L = (...n) => n.map((name) => ({ name }));
  const issues = [
    { number: 1, labels: L('claude-run', 'claude-done'), comments: [c('PASS', 10)] },                 // 1 回目で合格
    { number: 2, labels: L('claude-run', 'claude-done'), comments: [c('NOT-PASS', 20, 3), human, c('PASS', 5)] }, // やり直して合格
    { number: 3, labels: L('claude-run', 'claude-failed'), comments: [c('ABORTED', 90, 2)] },        // 合格していない
    { number: 4, labels: L('claude-run'), comments: [human] },                                       // まだ回していない
    { number: 5, labels: [], comments: [] },                                                         // 無人の回と関係ない
    { number: 6, labels: L('claude-done'), comments: [c('PASS', 8, 2)] },                            // 1 回の中で 2 回目に合格
  ];
  const s = lib.runStats(issues);
  assert.equal(s.issues, 6);
  assert.equal(s.ran, 4);
  assert.equal(s.passed, 3);
  assert.equal(s.firstTry, 1);
  assert.deepEqual(s.minutes, { median: 10, total: 43 });   // 10・25・8 → 中央値 10
  assert.deepEqual(s.results, { total: 5, 'PASS': 3, 'NOT-PASS': 1, 'ABORTED': 1 });
  assert.deepEqual(s.labels, { run: 4, done: 3, failed: 1, runNotRan: 1 });
  assert.equal(s.truncated, false);
  assert.deepEqual(s.manyComments, []);
  // 偶数の件数の中央値は真ん中の 2 つの平均を四捨五入（10・25 → 17.5 → 18）
  assert.deepEqual(lib.runStats(issues.slice(0, 2)).minutes, { median: 18, total: 35 });
  assert.deepEqual(lib.runStats([]).minutes, { median: null, total: 0 });
  // 取りこぼしの知らせ
  const many = lib.runStats([{ number: 9, labels: [], comments: Array.from({ length: 100 }, () => human) }, ...issues], { limit: 7 });
  assert.equal(many.truncated, true);
  assert.deepEqual(many.manyComments, [9]);
});
