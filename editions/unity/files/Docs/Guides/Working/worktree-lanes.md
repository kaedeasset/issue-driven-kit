# worktree のレーン — 決まりと作り方（常設）

**作業を「レーン」（worktree のブランチ）に分け、各レーンのセッション（人・会話の Claude・無人の Claude）は自分のフォルダーの中だけで作業し、main への取り込みとレーンへの配りは統合セッション（main）が「レーン同期して」で行う。** この文書はレーンの決まりの正。同期の手順はスキル `.claude/skills/lane-sync/SKILL.md`、本体は `Scripts/Sync-Lanes.ps1`。

元は Unreal Engine のプロジェクトの worktree の手引き（2026-09-09〜）。UE の事情（RAM・LiveCoding・`Intermediate/`）は除き、Unity の事情を足した。

> [!TIP]
> **初めて読む方へ**: worktree は、同じリポジトリを別のフォルダーにもう 1 つ展開したもの（`git worktree add`）。フォルダーごとに別のブランチを開いておけるので、人と AI、あるいは AI どうしが**同じファイルを同時に書き換えて壊す**ことを避けられる。レーンは「どのフォルダー（＝どのブランチ）で、どのファイルを担当するか」の決まりのこと。

## 1. レーンの一覧

**まだ作っていない（2026-10-22）。** 作ったらこの表に書く（作るのは人。2 章）。

| フォルダー | ブランチ | レーン | 独占するパス |
|---|---|---|---|
| `C:\work\<プロジェクト>` | `main` | **統合** | 機能開発はしない。レーン同期・push・文書・CLAUDE.md と、同期の後のテストで落ちたものの修正（main でコミットしてレーンへ流す） |
| （未定） | （未定） | （未定） | （未定） |

### 所有を決めるときの目安（Unity）

- **衝突は「機能」でなく「ファイル」で起きる。** 境界はフォルダーとアセンブリ（`.asmdef`）で引く。
- **シーン（`.unity`）とプレハブ（`.prefab`）は 1 つのレーンだけが持つ。** YAML なので git は混ぜられるが、混ぜた結果が壊れていても気づきにくい。2 つのレーンが同じシーンを触る作業は、並列をやめて直列にする。
- `ProjectSettings/`・`Packages/manifest.json` は共有。**触った側が当日中に main へ流す**。抱え込まない。
- `.meta` は本体と同じレーンが持つ（本体と必ず対で動く）。

## 2. レーンを作る（人がやる）

Claude は `git worktree add` / `remove` を実行しない（CLAUDE.md）。作るのは人。

```powershell
cd "C:\work\<プロジェクト>"
git worktree add ..\<プロジェクト>-<名前> -b feat/<名前>     # 例: ..\<プロジェクト>-game  -b feat/game
cd ..\<プロジェクト>-<名前>
pwsh -NoProfile -File Scripts/unity-test.ps1 -CompileOnly   # 最初の取り込みで Library/ を作る（数分）
pwsh -NoProfile -File Scripts/issue-run-doctor.ps1          # そろっているかの点検
```

- **フォルダー名は `<プロジェクト>-<名前>`。** 隣の worktree と取り違えないよう、スクリプトはパスの末尾まで比べている。
- **`Library/` は worktree ごとに別。** 作った直後は冷えているので、最初の 1 回は取り込みに時間がかかる。無人の回の前に済ませておく（`issue-run.md`）。
- 作ったら 1 章の表に書き、CLAUDE.md の入口から辿れるようにする。
- 常設の worktree を消して作り直さない（`Library/` の取り込みがやり直しになる）。別のブランチは既存の worktree で `checkout` する。

## 3. 日々の回し方

| いつ | どこで | 何をする |
|---|---|---|
| 朝 | main | **「レーン同期して」**（`Sync-Lanes.ps1`）。レーン → main（merge）→ main → レーン（ff-only）。合否は最後の `Result:` 行。`next=テスト` のレーンは作業前に `unity-test.ps1` |
| 日中 | 各レーン | **自分の worktree から出ない。** 他のレーンの `git status`・取り込み・編集は main の仕事 |
| 日中 | 各レーン | Unity エディタは**フォルダーごと**にロックする。開いているレーンではバッチモードのテストが `BLOCKED` になる。無人の回（issue-run）は、エディタで開いていないレーンを選んで起動する |
| 夕方 | 各レーン | 自分のブランチにコミット。共有のもの（`ProjectSettings/`・`Packages/`）を触った日は当日中に main へ |
| いつも | — | **長寿命ブランチを作らない。** レーンと main の差は 1〜3 コミットに保つ |

## 4. やってはいけないこと

| ❌ | なぜ |
|---|---|
| セッションが自分の worktree から出る（他のレーンの取り込み・状態の確認・編集） | 他のセッションから見ると、ブランチが勝手に動いたことになる（元のプロジェクトで 2026-07-28 に起きた）。**最重要** |
| `git worktree add` / `remove` を勝手に実行する | 作る前に人が確認する。消すと `Library/` がやり直し |
| シーン・プレハブの衝突を YAML を手で混ぜて解く | 壊れても気づきにくい。どちらかを採るか、UnityYAMLMerge を使う |
| 同期で「緑にするためだけ」に `--force`・`reset --hard` でレーンを捨てる | レーンの作業が消える |

## 5. 関連

| | |
|---|---|
| 同期の手順 | `.claude/skills/lane-sync/SKILL.md`（「レーン同期して」） |
| 同期の本体 | `Scripts/Sync-Lanes.ps1` |
| 無人実行と worktree | `Docs/Guides/Working/issue-run.md`（作業場所の選び方・同時に動かす） |
| 全体 | `Docs/Guides/Working/issue-driven-development.md` |
