# Unity のテスト実行手順

テストの回し方と結果の読み方。合格基準そのものは `Docs/Guides/Decisions/test-plan.md`。

## 1コマンド

```powershell
pwsh -NoProfile -File Scripts/unity-test.ps1                       # EditMode を全部
pwsh -NoProfile -File Scripts/unity-test.ps1 -Platform PlayMode    # PlayMode を全部
pwsh -NoProfile -File Scripts/unity-test.ps1 -Platform All         # 両方（回帰テスト）
pwsh -NoProfile -File Scripts/unity-test.ps1 -Filter '<名前空間>.Tests.SmokeTests'           # 1 クラス
pwsh -NoProfile -File Scripts/unity-test.ps1 -Filter '<名前空間>.Tests.SmokeTests.TestRunnerWorks'   # 1 本
pwsh -NoProfile -File Scripts/unity-test.ps1 -CompileOnly          # コンパイルだけ
```

`pwsh` が無ければ Windows PowerShell 5.1 でも同じに動く。ただし 5.1 は実行ポリシーの既定が Restricted でスクリプトを実行できないので、`powershell -NoProfile -ExecutionPolicy Bypass -File Scripts/unity-test.ps1` と書く（pwsh 7 の既定は RemoteSigned で、手元のスクリプトはそのまま動く）。

## 結果の読み方

**最後の `Result:` 行だけで読む。**

| 出力 | 終了コード | 意味 | 次 |
| --- | --- | --- | --- |
| `Result: PASS  EditMode 12/12（失敗 0・飛ばし 0）` | 0 | 合格 | — |
| `Result: FAIL  EditMode 11/12（失敗 1・…）` | 1 | テストが落ちた。上に `FAIL <名前>` と message | 欠陥を設計／実装に振り分ける（design-cycle §5） |
| `Result: FAIL  EditMode 結果なし（exit 1）` | 1 | テストまで行かなかった。上に `error CS…` | コンパイルエラーを直す |
| `Result: FAIL  …` で「0 件」 | 1 | フィルターの書き間違い・テストのアセンブリが無い | 名前空間.クラスを確かめる |
| `Result: BLOCKED  Unity がこのプロジェクトを開いている` | 3 | 回せなかった。**PASS でも FAIL でもない** | エディタを閉じてもらうか「未判定」と報告する。エディタを勝手に止めない |

ログと NUnit の XML は `Logs/UnityTest/<日時>/`。

## テストを書く場所

| 何を | どこ | アセンブリ |
| --- | --- | --- |
| ふつうの C# のロジック（速い・まずここ） | `Assets/Tests/EditMode/` | `<名前空間>.Tests.EditMode`（Editor のみ・`UNITY_INCLUDE_TESTS`） |
| シーン・物理・フレーム・入力 | `Assets/Tests/PlayMode/`（作るときに asmdef も） | `<名前空間>.Tests.PlayMode` |

- テストするゲームのコードは asmdef に入れ、テストの asmdef の `references` に足す（asmdef に入っていない `Assembly-CSharp` はテストのアセンブリから参照できない）。
- 名前空間は `<名前空間>.Tests`。`-Filter` はこの名前で絞る。

## 注意

- バッチモードは Unity を毎回起動する（取り込み済みで 1〜2 分）。何度も回さず、`-Filter` で狭める。
- worktree は `Library/` を別に持つ。新しい worktree の初回は全部を取り込むので長い。
- エディタの Test Runner の窓で回してもよいが、報告には `unity-test.ps1` の `Result:` 行を使う（手で見た結果を「通った」と書かない）。
