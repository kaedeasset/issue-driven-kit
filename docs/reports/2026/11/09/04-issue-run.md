# Issue の無人実行のまとめ（20261109-202010）

`scripts/issue-run/issue-run.mjs` が自動で書いた。リポジトリ kaedeasset/issue-driven-kit・作業場所 issue-driven-kit（main）・ログ `.issue-run/logs/20261109-202010/`

| Issue | 結果 | 分 | 時刻 | 回 | コミット | 断られたツール |
|---|---|---|---|---|---|---|
| #49 stats の上限の数（1000・100）を lib.mjs の STATS_LIMITS の 1 か所で決める | PASS | 3 | 2026-11-09 20:20〜20:23 | 1 | 1 |  |

## #49 stats の上限の数（1000・100）を lib.mjs の STATS_LIMITS の 1 か所で決める — PASS

- `2358eda refactor: stats の上限の数を lib.mjs の STATS_LIMITS の 1 か所で決める`

### 結果: 合格
| 合格の条件 | 判定 | 根拠（コマンドと結果） |
|---|---|---|
| lib.mjs が STATS_LIMITS（issues 1000・comments 100）を export し、runStats の既定がそこから読む | 合 | `export const STATS_LIMITS = { issues: 1000, comments: 100 };`・`runStats(issues, { limit = STATS_LIMITS.issues, commentLimit = STATS_LIMITS.comments } = {})`（判定役が差分で確認） |
| stats.mjs が STATS_LIMITS を読み込み、1000・「100 件」を自分で書かない | 合 | `import { runStats, STATS_LIMITS } from './lib.mjs'`・`LIMIT = STATS_LIMITS.issues`・`${STATS_LIMITS.comments} 件以上`。grep で 1000・「100 件」無し |
| 試験 `stats: 上限の数を 1 か所で決める` があって通る・前からの stats: 3 本も通る | 合 | `node scripts/test.mjs --filter 'stats:'` → 4 本 ✔・`Result: PASS 4/4` |
| stats.mjs と lib.mjs のほかは変えない（試験と設計書を除く） | 合 | `git diff HEAD~1 --stat` → lib.mjs・stats.mjs・tests/node.test.mjs だけ |
| キットの試験が全部通る | 合 | `node scripts/test.mjs` → `Result: PASS 110/110`（fail 0・skip 2 は環境の条件で飛ぶ物） |

判定は別のエージェント（判定役）が差分とテストのログから行い、5 条件すべて合とした。

### やったこと
- `lib.mjs` に `STATS_LIMITS` を足し、`runStats` の既定をそこから読むようにした
- `stats.mjs` が `STATS_LIMITS` を読み込み、`--limit` と知らせの文に使うようにした
- `tests/node.test.mjs` の stats: の並びに試験 `stats: 上限の数を 1 か所で決める` を足した（設計書 5 章どおり：引数なしで、コメントが上限の数の Issue は知らせ・1 件少ない物は知らせない・Issue が上限の数で truncated）

### コミット
- 2358eda refactor: stats の上限の数を lib.mjs の STATS_LIMITS の 1 か所で決める

### 選んだこと（自分で決めた点・違っていたときの戻し方）
- stats.mjs の `const LIMIT` は残し、`STATS_LIMITS.issues` を入れる形にした（変える行を少なくするため）。違っていれば `LIMIT` を `STATS_LIMITS.issues` に置き換える新しいコミットで直す

### やらなかったこと・断られた操作
- 直下の写しの入れ直し（`install.mjs --update`）は Issue のとおり回していない。合格の後に会話で回す

### 未採用の改善（気づいたがブロッカーでないもの。直さない）
- 試験に `assert.deepEqual(lib.STATS_LIMITS, { issues: 1000, comments: 100 })` を足せば値そのものも試験で確かめられる（いまは確認コマンドだけが見ている）

