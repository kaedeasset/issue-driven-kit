// kit.test.mjs — キット自身の試験（node --test tests/）。npm のパッケージは使わない。
// 合格の条件の正: docs/design/issue-driven-kit-basic-design.md の 1.2（K-1〜K-8）。
//   K-1  共有の部品と Unity 版の部品が全部ある
//   K-3  （Unity 側）Unity 版の読み取りの関数が、見本を答えどおりに読み、Node 版の見本の js の塊を確認コマンドにしない … Windows と pwsh があるときだけ
//   K-4  Unity 版を空の git の作業場所に入れると、参照（KaedeScapeBuii）と同じ物ができる … 環境変数 KIT_UNITY_REFERENCE があるときだけ
//   共有の決まり（原則・進め方の決まり）が、各版の CLAUDE.md にそのまま入っている
//   移行ガイドの節・issueKit の語が残っていない・Node 版のひな形が言語とテストの道具を決め打ちしない（設計 docs/design/test-entry-config-design.md の 2.12）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync, statSync, cpSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gitIn, pwshCrashed, runWithRetry } from './helpers.mjs';

const kit = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(kit, p), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
// pwsh そのものが落ちたときだけ、2 回までやり直す（やり直すたびに 1 行残す。tests/helpers.mjs）
const pwsh = (args, opts) => runWithRetry(() => spawnSync('pwsh', args, opts));
// pwsh があるかの確かめもやり直しを通す（ここで落ちると Unity 版の試験が黙って全部飛ばされるため）。Windows でないときは黙って飛ばす
const hasPwsh = process.platform === 'win32' && runWithRetry(() => spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0'])).status === 0;
if (process.platform === 'win32' && !hasPwsh) console.error('pwsh が無いので Unity 版の試験を飛ばす（pwsh -NoProfile -Command "exit 0" が 0 で終わらない）');

const unityFiles = [
  'CLAUDE.md',
  '.claude/issue-run/prompt.md', '.claude/issue-run/settings.json', '.claude/issue-run/stop-hook.ps1',
  ...['commit', 'design-cycle', 'document-authoring', 'file-header', 'github-issue', 'lane-sync', 'pr', 'push', 'save-report']
    .map((s) => `.claude/skills/${s}/SKILL.md`),
  '.github/ISSUE_TEMPLATE/claude-run.md', '.gitattributes', '.gitignore',
  'Scripts/issue-run.ps1', 'Scripts/issue-run-doctor.ps1', 'Scripts/Sync-Lanes.ps1', 'Scripts/unity-test.ps1',
  'Docs/Guides/README.md',
  'Docs/Guides/Working/issue-run.md', 'Docs/Guides/Working/issue-driven-development.md',
  'Docs/Guides/Working/worktree-lanes.md', 'Docs/Guides/Working/github-repo.md',
  'Docs/Guides/Procedures/issue-goal-setting.md', 'Docs/Guides/Procedures/unity-test-procedure.md',
  'Docs/Guides/Decisions/test-plan.md', 'Docs/Guides/Decisions/genai-cli-mcp-policy.md',
];
const sharedFiles = [
  'shared/spec/issue-run-spec.md',
  'shared/claude-md/principles.md', 'shared/claude-md/conventions.md',
  'shared/manuals/issue-driven-guide-for-teams.md', 'shared/manuals/issue-driven-prompt-manual.md',
  'shared/manuals/prompt-suggestions-guide.md', 'shared/manuals/issue-driven-repo-setup.md',
  'shared/manuals/issue-driven-kit-install-guide.md', 'shared/manuals/issue-driven-kit-migration-guide.md',
  'shared/reading/why-suggestions-worked.md', 'LICENSE',
  'docs/design/issue-driven-kit-basic-design.md',
  'editions/unity/install.ps1',
  ...Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(2, '0'))
    .flatMap((n) => [`shared/fixtures/issues/${n}.md`, `shared/fixtures/issues/${n}.expected.json`]),
];

test('K-1 共有の部品と Unity 版の部品が全部ある', () => {
  const missing = [...sharedFiles, ...unityFiles.map((f) => `editions/unity/files/${f}`)].filter((p) => !existsSync(join(kit, p)));
  assert.deepEqual(missing, [], `無い: ${missing.join(', ')}`);
});

test('Unity 版の files/ には、一覧に無い物が入っていない', () => {
  const root = join(kit, 'editions/unity/files');
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [relative(root, join(d, e.name)).replaceAll('\\', '/')]);
  const extra = walk(root).filter((f) => !unityFiles.includes(f));
  assert.deepEqual(extra, [], `一覧に無い: ${extra.join(', ')}`);
});

test('共有の決まりが、各版の CLAUDE.md にそのまま入っている', () => {
  for (const block of ['shared/claude-md/principles.md', 'shared/claude-md/conventions.md']) {
    const text = read(block).trim();
    for (const edition of readdirSync(join(kit, 'editions'))) {
      const md = join('editions', edition, 'files/CLAUDE.md');
      if (!existsSync(join(kit, md))) continue;
      assert.ok(read(md).includes(text), `${md} に ${block} が無い（版の CLAUDE.md の決まりを変えたら shared/ も同じに直す）`);
    }
  }
});

test('移行ガイド: 決まった節がある', () => {
  const heads = read('shared/manuals/issue-driven-kit-migration-guide.md').split('\n').filter((l) => l.startsWith('## '));
  for (const h of ['## 1. この版で変わること', '## 2. 移す手順', '## 3. 確かめ方', '## 4. .NET と Java の設定の例', '## 5. 古い形のまま上げたとき']) {
    assert.ok(heads.includes(h), `移行ガイドに「${h}」の節が無い`);
  }
});

// 古い設定の欄（package.json の issueKit）は読まない（後方互換を作らない）。語が残っていると、利用者が古い形を書いてしまう。
// 探すのはキットの版・共有の部品・見本（移行ガイドは古い形を説明するので除く。node_modules は見ない）
test('issueKit の語が、キットの版と共有の部品と見本に残っていない', () => {
  const skip = new Set(['shared/manuals/issue-driven-kit-migration-guide.md']);
  const walk = (d) => readdirSync(join(kit, d), { withFileTypes: true }).flatMap((e) => {
    const rel = `${d}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel);
    return [rel];
  });
  const hits = ['editions', 'shared', 'examples'].flatMap(walk)
    .filter((f) => !skip.has(f) && /\.(md|mjs|js|cjs|ts|json|jsonc|ps1|txt|yml|yaml)$/.test(f))
    .filter((f) => read(f).includes('issueKit'));
  assert.deepEqual(hits, [], `issueKit が残っている: ${hits.join(', ')}`);
});

// Node 版は .NET・Java の利用先にも入れる。ひな形に言語とテストの道具を決め打ちすると、利用先で誤りになる（設計 2.9）
test('Node 版のひな形が言語とテストの道具を決め打ちしない', () => {
  const md = read('editions/node/files/CLAUDE.md');
  assert.ok(!md.includes('テストは **vitest**'), 'ひな形の CLAUDE.md が vitest を決め打ちしている');
  assert.ok(!/^npm run typecheck\s+#/m.test(md), 'ひな形の CLAUDE.md のコマンドが npm run typecheck を決め打ちしている');
  assert.ok(md.includes('.issue-kit/config.json'), 'ひな形の CLAUDE.md にテストの入口の設定の置き場が無い');
  const commit = read('editions/node/files/.claude/skills/commit/SKILL.md');
  assert.ok(!/Node\.js＋TypeScript/.test(commit), 'commit スキルが言語を決め打ちしている');
  assert.ok(!commit.includes('（テストは vitest）'), 'commit スキルがテストの道具を決め打ちしている');
});

test('見本の答えの形', () => {
  for (const d of ['shared/fixtures/issues', 'shared/fixtures/issues-node']) {
    for (const f of readdirSync(join(kit, d)).filter((f) => f.endsWith('.expected.json'))) {
      const e = JSON.parse(read(`${d}/${f}`));
      for (const k of ['source', 'items', 'checkLang', 'check', 'prerequisites', 'tracked', 'protected']) assert.ok(k in e, `${d}/${f} に ${k} が無い`);
      assert.ok(e.items.length > 0 && e.check.length > 0, `${d}/${f} の条件か確認コマンドが空`);
    }
  }
});

test('K-3（Unity 側）Unity 版の読み取りが見本を答えどおりに読む', { skip: !hasPwsh && 'Windows と pwsh が要る' }, () => {
  const r = pwsh(['-NoProfile', '-File', join(kit, 'tests/unity/read-fixtures.ps1')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Result: PASS/);
});

test('K-3（Unity 側）Node 版の見本の確認コマンドを読まない', { skip: !hasPwsh && 'Windows と pwsh が要る' }, () => {
  const r = pwsh(['-NoProfile', '-File', join(kit, 'tests/unity/read-fixtures.ps1'), '-Fixtures', 'issues-node'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Result: PASS/);
});

test('K-4 Unity 版を入れると参照と同じ物ができる', { skip: (!hasPwsh || !process.env.KIT_UNITY_REFERENCE) && 'Windows・pwsh・環境変数 KIT_UNITY_REFERENCE（KaedeScapeBuii のパス）が要る' }, () => {
  const ref = process.env.KIT_UNITY_REFERENCE;
  const dir = mkdtempSync(join(tmpdir(), 'kit-unity-'));
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    const dry = pwsh(['-NoProfile', '-File', join(kit, 'editions/unity/install.ps1'), '-Target', dir, '-DryRun'], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.ok(!existsSync(join(dir, 'CLAUDE.md')), 'DryRun なのに書いた');
    const r = pwsh(['-NoProfile', '-File', join(kit, 'editions/unity/install.ps1'), '-Target', dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // 公開の写しは、PC の中のパス（C:\Users\<名前>\）だけ <you> に伏せてある（shared/SOURCE.md）。参照も同じに伏せてから比べる
    const mask = (t) => t.replace(/C:\\Users\\[^\\<>\s]+\\/g, 'C:\\Users\\<you>\\').replace(/C:\/Users\/[^/<>\s]+\//g, 'C:/Users/<you>/').replace(/`c\/Users\/[^/<>\s]+\//g, '`c/Users/<you>/');
    const hash = (p) => createHash('sha256').update(mask(readFileSync(p, 'utf8'))).digest('hex');
    // 参照と違ってよいのは、利用先が書くひな形の CLAUDE.md だけ
    const allowed = new Set(['CLAUDE.md']);
    const differ = unityFiles.filter((f) => !allowed.has(f) && hash(join(dir, f)) !== hash(join(ref, f)));
    assert.deepEqual(differ, [], `参照と違う: ${differ.join(', ')}`);
    const v = JSON.parse(readFileSync(join(dir, '.issue-kit/version'), 'utf8'));
    assert.equal(v.edition, 'unity');
    // もう一度入れると、全部「同じ」で何も書かない
    const again = pwsh(['-NoProfile', '-File', join(kit, 'editions/unity/install.ps1'), '-Target', dir], { encoding: 'utf8' });
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /Result: PASS \(0 件を写した/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('試験の手伝い: pwsh が落ちたときだけ 2 回までやり直し、やり直すたびに 1 行残す', () => {
  // 偽の run: 渡した結果を順に返す（pwsh は回さない）
  const fake = (...results) => { let i = 0; const run = () => results[Math.min(i++, results.length - 1)]; run.calls = () => i; return run; };
  const ok = { status: 0, stdout: 'Result: PASS', stderr: '' };
  const fail = { status: 1, stdout: 'Result: FAIL', stderr: '' };
  const clr = { status: 0xC0000005, stdout: '', stderr: '' };
  const clrText = { status: 1, stdout: '', stderr: 'Fatal error. Internal CLR error.' };
  const retry = (run) => { const lines = []; const r = runWithRetry(run, { crashed: pwshCrashed, tries: 2, log: (l) => lines.push(l) }); return { r, lines }; };
  // 落ちなければ 1 回だけ・何も残さない（脚本の FAIL ではやり直さない）
  for (const res of [ok, fail]) {
    const run = fake(res);
    const { r, lines } = retry(run);
    assert.equal(r, res);
    assert.equal(run.calls(), 1);
    assert.deepEqual(lines, []);
  }
  // 1 回落ちてから通る: 1 行残して 2 回目の結果を返す
  let run = fake(clr, ok);
  let { r, lines } = retry(run);
  assert.equal(r, ok);
  assert.equal(run.calls(), 2);
  assert.deepEqual(lines, ['pwsh が落ちたのでやり直す（1 回目・終了コード 3221225477）']);
  // 落ち続ける: 2 回までやり直し（計 3 回）、2 行残して最後の結果を返す
  run = fake(clrText, clr, clr, ok);
  ({ r, lines } = retry(run));
  assert.equal(r, clr);
  assert.equal(run.calls(), 3);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^pwsh が落ちたのでやり直す（1 回目・終了コード 1）$/);
  assert.match(lines[1], /^pwsh が落ちたのでやり直す（2 回目・終了コード 3221225477）$/);
  // 既定は pwshCrashed・2 回まで・console.error
  const errors = [];
  const orig = console.error;
  console.error = (l) => errors.push(l);
  try { run = fake(clr, clr, clr, ok); r = runWithRetry(run); } finally { console.error = orig; }
  assert.equal(r, clr);
  assert.equal(run.calls(), 3);
  assert.equal(errors.length, 2);
});

test('入れる脚本（Unity 版）: 既にある CLAUDE.md・.gitignore は残し、横に .kit を置いて残りを入れる', { skip: !hasPwsh && 'Windows と pwsh が要る' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-unity-aside-'));
  const inst = (...args) => pwsh(['-NoProfile', '-File', join(kit, 'editions/unity/install.ps1'), '-Target', dir, ...args], { encoding: 'utf8' });
  const files = join(kit, 'editions/unity/files');
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    writeFileSync(join(dir, 'CLAUDE.md'), '# mine\n');
    writeFileSync(join(dir, '.gitignore'), 'Library/\n');
    // DryRun: 横に置く予定が出て、何も書かない
    const dry = inst('-DryRun');
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.match(dry.stdout, /^aside +CLAUDE\.md → CLAUDE\.kit\.md$/m);
    assert.match(dry.stdout, /^aside +\.gitignore → \.gitignore\.kit$/m);
    assert.match(dry.stdout, /横に置く（[^）]*） 2/);
    assert.ok(!existsSync(join(dir, 'CLAUDE.kit.md')) && !existsSync(join(dir, '.gitignore.kit')), 'DryRun なのに横に置いた');
    assert.ok(!existsSync(join(dir, 'Scripts/issue-run.ps1')), 'DryRun なのに書いた');
    // 本番: 既にある物は元のまま・横の物はキットの物・ほかは全部入る
    const r = inst();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Result: PASS \(\d+ 件を写した・横に置いた 2 件/);
    assert.match(r.stdout, /CLAUDE\.kit\.md（CLAUDE\.md に足す）/);
    assert.match(r.stdout, /\.gitignore\.kit（\.gitignore に足す）/);
    assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), '# mine\n');
    assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'Library/\n');
    assert.deepEqual(readFileSync(join(dir, 'CLAUDE.kit.md')), readFileSync(join(files, 'CLAUDE.md')));
    assert.deepEqual(readFileSync(join(dir, '.gitignore.kit')), readFileSync(join(files, '.gitignore')));
    for (const f of unityFiles) assert.ok(existsSync(join(dir, f)), `写っていない: ${f}`);
    assert.deepEqual(readFileSync(join(dir, '.gitattributes')), readFileSync(join(files, '.gitattributes')));
    const v = JSON.parse(readFileSync(join(dir, '.issue-kit/version'), 'utf8'));
    assert.ok(!v.files.some((f) => f.endsWith('.kit') || f.includes('.kit.')), '版のファイルに横に置いた名前を入れた');
    // もう一度入れても PASS（何も写さない）
    const again = inst();
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /Result: PASS \(0 件を写した・横に置いた 2 件/);
    // 利用先が手を入れる物でないファイルがぶつかると、何も書かずに FAIL
    rmSync(join(dir, 'CLAUDE.kit.md'));
    writeFileSync(join(dir, 'Scripts/unity-test.ps1'), '# mine\n');
    const c = inst();
    assert.equal(c.status, 1, c.stdout + c.stderr);
    assert.match(c.stdout, /Result: FAIL \(ぶつかる 1 件\)/);
    assert.ok(!existsSync(join(dir, 'CLAUDE.kit.md')), 'FAIL なのに横に置いた');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('入れる脚本（Unity 版）: -Update は利用先が手を入れる物を残し、一覧と最後の行に残した数を出して残りを上げる', { skip: !hasPwsh && 'Windows と pwsh が要る' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-unity-update-'));
  const inst = (...args) => pwsh(['-NoProfile', '-File', join(kit, 'editions/unity/install.ps1'), '-Target', dir, ...args], { encoding: 'utf8' });
  const files = join(kit, 'editions/unity/files');
  try {
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    assert.equal(inst().status, 0);
    // 何も変えていなければ、残す物は無く「残した」を出さない
    const same = inst('-Update');
    assert.equal(same.status, 0, same.stdout + same.stderr);
    assert.doesNotMatch(same.stdout, /残した/);
    // 利用先が CLAUDE.md・.gitignore と脚本に手を入れた後に上げる
    writeFileSync(join(dir, 'CLAUDE.md'), '# mine\n');
    writeFileSync(join(dir, '.gitignore'), 'Library/\n');
    writeFileSync(join(dir, 'Scripts/unity-test.ps1'), '# mine\n');
    const u = inst('-Update');
    assert.equal(u.status, 0, u.stdout + u.stderr);
    assert.match(u.stdout, /^keep +CLAUDE\.md$/m);
    assert.match(u.stdout, /^keep +\.gitignore$/m);
    assert.match(u.stdout, /^update +Scripts\/unity-test\.ps1$/m);
    const lines = u.stdout.trim().split(/\r?\n/);
    assert.match(lines.at(-1), /^Result: PASS \(1 件を写した・残した 2 件・版 unity/);
    // 最後の行の前に、キットの物と比べるよう促す 1 行と残した物の一覧
    assert.deepEqual(lines.slice(-3, -1).sort(), ['  .gitignore', '  CLAUDE.md']);
    assert.match(lines.at(-4), /上書きせずに残した。キットの物（<キット>\/editions\/unity\/files\/<パス>）と比べて/);
    assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), '# mine\n', '残す物を上書きした');
    assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'Library/\n', '残す物を上書きした');
    assert.deepEqual(readFileSync(join(dir, 'Scripts/unity-test.ps1')), readFileSync(join(files, 'Scripts/unity-test.ps1')), '残りを上げていない');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('入れる脚本（Unity 版）: キット自身に入れ直しても、写した物で dirty を true にしない', { skip: !hasPwsh && 'Windows と pwsh が要る' }, () => {
  // editions/unity/ を一時のキットに写して git init・コミットし、そのキット自身に入れる（本物のキットの作業ツリーの汚れに左右されない）
  const dir = mkdtempSync(join(tmpdir(), 'kit-unity-self-'));
  const inst = (...args) => pwsh(['-NoProfile', '-File', join(dir, 'editions/unity/install.ps1'), '-Target', dir, ...args], { encoding: 'utf8' });
  const version = () => JSON.parse(readFileSync(join(dir, '.issue-kit/version'), 'utf8').replace(/^﻿/, ''));
  try {
    cpSync(join(kit, 'editions/unity'), join(dir, 'editions/unity'), { recursive: true });
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    gitIn(dir, 'add', '-A', '-f');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'kit').status, 0);
    // 初めて入れる: 写した物は未コミットになるが、写す前のキットはきれい
    const r = inst();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(version().dirty, false, r.stdout);
    assert.doesNotMatch(r.stdout, /未コミットの変更あり/);
    gitIn(dir, 'add', '-A', '-f');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'install').status, 0);
    // files/ の直しをコミットしてから入れ直す: 写す物があっても false
    writeFileSync(join(dir, 'editions/unity/files/Scripts/unity-test.ps1'), '# changed\n');
    gitIn(dir, 'add', '-A');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'fix').status, 0);
    const u = inst('-Update');
    assert.equal(u.status, 0, u.stdout + u.stderr);
    assert.match(u.stdout, /^update +Scripts\/unity-test\.ps1$/m);
    assert.equal(version().dirty, false, u.stdout);
    assert.equal(version().commit, gitIn(dir, 'rev-parse', 'HEAD').stdout.trim());
    // files/ を直してコミットせずに入れ直す: commit に写した中身が入っていないので true
    writeFileSync(join(dir, 'editions/unity/files/Scripts/unity-test.ps1'), '# changed again\n');
    const d = inst('-Update');
    assert.equal(d.status, 0, d.stdout + d.stderr);
    assert.equal(version().dirty, true, d.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('入れる脚本（Unity 版）: キットの .issue-kit/version だけに差があっても dirty を true にしない', { skip: !hasPwsh && 'Windows と pwsh が要る' }, () => {
  // 上の試験と同じく、editions/unity/ を一時のキットに写して git init・コミットし、そのキット自身に入れる
  const dir = mkdtempSync(join(tmpdir(), 'kit-unity-ver-'));
  const inst = (...args) => pwsh(['-NoProfile', '-File', join(dir, 'editions/unity/install.ps1'), '-Target', dir, ...args], { encoding: 'utf8' });
  const version = () => JSON.parse(readFileSync(join(dir, '.issue-kit/version'), 'utf8').replace(/^﻿/, ''));
  try {
    cpSync(join(kit, 'editions/unity'), join(dir, 'editions/unity'), { recursive: true });
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    gitIn(dir, 'add', '-A', '-f');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'kit').status, 0);
    // 入れて、版のファイル（.issue-kit/version）を含めてコミットする
    assert.equal(inst().status, 0);
    gitIn(dir, 'add', '-A', '-f');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'install').status, 0);
    // files/ の直しをコミットして入れ直す: 版のファイルが書き換わり、その差だけが残る
    writeFileSync(join(dir, 'editions/unity/files/Scripts/unity-test.ps1'), '# changed\n');
    gitIn(dir, 'add', '-A');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'fix').status, 0);
    assert.equal(inst('-Update').status, 0);
    gitIn(dir, 'add', '-A', '-f', '--', '.', ':(exclude).issue-kit/version');
    assert.equal(gitIn(dir, 'commit', '-q', '-m', 'reinstall').status, 0);
    assert.equal(gitIn(dir, 'status', '--porcelain').stdout.trim(), 'M .issue-kit/version');
    // もう一度入れ直す: 版のファイルの差だけなので false
    const u = inst('-Update');
    assert.equal(u.status, 0, u.stdout + u.stderr);
    assert.equal(version().dirty, false, u.stdout);
    assert.doesNotMatch(u.stdout, /未コミットの変更あり/);
    assert.equal(version().commit, gitIn(dir, 'rev-parse', 'HEAD').stdout.trim());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
