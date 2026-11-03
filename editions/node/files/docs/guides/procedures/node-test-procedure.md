# テストの実行手順（vitest／node --test／決めたコマンド）

テストの回し方と結果の読み方。合格基準そのものは `docs/guides/decisions/test-plan.md`。

## 1コマンド

```text
node scripts/test.mjs                              # 全部（npm test も同じ）
node scripts/test.mjs --filter 'スコアがマイナスなら 400'   # テストの名前で絞る（vitest の -t・node --test の --test-name-pattern・command の filterArgs）
node scripts/test.mjs --file test/rankings.test.ts  # ファイルで絞る（vitest・node だけ）
```

Windows でも Mac でも同じに動く（Node.js 22.14.0 で確かめる）。中では、`.issue-kit/config.json` で決めたテストの道具を、結果を JUnit 形式の XML に書く設定で回している。

## 試験の仕組みを選ぶ（`.issue-kit/config.json`）

テストの道具は **`.issue-kit/config.json` の `test` の欄**で決める（決まりの正はキットの仕様 11 章）。**既定の値は無い**。ファイルが無い・JSON として読めない・形が違うときは、直し方を書いて `Result: FAIL`。入れる脚本は `{ "test": { "runner": "vitest" } }` のひな形を写す（利用先が書き換える物。`--update` で上書きしない）。無人の回は `.issue-kit/` を書き換えられない（実行用の設定の deny）。

| 欄 | 要るとき | 形 | 意味 |
| --- | --- | --- | --- |
| `test.runner` | いつも | `vitest`・`node`・`command` | どの道具で回すか |
| `test.files` | `node` | 文字列の配列（例 `["tests/*.test.mjs"]`） | `node --test` に渡すファイル。`--file` を付けるとその 1 本だけ回す |
| `test.command` | `command` | 文字列の配列（先頭が道具、残りが引数）。シェルを通さない | 全部のテストを回すコマンド |
| `test.resultDirs` | `command` | 作業場所の直下から見たフォルダーの配列 | コマンドが JUnit の XML を書くフォルダー。下の階層まで見て `.xml` を読む |
| `test.filterArgs` | 任意（`command`） | 文字列の配列。`{filter}` を `--filter` の値に置き換える | `--filter` のときに `command` の後ろに足す引数。無ければ `--filter` は FAIL |

道具ごとの例：

| 道具 | `.issue-kit/config.json` |
| --- | --- |
| vitest | `{ "test": { "runner": "vitest" } }`（`node_modules/vitest/vitest.mjs run` で回す） |
| `node --test` | `{ "test": { "runner": "node", "files": ["tests/*.test.mjs"] } }` |
| .NET（xUnit と `JunitXml.TestLogger`） | `{ "test": { "runner": "command", "command": ["dotnet", "test", "--logger", "junit;LogFilePath=.issue-run/test-results/raw/{assembly}.xml"], "resultDirs": [".issue-run/test-results/raw"], "filterArgs": ["--filter", "DisplayName~{filter}"] } }` |
| Java（Maven Wrapper・Surefire・Failsafe） | `{ "test": { "runner": "command", "command": ["mvnw.cmd", "-q", "verify"], "resultDirs": ["target/surefire-reports", "target/failsafe-reports"] } }`（Mac は `./mvnw`） |

- 設定は 1 つなので、Windows と Mac の両方で回すリポジトリでは、`command[0]` を両方で動く物にする（Java の `mvnw.cmd` と `./mvnw` は書き分けられない。PATH にある `mvn` を使うなど）。
- `node` のときは vitest が要らない。点検（`scripts/issue-run/doctor.mjs`）も、設定の runner ごとに要る物（vitest・`test.files`・`command` の先頭の道具の実体）を見る。
- `node` で名前で絞って 1 本も当たらなかったファイルは、`node --test` が「ファイルの名前の testcase」として XML に書く。それは試験の数に入れない（当たらなければ 0 件で FAIL）。
- `command` のときは、起動の前と後で `resultDirs` の `.xml` の一覧を比べ、**この回で新しくできた物と、更新時刻か大きさが変わった物だけ**を読んで 1 つの `junit.xml` にまとめる。前の回の XML は読まない・消さない。道具の終了コードが 0 でなければ、XML が全部通っていても FAIL。
- `command` では `--file` を使えない（ファイルの指定は道具ごとに違う）。名前で絞るなら `filterArgs` を書く。`filterArgs` の `{filter}` には値をそのまま入れる（dotnet の `--filter` で意味を持つ字 `( ) & | = ! ~ ,` は `\` で逃がす）。Java（Maven）は名前でなくクラスとメソッドで絞るので、`filterArgs` を書かず、全部を回して `requireTests` で名前を見る。
- Windows で `command` の先頭が `.cmd`・`.bat`（`mvnw.cmd` など）のときは `cmd.exe` を通して起動する。そのときは引数に `%` と `"` を使えない（使うと起動せずに FAIL）。
- 結果の XML は UTF-8 で書かせる（UTF-16 は読めず 0 件で FAIL）。
- .NET の例は `dotnet test` の VSTest の方式のもの（Microsoft.Testing.Platform の方式では `--logger` を受け付けない）。`LogFilePath` の相対パスの基準と `{assembly}` の置き換えは、まだ実測していない。
- 試験の中から `scripts/test.mjs` を呼んでも、外の `node --test` の印（`NODE_TEST_CONTEXT`）は子へ渡さない。

## 結果の読み方

**最後の `Result:` 行だけで読む。**

| 出力 | 終了コード | 意味 | 次 |
| --- | --- | --- | --- |
| `Result: PASS 12/12` | 0 | 合格（飛ばしたテストは数に入れない） | — |
| `Result: FAIL (11/12)` | 1 | テストが落ちた。上にテストの道具の失敗の表示 | 欠陥を設計／実装に振り分ける（design-cycle §5） |
| `Result: FAIL (0/0（テストが 0 件）)` | 1 | 名前の書き間違い・テストのファイルが無い・全部飛ばし | `--filter` の名前と、テストのファイルの場所を確かめる |
| `Result: FAIL (結果の XML が無い・…)` | 1 | テストまで行かなかった（設定の誤り・型の誤りで読み込めない など） | 上のテストの道具の出力を読む |
| `Result: FAIL (vitest が無い。…)` | 1 | `runner` が `vitest` なのに、`npm install` をしていない・`devDependencies` に vitest が無い | `npm install`（vitest を使わないなら `.issue-kit/config.json` の `runner` を変える） |
| `Result: FAIL (.issue-kit/config.json が無い。…)`・`（… が JSON として読めない…）`・`（… の test.runner は …）` など | 1 | テストの入口の設定が無い・形が違う。古い形（`package.json` の中の欄）は読まない | 出力の直し方のとおりに `.issue-kit/config.json` を書く（古い形から移すときはキットの移行ガイド） |
| `Result: FAIL (command では --file を使えない。…)`・`（command で名前で絞れない…）` | 1 | `command` で `--file` を使った・`filterArgs` が無いのに `--filter` を使った | `filterArgs` を書く・全部を回して `requireTests` で名前を見る |
| `Result: FAIL (結果の XML が無い（resultDirs: …）・…)` | 1 | `command` の道具が、この回で `resultDirs` に XML を書かなかった（前の回の XML は読まない） | 道具の出力を読む。`resultDirs` と道具の XML の出力先が合っているか確かめる |
| `Result: FAIL (… cmd.exe …)` | 1 | Windows で `.cmd`・`.bat` の道具の引数に `%` か `"` がある | 引数から `%` と `"` を外す |

テストの名前と合否の XML は `.issue-run/test-results/junit.xml`（git に入れない）。確認コマンドの `requireTests([...])` はここを読む。

## テストを書く場所

| 何を | どこ |
| --- | --- |
| ふつうの関数のロジック（速い・まずここ） | `test/` か、コードの隣の `*.test.ts`（`vitest.config.ts` の `include` に合わせる） |
| HTTP・DB を通す試験（Cloudflare Workers なら `@cloudflare/vitest-plugin`） | 同上。設定は `vitest.config.ts`。分けた環境で動くので、開発用のローカルの DB（`.wrangler/`）とは取り合わない |

- テストの名前（`it('…')` の文）は、確認コマンドの `requireTests` で名指しされることがある。**名前を変えるときは、それを名指ししている Issue や設計書の表も同じときに直す**。
- 名前は「何をすると・どうなる」が分かる日本語でよい（例: `スコアがマイナスなら 400 を返す`）。

## 注意

- 何度も全部を回さず、`--filter` で狭める。全部を回すのは、まとめの確かめのときだけ。
- `wrangler dev` を起動したまま試験を回さない（使うポートや一時ファイルが重なることがある）。
- 手で見た結果を「通った」と書かない。報告には `Result:` 行を使う。
