#!/usr/bin/env node
// stats.mjs — 無人の回の実績を数える（Node 版）。GitHub の Issue の結果のコメントから、回した数・合格・1 回目で合格・かかった分を出す。
// 数え方の正: docs/guides/working/issue-run.md の「実績を数える」。数える部品は lib.mjs の parseResultHead・runStats。
//   node scripts/issue-run/stats.mjs                      # 作業場所の origin のリポジトリを数える
//   node scripts/issue-run/stats.mjs --repo <owner/name>  # ほかのリポジトリ（Unity 版を入れた物も）を数える
// 合否を出す道具ではないので Result: 行は出さない。終了コード 0 = 数えられた・1 = gh が失敗した・引数が違う。
import { run, resolveCmd } from './proc.mjs';
import { runStats } from './lib.mjs';

const LIMIT = 1000;
const argv = process.argv.slice(2);
let repo = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--repo') { repo = argv[++i]; if (!repo) { console.error('--repo の後に <owner/name> が要る'); process.exit(1); } }
  else { console.error(`知らない引数: ${argv[i]}（使えるのは --repo <owner/name> だけ）`); process.exit(1); }
}

if (!resolveCmd('gh')) { console.error('gh が無い。GitHub CLI を入れる'); process.exit(1); }
const args = ['issue', 'list', '--state', 'all', '--limit', String(LIMIT), '--json', 'number,labels,comments', ...(repo ? ['--repo', repo] : [])];
const r = run('gh', args);
if (r.code !== 0) { console.error(`gh issue list が失敗した（終了コード ${r.code}）:\n${(r.stderr || r.stdout).trim()}`); process.exit(1); }
let issues;
try { issues = JSON.parse(r.stdout); } catch (e) { console.error(`gh の出力を JSON として読めない: ${e.message}`); process.exit(1); }

const s = runStats(issues, { limit: LIMIT });
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
console.log(`リポジトリ: ${repo ?? '作業場所の origin'}（Issue ${s.issues} 件を読んだ）`);
console.log(`回した Issue: ${s.ran} 件`);
console.log(`合格: ${s.passed} 件（${pct(s.passed, s.ran)}）`);
console.log(`1 回目で合格: ${s.firstTry} 件（${pct(s.firstTry, s.ran)}）`);
console.log(`分（合格した Issue ごとの合計）: 中央値 ${s.minutes.median ?? '-'} 分・合計 ${s.minutes.total} 分`);
console.log(`結果のコメント: ${s.results.total} 件（PASS ${s.results.PASS}・NOT-PASS ${s.results['NOT-PASS']}・ABORTED ${s.results.ABORTED}）`);
console.log(`ラベル（参考）: claude-run ${s.labels.run} 件（うちまだ回していない物 ${s.labels.runNotRan} 件）・claude-done ${s.labels.done} 件・claude-failed ${s.labels.failed} 件`);
if (s.truncated) console.log(`注意: Issue がちょうど ${LIMIT} 件。${LIMIT} 件で切られたかもしれない`);
if (s.manyComments.length) console.log(`注意: コメントが 100 件以上ある Issue（取りこぼしたかもしれない）: ${s.manyComments.map((n) => `#${n}`).join(' ')}`);
