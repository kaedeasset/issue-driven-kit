# Issue の無人実行のまとめ（20261103-201644）

`scripts/issue-run/issue-run.mjs` が自動で書いた。リポジトリ mkanakureon/issue-driven-kit・作業場所 issue-driven-kit（main）・ログ `.issue-run/logs/20261103-201644/`

| Issue | 結果 | 分 | 時刻 | 回 | コミット | 断られたツール |
|---|---|---|---|---|---|---|
| #43 テストの入口の決まりを仕様に書き、部品に関数を足す（回0 P-1 の 1/3） | PASS | 10 | 2026-11-03 20:17〜20:27 | 1 | 2 | Bash |
| #44 テストの入口を .issue-kit/config.json と 3 つの runner に変える（回0 P-1・P-6 の 2/3） | PASS | 19 | 2026-11-03 20:27〜20:46 | 1 | 2 | Bash |
| #45 移行ガイドと文書・ひな形・見本を新しい設定に直す（回0 P-6 の 3/3） | PASS | 12 | 2026-11-03 20:46〜20:58 | 1 | 1 |  |

## #43 テストの入口の決まりを仕様に書き、部品に関数を足す（回0 P-1 の 1/3） — PASS

- `2a593cc fix: 中身の無い system-out の後ろの testcase を隠さない`
- `ca5cddc feat: テストの入口の決まりを仕様に書き部品に関数を足す`

### 結果: 合格

| 合格の条件 | 判定 | 根拠（コマンドと結果） |
|---|---|---|
| 仕様に「## 11. テストの入口」があり、`Result:`・`.issue-run/test-results/junit.xml`・`.issue-kit/config.json`・0 件を書く。9 章の表に「テストの入口」「テストの入口の設定」の行がある | 満たす | 試験「仕様にテストの入口の章がある」が通った（`node scripts/test.mjs` → `Result: PASS 92/92`）。別のエージェントが仕様の 273 行と 9 章の 2 行を確かめた |
| 版の `lib.mjs` に `parseTestConfig`・`countJunit`・`mergeJunit`・`pickNewResults`・`testRunnerLabel`、`proc.mjs` に `runInherit`、`check-lib.mjs` の `runTests` に `maxBuffer` | 満たす | 差分 ca5cddc。別のエージェントが export と `maxBuffer: 64 * 1024 * 1024` を確かめた |
| 設計書 2.12 の試験（確認コマンドの 9 本）が通る | 満たす | 全体を回した後の `.issue-run/test-results/junit.xml` に 9 本とも名前どおりにあり、failure・skipped が無い（Windows だけの `%` の試験も回った） |
| 入口・点検・無人の回・入れる脚本・文書・ひな形・直下の写し・見本を変えない | 満たす | 変えたのは `shared/spec/issue-run-spec.md`・版の `lib.mjs`・`proc.mjs`・`check-lib.mjs`・`tests/node.test.mjs` だけ。`git status` で gitClean のパスに差なし。守るファイル 8 本の SHA256 が開始時と一致（判定役が確かめた） |
| キットの試験が全部通る | 満たす | `node scripts/test.mjs` → `Result: PASS 92/92`（飛ばし 2 本は OS による既存のもの。ログ `full-test.log`） |

### やったこと
- 仕様に 11 章「テストの入口」（5 つの決まり・11.1 数え方・11.2 設定 `.issue-kit/config.json`）を 10 章の後に足し、9 章の表に 2 行足した（`PASS\|FAIL\|BLOCKED` は表が崩れないよう `\|` にした）。
- 版の `lib.mjs` に `parseTestConfig`・`countJunit`・`mergeJunit`・`pickNewResults`・`testRunnerLabel` を足した（CDATA・コメント・system-out/err の中を印に置き換えてから数える・写すときは元に戻す）。
- 版の `proc.mjs` に `runInherit` を足した（`stdio: 'inherit'`・`env` は重ねない・作業場所の直下の道具も起動・cmd.exe を通すとき `%` `"` を断る）。
- 版の `check-lib.mjs` の `runTests` に `maxBuffer` を付けた。
- `tests/node.test.mjs` に 2.12 の試験 9 本を足した。
- 別のエージェントの判定で見つかった欠陥（中身の無い `<system-out/>` の後ろの testcase を隠し、偽の PASS になる）を直し、試験に足した。

### コミット
- ca5cddc feat: テストの入口の決まりを仕様に書き部品に関数を足す
- 2a593cc fix: 中身の無い system-out の後ろの testcase を隠さない

### 選んだこと（自分で決めた点・違っていたときの戻し方）
- `testRunnerOf`・`workspaceStateText` は残した（`issue-run.mjs` が使っていて、この Issue では変えないため）。置き換えは次の Issue で行う。違っていたら次の Issue で消す。
- `countJunit` の `isFileEntry` は testcase の名前（文字列）を受け取る形にした。違っていたら引数の形を変える（呼ぶ側はまだ無い）。
- `runInherit` は、名前にパスの区切りがあるか作業場所の直下に同じ名前の物があればそれを起動し、無ければ PATH を見る。戻り値は `{ code, error, started }`。違っていたら順番を入れ替える。
- `testRunnerLabel` の command は先頭のファイル名（拡張子つき、例 `mvnw.cmd`）を返す。
- 11 章に Node 版だけの細かい決まり（11.1・11.2）を書いたので、仕様の頭の「版ごとの違いは 9 章にだけ書く」に「（テストの入口の Node 版だけの細かい決まりは 11 章）」を足した。

### やらなかったこと・断られた操作
- 「maxBuffer が無い check-lib なら長い出力の試験が落ちる」ことを一時フォルダーで確かめようとしたが、コマンドに `rm` が入っていて断られた。確かめは飛ばした（試験の偽の入口は 2MB を出し、spawnSync の既定の受け取りは 1MB）。
- `docs/design/test-entry-config-design.md` は開始前から変更があった（自分は触っていない・守るファイル）。コミットしていない。
- 直下の写しの入れ直し・入口と点検へのつなぎ込みは、Issue のとおりしていない。

### 未採用の改善（気づいたがブロッカーでないもの。直さない）
- JUnit の XML の属性が一重引用符（`name='x'`）のときや、属性の値に生の `>` があるときは testcase を正しく切り出せない（設計書 2.4 の「弱い所」の表に無い）。
- `runInherit` は、PATH の道具と同じ名前のファイルかフォルダーが作業場所の直下にあると、そちらを起動する。順番を仕様に書くかは次の Issue で決める。


## #44 テストの入口を .issue-kit/config.json と 3 つの runner に変える（回0 P-1・P-6 の 2/3） — PASS

- `5b639c5 fix: 絞る名前の $ を置き換えの記号として読まない`
- `42b5ff8 feat: テストの入口を設定ファイルと 3 つの runner に変える`

### 結果: 合格

| 合格の条件 | 判定 | 根拠（コマンドと結果） |
|---|---|---|
| 版の入口・点検・無人の回・`lib.mjs` に `issueKit` が無い。入口は `.issue-kit/config.json` を読み、`command` の runner がある | OK | 確認コマンドの静かな部分（check の行だけ）を回して `OK  scripts/test.mjs`〜`OK  scripts/issue-run/lib.mjs`・`OK  entry`。`test.mjs` は `parseTestConfig` で設定を読み、`command` の枝がある |
| 指示文の確かめの行が `testRunnerLabel` で名前を出す（`testRunnerOf` を使わない） | OK | 同じ部分を回して `OK  label`。`issue-run.mjs` の `workspaceState()` が `L.testRunnerLabel(...)` を使う。`testRunnerOf` は `lib.mjs` から消し、試験で undefined を確かめた |
| 版に設定のひな形 `.issue-kit/config.json`（vitest）があり、入れる脚本が利用先の物として扱う | OK | `OK  tpl`・`OK  install`。`USER_OWNED = ['CLAUDE.md', '.issue-kit/config.json']`。試験「入れる脚本（Node 版）: 設定のひな形を写し、--update で残す」✔ |
| 実行用の設定の deny が `.issue-kit/` の `Edit` と `Write` を断る | OK | `OK  deny`。`Edit(//{{REPO}}/.issue-kit/**)`・`Write(//{{REPO}}/.issue-kit/**)` を足した |
| 設計書 2.12 の試験（確認コマンドの名前）が通る。今の K-5 の試験は新しい設定で通る | OK | `node scripts/test.mjs` → `Result: PASS 103/103`。requireTests の 19 本が全部 ✔（`.cmd` の試験も Windows で回った）。K-5 の 2 本も ✔ |
| 仕様・共有の部品・文書・ひな形の CLAUDE.md・見本・直下の写しは変えない | OK | `git status --short` → 変えたのは `editions/node/files/{scripts,.claude/issue-run,.issue-kit}`・`editions/node/install.mjs`・`tests/node.test.mjs` だけ（コミット済み）。gitClean の対象は触っていない |
| キットの試験が全部通る | OK | `node scripts/test.mjs` → `Result: PASS 103/103`（飛ばしたのは Windows で見ない実行の権限の試験と、参照が要る K-4 の 2 本。前から同じ） |

判定は別のエージェントが、差分と試験のログから下した（7/7 OK）。そのとき指摘された軽い不具合 1 件（下）も直した。

### やったこと

- `editions/node/files/scripts/test.mjs`: `.issue-kit/config.json` だけを読む（無い・読めない・形が違えば直し方を出して FAIL）。runner は `vitest`・`node`・`command`。`command` は起動の前後で `resultDirs` の XML の一覧を比べ、新しい物と変わった物だけを `junit.xml` にまとめる。`--file` は FAIL、`filterArgs` が無いのに `--filter` を付けたら FAIL。3 つとも `countJunit` で数える。`lib.mjs` と `proc.mjs`（`runInherit`）を読み込む
- `doctor.mjs`: テストの仕組みを設定から見る（vitest の依存・node の files・command の道具の実体を作業場所の直下か PATH で）。`package.json` があるときだけ npm test を見る。deny の need に `.issue-kit/**` の Edit・Write を足した
- `issue-run.mjs`・`lib.mjs`: 確かめの行を `testRunnerLabel(設定)` で出す。`testRunnerOf` を消し、`workspaceStateText` が道具の名前を受け取る形にした
- `settings.json`: deny に `.issue-kit/**` の Edit・Write を足した
- `editions/node/files/.issue-kit/config.json`（vitest のひな形）を足し、`install.mjs` の `USER_OWNED` に入れた
- `tests/node.test.mjs`: 写す物に `lib.mjs`・`proc.mjs` を足し、`package.json` の古い欄を `.issue-kit/config.json` に変えた。K-1 の一覧に設定を足した。古い確かめの行の試験 2 本は消し、`testRunnerLabel` の試験に入れた。command（偽の道具は試験の中の小さな Node の脚本）・点検・入れる脚本の試験を足した
- 見直しの指摘で直した: `filterArgs` の `{filter}` を置き換えるとき、名前の中の `$$`・`$&` が置き換えの記号として読まれていた → 関数で置き換え、試験を足した

### コミット

- `42b5ff8` feat: テストの入口を設定ファイルと 3 つの runner に変える
- `5b639c5` fix: 絞る名前の $ を置き換えの記号として読まない

### 選んだこと（自分で決めた点・違っていたときの戻し方）

- 設定が無いときの確かめの行の名前は「.issue-kit/config.json の道具」にした（vitest と書くと誤りになるため）。違っていたら `lib.mjs` の `testRunnerLabel` の最後の return を直す
- 設定が無いときの入口の理由に「古い形の package.json の欄は読まない（移す手順はキットの移行ガイド）」と足した（`issueKit` の語は使わない）。移行ガイドは次の Issue で作る。違っていたら `test.mjs` の `fail(...)` の 1 行を直す
- `command` の道具が起動できなかったときは「結果の XML が無い・<道具> の終了コード N・<理由>」で FAIL にした（XML が無いのと同じ扱い）
- 点検の `command` の道具は、作業場所の直下に在ればそれを使い、パスの形（`/`・`\` を含む）で無ければ NG、ほかは PATH を探す
- 偽の道具は回ごとに別の名前で XML を書く（二重に数えないことを、前の回の物を数えないかで確かめるため）

### やらなかったこと・断られた操作

- 下書きのファイル `.issue-run/tmp-entry-block.mjs` を作業の途中に作った。追跡外（.gitignore の中）で、消すのは断られるので残した。消してよい
- 直下の写し（`scripts/` など）は入れ直していない（Issue の指定。3 件の後に会話で移す）
- `git stash list` を含む Bash の呼び出しが 1 回断られた（読むだけのつもりだった。不要なので外して続けた）

### 未採用の改善（気づいたが、ブロッカーでないもの。直さない）

- 版の手順書 `editions/node/files/docs/guides/procedures/node-test-procedure.md` は、まだ `package.json` の `issueKit` で書いてある（次の Issue の範囲）
- `doctor.mjs` は `vitest` の runner で `package.json` が無いとき、依存が無いと NG を出す。理由の文に `package.json` が無いことを書くと分かりやすい


## #45 移行ガイドと文書・ひな形・見本を新しい設定に直す（回0 P-6 の 3/3） — PASS

- `54fb688 docs: 移行ガイドと文書・ひな形・見本を新しい設定に直す`

### 結果: 合格

| 合格の条件 | 判定 | 根拠（コマンドと結果） |
|---|---|---|
| 移行ガイドに設計書 2.10 の 5 つの節がある | 満たす | 試験 `移行ガイド: 決まった節がある` ✔（`node scripts/test.mjs` → Result: PASS 106/106） |
| 版の手順書が `.issue-kit/config.json` と `command` を書き `issueKit` を書かない・導入ガイドが設定を書く手順を持つ・基本設計が `issueKit` を書かず正を仕様 11 章と書く | 満たす | 手順書の `issueKit` 0 件。導入ガイドの手順 4 の順 4。基本設計の 4.3・K-5・版の表に「仕様 11 章」。判定役が差分とファイルで確かめた |
| ひな形 CLAUDE.md が vitest を決め打ちせず設定の置き場を書く・commit スキルが決め打ちしない・issue-goal-setting の deny に `.issue-kit/` | 満たす | 試験 `Node 版のひな形が言語とテストの道具を決め打ちしない` ✔。issue-goal-setting 140 行目 |
| 見本に `.issue-kit/config.json`（vitest） | 満たす | `examples/node-sample/.issue-kit/config.json` = `{ "test": { "runner": "vitest" } }`。K-5 の 2 本 ✔ |
| 設計書 2.12 の試験 4 本が通る・共有の決まりは変えずに各版の CLAUDE.md に入っている | 満たす | ログ（`issue-45-test.log`）の 4 本とも ✔。`shared/claude-md/` 差分なし |
| 仕様・脚本・入れる脚本・実行用の設定・直下の写しは変えない | 満たす | `git status` で gitClean の一覧のパスに差なし（判定役が確かめた） |
| キットの試験が全部通る | 満たす | `node scripts/test.mjs` → `Result: PASS 106/106`（飛ばし 2：Windows の実行権限・K-4 の環境変数） |

### やったこと
- 移行ガイド `shared/manuals/issue-driven-kit-migration-guide.md` を新しく作った（5 節。.NET は未実測と明記）
- 版の手順書 `node-test-procedure.md` の「試験の仕組みを選ぶ」を `.issue-kit/config.json`・3 つの runner・例に書き直し、結果の表に新しい FAIL の理由を足した
- 導入ガイド：版の表・手順 4 に設定を書く順・Node でないときの言い方・点検の表・手順 8 に移行ガイドへの案内・付録 B の設定ファイル（31 件）・横に置く `config.kit.json`
- 基本設計：版の表・4.3 の `test.mjs` と `.issue-kit/config.json` の行・K-5・図・守るものの行
- ひな形 `CLAUDE.md`（言語と道具・型の確かめ・守るものを利用先が埋める欄に）と commit スキルの頭書き
- 版の issue-goal-setting の deny のパスに `.issue-kit/`
- Windows の確かめの説明書の件数を 30 → 31
- 見本に `.issue-kit/config.json`
- `tests/kit.test.mjs` に試験 3 本を足し、K-1 の一覧に移行ガイドを足した
- 別のエージェントに判定させ、指摘（基本設計の版の表の決め打ち・付録の抜け・「中身が変わった」の言い過ぎ・Java の OS ごとの差）を直した

### コミット
- `54fb688` docs: 移行ガイドと文書・ひな形・見本を新しい設定に直す

### 選んだこと（自分で決めた点・違っていたときの戻し方）
- 移行ガイドは版ごとの見出しを `##` にせず、5 つの節を `##` にした（確認コマンドの見出しと設計 2.10 に合わせるため）。版が増えたら構成を変える。戻すなら見出しの段を変える
- 見本の設定はひな形と同じ中身（入れる脚本が「同じ」と見て横に置かない）。戻すなら `git rm examples/node-sample/.issue-kit/config.json`
- Windows の確かめの説明書の件数（30 → 31）も直した（入るファイルが増えたため）。戻すなら同じファイルを revert

### やらなかったこと・断られた操作
- 直下の `package.json` の `issueKit`・直下の `.issue-kit/config.json`・直下の写しの入れ直し・キットの `CLAUDE.md` の行（Issue の「やらないこと」。3 件の後に会話で）。**注意：直下の `.issue-kit/config.json`（node の設定）を書く前に `--update` すると、直下の `test.mjs` が新しくなり設定なしで FAIL する**
- 断られた操作は無い

### 未採用の改善（気づいたが、ブロッカーでないもの。直さない）
- 設計書 2.12 の試験の名前（`…キットの脚本・手順書・ひな形に残っていない`）が、Issue と実装の名前（`…キットの版と共有の部品と見本に残っていない`）と違う。設計書は守るファイルなので、会話で設計書を直す
- `issueKit` の語の試験は拡張子の一覧にないファイルと直下の `docs/guides/` を見ない（直下は会話で移すときに C-11 として確かめる）

