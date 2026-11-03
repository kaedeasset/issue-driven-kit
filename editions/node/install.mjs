#!/usr/bin/env node
// install.mjs — Issue 駆動キットの Node 版を、利用先のリポジトリに写す（Windows・Mac・Node.js だけ）。
// 約束の正: docs/design/issue-driven-kit-basic-design.md の 3.4。導入の手順: shared/manuals/issue-driven-kit-install-guide.md
//   node editions/node/install.mjs --target <リポジトリ> --dry-run   # 写すファイルとぶつかるファイルを出すだけ
//   node editions/node/install.mjs --target <リポジトリ>             # 初めて入れる（既にあるファイルは上書きしない。CLAUDE.md がぶつかったらキットの物を CLAUDE.kit.md として横に置く）
//   node editions/node/install.mjs --target <リポジトリ> --update    # 入っている版を上げる（利用先が手を入れるファイルは上書きせずに残し、「残した N 件」で知らせる）
// 写すだけ。コミット・push・パッケージの追加はしない（vitest の追加は導入ガイドの手順 4 で Claude Code が行う）。最後の行が Result: PASS／FAIL。
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const EDITION = 'node';
const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(here, '../..');
const filesRoot = join(here, 'files');
// 利用先が中身を書き足すファイル。--update でも上書きせず、差があれば知らせる。初めて入れるときにぶつかったら、キットの物を .kit の名前で横に置く
// .issue-kit/config.json はテストの入口の設定（ひな形は vitest。利用先が自分の道具に書き換える。キットの仕様 11 章）
const USER_OWNED = ['CLAUDE.md', '.issue-kit/config.json'];
// 写した後に作る空の置き場（.gitkeep を置く）
const EMPTY_DIRS = ['docs/inspecs', 'docs/reports'];
// .gitignore に無ければ足す行（ファイルごとは写さない。たいてい既にあるため）
const GITIGNORE_LINES = ['.issue-run/'];

const a = process.argv.slice(2);
const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const target = opt('--target');
const dryRun = a.includes('--dry-run');
const update = a.includes('--update');
const fail = (why) => { console.log(`Result: FAIL (${why})`); process.exit(1); };
const git = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });

if (!target) fail('--target <リポジトリ> が要る');
if (!existsSync(target) || !statSync(target).isDirectory()) fail(`入れる先のフォルダーが無い: ${target}`);
const top = git(target, 'rev-parse', '--show-toplevel');
if (top.status !== 0) fail(`入れる先が git の作業場所でない: ${target}`);
const targetRoot = resolve(top.stdout.trim());
if (resolve(target).toLowerCase() !== targetRoot.toLowerCase()) fail(`入れる先は git の作業場所の直下にする（直下は ${targetRoot}）`);

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
const files = walk(filesRoot).map((f) => relative(filesRoot, f).replaceAll('\\', '/')).sort();
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
// 横に置く名前: 拡張子の前に .kit（CLAUDE.md → CLAUDE.kit.md）。拡張子の無い名前・点で始まる名前は後ろに付ける（.gitignore → .gitignore.kit）
const asideName = (rel) => {
  const slash = rel.lastIndexOf('/') + 1, dot = rel.lastIndexOf('.');
  return dot > slash ? `${rel.slice(0, dot)}.kit${rel.slice(dot)}` : `${rel}.kit`;
};

const plan = files.map((rel) => {
  const from = join(filesRoot, rel), to = join(targetRoot, rel);
  let state;
  if (!existsSync(to)) state = 'new';
  else if (hash(from) === hash(to)) state = 'same';
  else if (update && !USER_OWNED.includes(rel)) state = 'update';
  else if (update) state = 'keep';
  else if (USER_OWNED.includes(rel)) state = 'aside';
  else state = 'conflict';
  const aside = state === 'aside' ? asideName(rel) : undefined;
  return { rel, from, to, state, aside, asideTo: aside && join(targetRoot, aside) };
});

const label = { new: '写す', same: '同じ', update: '上げる', keep: '残す（利用先が手を入れる物。差あり）', aside: '横に置く（利用先が手を入れる物。既にある物は残す）', conflict: 'ぶつかる（既にあって中身が違う）' };
for (const p of plan) console.log(`${p.state.padEnd(8)} ${p.rel}${p.aside ? ` → ${p.aside}` : ''}`);
const gi = join(targetRoot, '.gitignore');
const giText = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
const giMissing = GITIGNORE_LINES.filter((l) => !giText.split(/\r?\n/).map((x) => x.trim()).includes(l));
if (giMissing.length) console.log(`gitignore .gitignore に足す: ${giMissing.join(' ')}`);
const count = {};
for (const p of plan) count[p.state] = (count[p.state] ?? 0) + 1;
console.log(`合計 ${plan.length} 件: ${Object.keys(count).sort().map((k) => `${label[k]} ${count[k]}`).join('・')}`);

const conflicts = plan.filter((p) => p.state === 'conflict');
if (conflicts.length) {
  console.log('既にあって中身が違うファイルがある。上書きしない。中身を足す形にするか、--update で入れ直す:');
  conflicts.forEach((c) => console.log(`  ${c.rel}`));
  fail(`ぶつかる ${conflicts.length} 件`);
}
if (dryRun) { console.log('Result: PASS (DryRun・何も書いていない)'); process.exit(0); }

// キットの版と未コミットの有無は、写す前に測る（キット自身に入れ直すとき、写した物を未コミットとして数えない）
// キットの .issue-kit/version は入れる脚本が書くファイルで写す中身ではないので、差を数えない
const c = git(kitRoot, 'rev-parse', 'HEAD');
const dirty = !!git(kitRoot, 'status', '--porcelain', '--', '.', ':(exclude).issue-kit/version').stdout.trim();

for (const p of plan.filter((x) => x.state === 'new' || x.state === 'update')) {
  mkdirSync(dirname(p.to), { recursive: true });
  copyFileSync(p.from, p.to);
}
// 横に置く物はキットの物なので、毎回キットの物にそろえる（中身が同じなら書かない）
const asides = plan.filter((p) => p.state === 'aside');
for (const p of asides) {
  if (!existsSync(p.asideTo) || hash(p.asideTo) !== hash(p.from)) copyFileSync(p.from, p.asideTo);
}
for (const d of EMPTY_DIRS) {
  const full = join(targetRoot, d);
  if (!existsSync(full)) { mkdirSync(full, { recursive: true }); writeFileSync(join(full, '.gitkeep'), ''); }
}
if (giMissing.length) writeFileSync(gi, giText + (giText && !giText.endsWith('\n') ? '\n' : '') + '# Issue 駆動キット（無人の回のログ・テストの結果）\n' + giMissing.join('\n') + '\n', 'utf8');

// キットのリポジトリ（owner/name。キットの origin から）。点検（doctor.mjs）がその既定のブランチの最新と比べる。GitHub でなければ空
const om = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(git(kitRoot, 'remote', 'get-url', 'origin').stdout?.trim() ?? '');
const repo = om ? `${om[1]}/${om[2]}` : '';
const version = { kit: 'issue-driven-kit', edition: EDITION, repo, commit: c.status === 0 ? c.stdout.trim() : '', dirty, installedAt: new Date().toISOString(), files };
mkdirSync(join(targetRoot, '.issue-kit'), { recursive: true });
writeFileSync(join(targetRoot, '.issue-kit', 'version'), JSON.stringify(version, null, 2) + '\n', 'utf8');

const written = plan.filter((p) => p.state === 'new' || p.state === 'update').length;
if (asides.length) {
  console.log('既にある物は残し、キットの物を横に置いた。既にある物にキットの物の中身を足してから、横に置いた物を消す（Claude Code に頼める）:');
  asides.forEach((p) => console.log(`  ${p.aside}（${p.rel} に足す）`));
}
// --update で残した物（利用先が手を入れる物で中身が違う）。上書きしないので、キットの物との差は人が Claude Code と見る
const kept = plan.filter((p) => p.state === 'keep');
if (kept.length) {
  console.log(`利用先が手を入れる物は上書きせずに残した。キットの物（<キット>/editions/${EDITION}/files/<パス>）と比べて、要る所を足す（Claude Code に頼める）:`);
  kept.forEach((p) => console.log(`  ${p.rel}`));
}
console.log(`Result: PASS (${written} 件を写した${kept.length ? `・残した ${kept.length} 件` : ''}${asides.length ? `・横に置いた ${asides.length} 件` : ''}・版 ${EDITION}・キット ${version.commit.slice(0, 8)}${dirty ? '（未コミットの変更あり）' : ''})`);
process.exit(0);
