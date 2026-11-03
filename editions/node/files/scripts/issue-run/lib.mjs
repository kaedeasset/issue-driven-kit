// lib.mjs — 無人の Issue 実行（Node 版）の、外に触らない部品。仕様の正: キットの shared/spec/issue-run-spec.md。
// issue-run.mjs・stop-hook.mjs・doctor.mjs・check-lib.mjs とキットの試験が使う。Node.js の標準の部品だけで書く。
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const LABELS = {
  run: { name: 'claude-run', color: '1d76db', description: 'Claude に無人で進めさせてよい' },
  working: { name: 'claude-working', color: 'fbca04', description: 'issue-run.mjs が実行中' },
  done: { name: 'claude-done', color: '0e8a16', description: 'Claude が合格させた・確認待ち' },
  failed: { name: 'claude-failed', color: 'b60205', description: '合格の条件が無い・回数切れ・異常終了' },
};

// 確認コマンドの塊の言語（仕様 9 章）。Node 版は js・javascript・mjs
export const CHECK_LANGS = { node: ['js', 'javascript', 'mjs'] };

const END = '(?![\\s\\S])';   // 文字列の終わり（.NET の \z）

// 読む前に \r と HTML のコメントを消す（仕様 2 章）
export function normalizeBody(body) {
  return String(body ?? '').replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '');
}

function section(text, title) {
  const m = new RegExp(`^##\\s*${title}\\s*$([\\s\\S]*?)(?=^##\\s|${END})`, 'mu').exec(text);
  return m ? m[1] : null;
}

// 2.1 合格の条件：条件の行と確認コマンド
export function parsePassCriteria(body, langs = CHECK_LANGS.node) {
  const sec = section(normalizeBody(body), '合格の条件');
  if (sec === null) return { items: [], check: '' };
  const cm = new RegExp(`^\`\`\`(?:${langs.join('|')})\\s*$([\\s\\S]*?)^\`\`\``, 'mu').exec(sec);
  const check = cm ? cm[1].trim() : '';
  const noCode = sec.replace(/^```[\s\S]*?^```/gmu, '');
  const items = noCode.split('\n').map((l) => l.trim()).filter((l) => /^(-|\*|\p{Nd}+\.)\s+\S/u.test(l));
  return { items, check };
}

// 1.2 書き込みの権限（GitHub の collaborators/<login>/permission の permission）
export const WRITE_PERMISSIONS = ['write', 'maintain', 'admin'];

// 1.2 同じ人を 1 回だけ問う。permissionOf(login) は権限の名前を返すか、読めなければ投げる
export function permissionChecker(permissionOf) {
  const cache = new Map();
  return (login) => {
    const key = String(login ?? '');
    if (!cache.has(key)) {
      let r;
      if (!key) r = { ok: false, why: '作った人が分からない' };
      else {
        try {
          const p = String(permissionOf(key) ?? '');
          r = WRITE_PERMISSIONS.includes(p) ? { ok: true, why: '' } : { ok: false, why: `作った人 ${key} に書き込みの権限が無い（${p || '権限なし'}）` };
        } catch (e) { r = { ok: false, why: `作った人 ${key} の権限が読めない（${String(e?.message ?? e).split('\n')[0]}）` }; }
      }
      cache.set(key, r);
    }
    return cache.get(key);
  };
}

// 1 章：対象の Issue を選ぶ。issues は { number, labels, author: { login } }。外したものは理由と一緒に返す
export function selectTargets(issues, { canWrite, skip = [], max = Infinity }) {
  const targets = [], excluded = [];
  for (const t of [...issues].sort((a, b) => a.number - b.number)) {
    if ((t.labels ?? []).some((l) => skip.includes(l.name))) continue;
    const w = canWrite(t.author?.login);
    if (w.ok) targets.push(t); else excluded.push({ number: t.number, reason: w.why });
  }
  return { targets: targets.slice(0, max), excluded };
}

// 2.2：前提の確かめに使うコメント。脚本の名前で始まり、書き込みの権限のある人が書いた最後のもの
export function lastRunComment(comments, canWrite) {
  return (comments ?? []).filter((c) => /^issue-run\.(ps1|mjs)/.test(String(c.body ?? '')) && canWrite(c.author?.login).ok).at(-1);
}

// 2.2 前提：#番号を重複なしで出てきた順
export function parsePrerequisites(body) {
  const sec = section(normalizeBody(body), '前提');
  if (sec === null) return [];
  const seen = [];
  for (const m of sec.matchAll(/#([0-9]+)/g)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

// 2.3 守るファイル。isFile(語のままのパス)・isTracked(整えたパス) は差し替えられる（試験で使う）
export function protectedFiles(code, { root = '.', trackedList = [], isFile, isTracked } = {}) {
  const tracked = new Set(trackedList.map((p) => p.toLowerCase()));
  const fileOk = isFile ?? ((p) => { const f = join(root, p); return existsSync(f) && statSync(f).isFile(); });
  const trackedOk = isTracked ?? ((rel) => tracked.has(rel.toLowerCase()));
  const found = [];
  for (const raw of String(code).split(/[\s;|&(){}=,]+/u)) {
    const p = raw.trim().replace(/^["'`]+|["'`]+$/g, '');
    if (!p || p.startsWith('-')) continue;
    const rel = p.replaceAll('\\', '/').replace(/^(\.\/|\/)+/, '');
    if (fileOk(p) && trackedOk(rel) && !found.includes(rel)) found.push(rel);
  }
  return found;
}

// 8 章 DryRun：実行用の設定の deny の Edit(…)・Write(…) から、作業場所の下のパス（CLAUDE.md・.claude/** など）を読む
export function denyEditPaths(settingsText) {
  const deny = JSON.parse(settingsText)?.permissions?.deny ?? [];
  const found = [];
  for (const rule of deny) {
    const m = /^(?:Edit|Write)\(\/\/\{\{REPO\}\}\/(.+)\)$/.exec(String(rule));
    if (m && !found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

// 8 章 DryRun：合格の条件の中で、作業場所の直下から見て deny のパスに当たる語（`**` はその下全部。頭にフォルダーが付いた語は当たらない）
export function deniedMentions(text, paths) {
  const hits = [];
  for (const raw of String(text).split(/[\s`'"・、。,;|&(){}=[\]「」『』（）]+/u)) {
    const word = raw.replaceAll('\\', '/').replace(/^(\.\/)+/, '');
    if (!word) continue;
    const hit = paths.some((p) => p.endsWith('/**') ? word.startsWith(p.slice(0, -2)) : word === p);
    if (hit && !hits.includes(word)) hits.push(word);
  }
  return hits;
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

// 守るファイルの指紋（「指紋<TAB>パス」の行）
export function snapshotLines(root, files) {
  return files.map((f) => `${sha256File(join(root, f))}\t${f}`);
}

export function changedProtected(root, snapshotText) {
  const changed = [];
  for (const line of String(snapshotText).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)) {
    const tab = line.indexOf('\t');
    const hash = line.slice(0, tab);
    const rel = line.slice(tab + 1);
    const full = join(root, rel);
    if (!existsSync(full) || !statSync(full).isFile()) { changed.push(rel); continue; }
    if (sha256File(full) !== hash.toUpperCase()) changed.push(rel);
  }
  return changed;
}

export function reportClaimsPass(text) {
  return /^##\s*結果:\s*合格\s*$/mu.test(String(text ?? '').replace(/\r/g, ''));
}

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

// 5 章：開始〜終了（同じ日なら終わりは時刻だけ）
export function formatSpan(from, to) {
  const end = ymd(from) === ymd(to) ? hm(to) : `${ymd(to)} ${hm(to)}`;
  return `${ymd(from)} ${hm(from)}〜${end}`;
}

// 5 章：結果のコメントの 1 行目（形を変えない。前提の判定が「・HEAD <sha>）」を読む）
export function headLine({ script = 'issue-run.mjs', status, minutes, span, rounds, commits, folder, branch, head, logDir }) {
  return `${script}: **${status}** — ${minutes} 分（${span}）・${rounds} 回・コミット ${commits} 件・作業場所 ${folder}（${branch}・HEAD ${head}）・ログ ${logDir}`;
}

// 2.2：前提の Issue の最後の結果のコメントから、合格したコミットの候補を出す
export function headShasFromComment(body) {
  const m = /・HEAD ([0-9a-f]{7,40})）/.exec(body);
  if (m) return [m[1]];
  return [...new Set([...body.matchAll(/\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g)].map((x) => x[0]))];
}

// 3.2：作業場所の POSIX 形（Windows の D:\x\y → d/x/y、Mac の /Users/x/y → Users/x/y）
export function repoPosix(root) {
  const s = root.replaceAll('\\', '/').replace(/\/+$/, '');
  const drive = /^([A-Za-z]):\//.exec(s);
  if (drive) return drive[1].toLowerCase() + s.slice(2);
  return s.replace(/^\/+/, '');
}

export function buildSettings(templateText, { stopHook, root }) {
  const text = templateText.replaceAll('{{STOP_HOOK}}', stopHook.replaceAll('\\', '/')).replaceAll('{{REPO}}', repoPosix(root));
  JSON.parse(text);   // 読めなければここで止める
  return text;
}

export function issuePrompt(templateText, { repo, number, branch, state, report, protectedList }) {
  const prot = protectedList.length ? protectedList.map((p) => `\`${p}\``).join('・') : '（なし）';
  return templateText.replaceAll('{{REPO}}', repo).replaceAll('{{NUMBER}}', String(number)).replaceAll('{{BRANCH}}', branch)
    .replaceAll('{{WORKSPACE_STATE}}', state).replaceAll('{{REPORT}}', report).replaceAll('{{PROTECTED}}', prot);
}

// 仕様 11.2：テストの入口の設定 .issue-kit/config.json の形を確かめる。text は中身の文字列（無ければ null）。
// 読めれば { ok: true, config }、だめなら { ok: false, why }（why は直し方を含む 1 行）
export const TEST_RUNNERS = ['vitest', 'node', 'command'];
const CONFIG_EXAMPLE = '例 { "test": { "runner": "vitest" } }';
export function parseTestConfig(text) {
  const bad = (why) => ({ ok: false, why: `.issue-kit/config.json ${why}` });
  if (text == null) return bad(`が無い。テストの道具を書く（${CONFIG_EXAMPLE}）`);
  let config;
  try { config = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return bad(`が JSON として読めない（${String(e?.message ?? e).split('\n')[0]}）。${CONFIG_EXAMPLE} の形に直す`); }
  const t = config?.test;
  if (!t || typeof t !== 'object' || Array.isArray(t)) return bad(`に test の欄が無い（${CONFIG_EXAMPLE}）`);
  if (!TEST_RUNNERS.includes(t.runner)) return bad(`の test.runner は ${TEST_RUNNERS.join('・')} のどれか（いま: ${t.runner === undefined ? '無い' : JSON.stringify(t.runner)}）`);
  const strings = (v, { empty = false } = {}) => Array.isArray(v) && (empty || v.length > 0) && v.every((s) => typeof s === 'string' && s.length > 0);
  if (t.runner === 'node' && !strings(t.files)) return bad('の test.files が無い（runner が node のとき、node --test で回すファイルの配列。例 ["tests/*.test.mjs"]）');
  if (t.runner === 'command') {
    if (!strings(t.command)) return bad('の test.command が無い（runner が command のとき、先頭が道具で残りが引数の配列。例 ["dotnet", "test"]）');
    if (!strings(t.resultDirs)) return bad('の test.resultDirs が無い（runner が command のとき、JUnit の XML が出るフォルダーの配列）');
    if (t.filterArgs !== undefined && !strings(t.filterArgs)) return bad('の test.filterArgs は文字列の配列（{filter} を名前に置き換える。例 ["--filter", "DisplayName~{filter}"]）');
  }
  return { ok: true, config };
}

// 仕様 11.1：JUnit の XML の、数えるときに中を見ない所（CDATA・system-out・system-err・コメント）を印に置き換える。
// 戻り値の restore(s) で印を元の文字に戻す（まとめるときは元のまま写すため）
function maskJunit(text) {
  const saved = [];
  const keep = (m) => { saved.push(m); return `\u0000${saved.length - 1}\u0000`; };
  const masked = String(text ?? '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, keep)
    .replace(/<!--[\s\S]*?-->/g, keep)
    .replace(/(<system-(?:out|err)\b[^>]*>)([\s\S]*?)(<\/system-(?:out|err)>)/g, (_, a, body, b) => a + keep(body) + b);
  const restore = (s) => {
    let out = s;
    while (/\u0000\d+\u0000/.test(out)) out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => saved[Number(i)]);
    return out;
  };
  return { masked, restore };
}

const TESTCASE = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
const unescXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 仕様 11.1：testcase を 1 つずつ数える。skipped は回った数に入れず、failure か error があれば落ちたとする。
// isFileEntry(name) が真の testcase（node --test の「ファイルの名前の testcase」）は数えない
export function countJunit(xmlText, { isFileEntry = () => false } = {}) {
  const { masked } = maskJunit(xmlText);
  let ran = 0, bad = 0;
  for (const m of masked.matchAll(TESTCASE)) {
    const name = unescXml(/\sname="([^"]*)"/.exec(m[1])?.[1] ?? '');
    if (isFileEntry(name)) continue;
    const body = m[3] ?? '';
    if (/<skipped\b/.test(body)) continue;
    ran++;
    if (/<(failure|error)\b/.test(body)) bad++;
  }
  return { ran, bad };
}

// 仕様 11.2：集めた XML（[{ name, text }]）の testcase を、属性も中身も変えずに 1 つの XML にまとめる。name は testsuite の名前
export function mergeJunit(files) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<testsuites>'];
  for (const f of files ?? []) {
    const { masked, restore } = maskJunit(f.text);
    lines.push(`  <testsuite name="${escXml(f.name ?? '')}">`);
    for (const m of masked.matchAll(TESTCASE)) lines.push(`    ${restore(m[0])}`);
    lines.push('  </testsuite>');
  }
  lines.push('</testsuites>');
  return lines.join('\n') + '\n';
}

// 仕様 11.2：起動の前後の XML の一覧（[{ path, mtimeMs, size }]）を比べ、新しくできた物と、更新時刻か大きさが変わった物のパスを返す
export function pickNewResults(before, after) {
  const old = new Map((before ?? []).map((e) => [e.path, e]));
  return (after ?? []).filter((e) => { const o = old.get(e.path); return !o || o.mtimeMs !== e.mtimeMs || o.size !== e.size; }).map((e) => e.path);
}

// 指示文の確かめの行に出す道具の名前（vitest・node --test・command の先頭の名前）。config は parseTestConfig の config
export function testRunnerLabel(config) {
  const t = config?.test ?? {};
  if (t.runner === 'node') return 'node --test';
  if (t.runner === 'command') return String(t.command?.[0] ?? 'command').replaceAll('\\', '/').split('/').pop();
  return 'vitest';
}

// 指示文の作業場所の行（仕様 9 章）。確かめの行は package.json の issueKit.testRunner に合わせる（無い・読めなければ vitest。test.mjs と同じ）
export function testRunnerOf(pkgText) {
  if (pkgText == null) return 'vitest';
  try { return JSON.parse(pkgText)?.issueKit?.testRunner ?? 'vitest'; } catch { return 'vitest'; }
}

export function workspaceStateText(testRunner) {
  const runner = testRunner === 'node' ? 'node --test' : 'vitest';
  return `この作業場所は使用中にしない。確かめは node scripts/test.mjs（${runner}）で、変えた所に関係するものだけ --filter で回す。wrangler dev などの開発サーバーを起動したままにしない。`;
}

export function continuePrompt(reason, state) {
  return ['まだ合格していない。続けて。', `理由: ${reason}`, `作業場所: ${state}`,
    '合格の条件を全部、実行結果で満たすまで進める。報告ファイルを最新にし、全部満たしたら「## 結果: 合格」と書く。'].join('\n');
}

export function isAuthError(raw) {
  return /Failed to authenticate|OAuth session expired|Invalid API key|\/login/.test(raw);
}

export function isLimitError(json, raw) {
  if (json && !json.is_error) return false;
  if (json && (String(json.api_error ?? '') === 'usage_limit_reached' || Number(json.api_error_status) === 429)) return true;
  return /usage limit|rate limit|session limit|limit reached|limit will reset|resets at|resets \d/i.test(raw);
}

export function tail(text, max = 1500) {
  const t = String(text ?? '').trim();
  return t.length > max ? '…' + t.slice(t.length - max) : t;
}

export function readText(path) {
  return readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
}

// 6 章：まとめの並び
export const STATUS_ORDER = { 'ABORTED': 0, 'NOT-PASS': 1, 'NO-CRITERIA': 2, 'WAITING': 3, 'PASS': 4 };

// 6 章：作業場所はフォルダー名だけ（絶対パスはホームのユーザー名を含むので書かない）
export function folderName(root) {
  return String(root ?? '').replaceAll('\\', '/').replace(/\/+$/, '').split('/').pop();
}

export function summaryMarkdown({ runStamp, script = 'scripts/issue-run/issue-run.mjs', repo, root, folder, branch, logDir, aborted, results }) {
  const where = `${folder ?? folderName(root)}${branch ? `（${branch}）` : ''}`;
  const lines = [`# Issue の無人実行のまとめ（${runStamp}）`, '', `\`${script}\` が自動で書いた。リポジトリ ${repo}・作業場所 ${where}・ログ \`${logDir}\``, ''];
  if (aborted) lines.push(`**途中で止まった: ${aborted}**`, '');
  lines.push('| Issue | 結果 | 分 | 時刻 | 回 | コミット | 断られたツール |', '|---|---|---|---|---|---|---|');
  const sorted = [...results].sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (a.number - b.number));
  for (const r of sorted) lines.push(`| #${r.number} ${r.title} | ${r.status} | ${r.minutes} | ${r.span ?? ''} | ${r.rounds} | ${r.commits.length} | ${r.denials.join(', ')} |`);
  for (const r of sorted) {
    lines.push('', `## #${r.number} ${r.title} — ${r.status}`, '');
    if (r.status !== 'PASS' && r.reason) lines.push(`理由: ${r.reason}`, '');
    for (const c of r.commits) lines.push(`- \`${c}\``);
    if (r.report) lines.push('', r.report.replace(/^## /gm, '### '));
  }
  return lines.join('\n') + '\n';
}

// 6 章：結果の並び（「#7 PASS #8 NOT-PASS」）。0 件は「なし」
export function resultsText(results) {
  return results.length ? results.map((r) => `#${r.number} ${r.status}`).join(' ') : 'なし';
}

// 6 章：履歴 .issue-run/logs/runs.log の 1 行（タブ区切り・改行つき）。まとめが無い回（対象 0 件）は「-」
export function runsLogLine({ runStamp, count, results = [], aborted = '', summary = '' }) {
  const res = resultsText(results) + (aborted ? ` 中断: ${String(aborted).replace(/\s+/g, ' ')}` : '');
  return [runStamp, `対象 ${count} 件`, res, summary || '-'].join('\t') + '\n';
}

// 6 章：終わりの片付けの順番（まとめ → runs.log → 知らせ）。まとめが書けなくても runs.log（まとめは「-」）と知らせは出す。
// runs.log に足せなくても知らせは出す。知らせが投げても外へ出さない。どれも窓に 1 行出すだけで、回の結果は変えない
export function finishRun({ writeSummary, appendRunsLog, notify, log }) {
  let summaryRel = '-';
  try { summaryRel = writeSummary() || '-'; } catch (e) { log(`まとめを書けなかった: ${e?.message ?? e}`); }
  try { appendRunsLog(summaryRel); } catch (e) { log(`runs.log に足せなかった: ${e?.message ?? e}`); }
  try { notify(); } catch (e) { log(`知らせを出せなかった: ${e?.message ?? e}`); }
  return summaryRel;
}

// 6 章：対象 0 件のときに出す、直近に合格した Issue（gh issue list --json number,title,updatedAt の結果）
export function latestDoneText(list) {
  const t = (list ?? [])[0];
  return t ? `直近に合格した Issue: #${t.number} ${t.title}（更新 ${t.updatedAt ?? '?'}）` : '直近に合格した Issue: まだ無い';
}

// 6 章：AppleScript の文字列。\ と " を逃がし、改行は空白にする
export function appleScriptString(text) {
  return `"${String(text).replace(/[\r\n]+/g, ' ').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

// 6 章：終わりの知らせ。窓に出す文（頭にベル）と、Mac なら osascript の引数（ほかは null）。notify が偽なら何も出さない
export function finishNotice({ platform, results = [], aborted = '', notify = true }) {
  if (!notify) return { bell: '', osascript: null };
  const text = `issue-run 終わり: ${resultsText(results)}${aborted ? `（中断: ${aborted}）` : ''}`;
  const osascript = platform === 'darwin' ? ['-e', `display notification ${appleScriptString(text)} with title "issue-run"`] : null;
  return { bell: `\x07${text}`, osascript };
}
