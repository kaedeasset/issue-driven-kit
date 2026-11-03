#!/usr/bin/env node
// test.mjs — テストの入口（Node 版）。テストの道具を回し、最後の 1 行に Result: を出す。合否は終了コード（PASS 0・FAIL 1）。決まりの正: キットの仕様 11 章。
//   node scripts/test.mjs                   # 全部
//   node scripts/test.mjs --filter <名前>    # テストの名前で絞る（vitest の -t・node --test の --test-name-pattern・command の filterArgs）
//   node scripts/test.mjs --file <パス>      # ファイルで絞る（vitest と node だけ）
// どの道具で回すかは .issue-kit/config.json の test の欄で決める（無ければ FAIL。既定の値は無い）。
//   { "test": { "runner": "vitest" } }
//   { "test": { "runner": "node", "files": ["tests/*.test.mjs"] } }
//   { "test": { "runner": "command", "command": ["dotnet", "test", …], "resultDirs": [".issue-run/test-results/raw"], "filterArgs": ["--filter", "DisplayName~{filter}"] } }
// command は決めたコマンドを起動し、resultDirs の JUnit の XML のうち、この回で新しくできたか変わった物だけを集める。
// テストが 0 件なら FAIL（名前の打ち間違いやテストの消し忘れで「合格」にしない）。結果の XML は .issue-run/test-results/junit.xml。
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTestConfig, countJunit, mergeJunit, pickNewResults, testRunnerLabel } from './issue-run/lib.mjs';
import { runInherit } from './issue-run/proc.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const fail = (why) => { console.log(`Result: FAIL (${why})`); process.exit(1); };

const configPath = join(root, '.issue-kit', 'config.json');
let configText = null;
if (existsSync(configPath)) {
  try { configText = readFileSync(configPath, 'utf8'); } catch (e) { fail(`.issue-kit/config.json が読めない: ${e.message}`); }
}
const parsed = parseTestConfig(configText);
if (!parsed.ok) fail(`${parsed.why}。古い形の package.json の欄は読まない（移す手順はキットの移行ガイド）`);
const t = parsed.config.test;
const label = testRunnerLabel(parsed.config);

const xml = join(root, '.issue-run', 'test-results', 'junit.xml');
mkdirSync(dirname(xml), { recursive: true });
rmSync(xml, { force: true });
// node --test の中から呼ばれたときの印（NODE_TEST_CONTEXT）を渡すと、子が結果を親へ送って XML を書かない。外して渡す
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;

let code;
let isFileEntry = () => false;
if (t.runner === 'vitest') {
  const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitest)) fail('vitest が無い。npm install を先に（devDependencies に vitest が要る）');
  const args = [vitest, 'run', '--reporter=default', '--reporter=junit', `--outputFile.junit=${xml}`, '--passWithNoTests'];
  if (opt('--filter')) args.push('-t', opt('--filter'));
  if (opt('--file')) args.push(opt('--file'));
  code = runInherit('node', args, { cwd: root, env }).code;
} else if (t.runner === 'node') {
  const args = ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', `--test-reporter-destination=${xml}`];
  if (opt('--filter')) args.push(`--test-name-pattern=${opt('--filter')}`);
  args.push(...(opt('--file') ? [opt('--file')] : t.files));
  code = runInherit('node', args, { cwd: root, env }).code;
  // node --test は、名前で絞って 1 本も当たらなかったファイルを「ファイルの名前の testcase」として書く。それは試験の数に入れない
  isFileEntry = (n) => /\.(mjs|cjs|js|ts|mts|cts)$/.test(n) && existsSync(join(root, n));
} else {
  if (opt('--file')) fail('command では --file を使えない。filterArgs で名前で絞る');
  const args = t.command.slice(1);
  if (opt('--filter') !== undefined) {
    if (!t.filterArgs) fail('command で名前で絞れない（.issue-kit/config.json の test.filterArgs が無い。例 ["--filter", "DisplayName~{filter}"]）');
    // 置き換えは関数で渡す（名前の $& や $$ を置き換えの記号として読まない）
    args.push(...t.filterArgs.map((s) => s.replaceAll('{filter}', () => opt('--filter'))));
  }
  // 起動の前後で resultDirs の .xml の一覧を比べ、新しくできた物と変わった物だけを読む（前の回の XML を数えない・消さない）
  const list = () => t.resultDirs.flatMap((d) => xmlFiles(resolve(root, d))).filter((e) => resolve(e.path) !== resolve(xml));
  const before = list();
  const r = runInherit(t.command[0], args, { cwd: root, env });
  if (!r.started && /cmd\.exe/.test(r.error)) fail(r.error);
  code = r.code;
  const picked = pickNewResults(before, list());
  if (!picked.length) fail(`結果の XML が無い（resultDirs: ${t.resultDirs.join(' ')}）・${label} の終了コード ${code}${r.error ? `・${r.error}` : ''}`);
  writeFileSync(xml, mergeJunit(picked.map((p) => ({ name: relative(root, p).replaceAll('\\', '/'), text: readFileSync(p, 'utf8') }))), 'utf8');
}

if (!existsSync(xml)) fail(`結果の XML が無い・${label} の終了コード ${code}`);
const { ran, bad } = countJunit(readFileSync(xml, 'utf8'), { isFileEntry });
if (ran <= 0) fail('0/0（テストが 0 件）');
if (bad > 0 || code !== 0) fail(`${ran - bad}/${ran}`);
console.log(`Result: PASS ${ran}/${ran}`);
process.exit(0);

// フォルダーの下の .xml を全部（パス・更新時刻・大きさ）。フォルダーが無ければ空
function xmlFiles(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return xmlFiles(p);
    if (!e.isFile() || !/\.xml$/i.test(e.name)) return [];
    const s = statSync(p);
    return [{ path: p, mtimeMs: s.mtimeMs, size: s.size }];
  });
}
