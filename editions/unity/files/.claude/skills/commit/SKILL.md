---
description: Use when the user asks to commit changes, stage files, or create a git commit. Triggers on "コミットして", "commit", "変更をコミット".
---

# コミット Skill（Unity 用）

`git add` → `git commit` を一貫したルールで実行する。
このプロジェクトは Unity 6 の C# プロジェクト（版は `ProjectSettings/ProjectVersion.txt`）。生成物は `.gitignore` 済み。元の Unreal Engine のプロジェクトの commit スキルと同じ規則。

## トリガー

| ユーザーの表現 | 動作 |
|---|---|
| "コミットして" | **今回の依頼で変更・作成したファイル**をステージしてコミット。他タスクの未コミットや自分が作っていないファイルは含めず、残っていることを報告する |
| "全部コミットして" | 未追跡を含む全変更（生成物・秘密情報は除く）。自分が作っていないファイルは中身を確かめてから |
| "変更をコミットして" | 同上 |
| "ドキュメントだけコミットして" | `Docs/` のみステージしてコミット |
| "コードだけコミットして" | コードのみ（`Assets/**/*.cs`・`*.asmdef` とその `.meta`・`Scripts/`）。ディレクトリ名だけで分類しない |

## 手順

1. `git status` で変更ファイルを確認
2. `git diff --stat` で変更内容の概要を把握
3. 直近コミット（`git log --oneline -5`）を見てメッセージスタイルを確認
4. ステージするファイルを決定（下記ルール参照）
5. コミットメッセージを作成
6. `git commit` を実行
7. `git status` / `git log --oneline -1` で成功を確認

## ステージするファイルのルール

**含める:**
- 作成・編集したファイル（`Assets/` `Packages/manifest.json` `Packages/packages-lock.json` `ProjectSettings/` `Docs/` `Scripts/` `.claude/skills/` 等）
- **`Assets/` のファイルと対になる `.meta`**（必ずペアで。フォルダーの `.meta` も）

**`.meta` の確かめ（コミット前に毎回）:**

```bash
# Assets/ の中で .meta の無いファイル・フォルダー（0 件が正常）
git status --porcelain -uall Assets | awk '{print $2}' | grep -v '\.meta$' | while read f; do [ -e "$f.meta" ] || echo "meta なし: $f"; done
# 本体が無いのに残った .meta（0 件が正常）
git ls-files Assets | grep '\.meta$' | while read m; do [ -e "${m%.meta}" ] || echo "本体なし: $m"; done
```

`.meta` が無いときは Unity がまだ取り込んでいない。エディタを開くかバッチモード（`Scripts/unity-test.ps1 -CompileOnly`）を 1 回回して作ってからコミットする。**`.meta` を手で書かない**（GUID がずれると参照が切れる）。

**含めない（絶対に）:**
- `.env` / `.env.*` / `**/credentials.*` / `**/*.pem` / `**/*.key`
- Unity の生成物（`.gitignore` 済みだが念のため確認）: `Library/` `Temp/` `Logs/` `UserSettings/` `obj/` `Build/` `*.csproj` `*.sln` `*.slnx`
- `.claude/settings.local.json`（ローカル設定）

> コミット前に `git status --short | grep -E "Library/|Temp/|Logs/|UserSettings/|\.csproj"` で
> 生成物が混入していないか確認する（混入は 0 件が正常）。

## コミットメッセージのルール

### プレフィックス

| プレフィックス | 使う場面 |
|---|---|
| `feat:` | 新機能の追加 |
| `fix:` | バグ修正 |
| `test:` | テストだけの追加・修正 |
| `docs:` | ドキュメントのみの変更 |
| `refactor:` | 動作を変えないコード整理 |
| `chore:` | ビルド・設定・パッケージ・スクリプト等のメンテナンス |

### フォーマット

```
{プレフィックス}: {日本語の説明}
```

- 説明は**日本語**で書く
- 複数の変更がある場合は `・` で区切る
- 長い場合は主要な変更を先頭に、残りを `・` でつなぐ
- Issue の作業なら末尾に `（Issue #N）`

### 例

```
feat: プレイヤーの移動を Input System の Move に接続・地面判定で落下を止める
fix: ジャンプが空中でも入る不具合を修正（Issue #3）
test: PlayerMotor の EditMode テストを追加
chore: Unity 向け .gitignore と .gitattributes を追加・初期コミット
```

## プレコミットフック

- 現状プレコミットフックは**未設定**。
- 将来フックが設定されチェックが失敗した場合は `--no-verify` を使わず、原因を修正してから再コミットする。

## 確かめ（任意・推奨）

C#（`Assets/`）を変更した場合、可能ならコンパイルとテストが通ることを確認してからコミットする:

```powershell
pwsh -NoProfile -File Scripts/unity-test.ps1 -CompileOnly   # Result: PASS を見る
pwsh -NoProfile -File Scripts/unity-test.ps1 -Filter '<変えた所のテスト>'
```

エディタが開いていると `Result: BLOCKED`。そのときはエディタの Console でコンパイルエラーが 0 であることを見る（報告にそう書く）。

## Claude の一言（必須）

コミットメッセージの末尾に、今回の作業についての**Claude Code の感想・振り返り**を1〜3行加える。

- 作業内容を振り返った**正直な感想**を書く
- **たわいない・ゆるい**トーンでOK。堅苦しくしない
- 日本語で書く
- `---` で本文と区切る

## Co-Author

必ず以下を末尾に付与する（Claude の一言の後）。モデル名は実際に使用中のモデルに合わせる。

```
Co-Authored-By: Claude {モデル名} <noreply@anthropic.com>
```

### 完成形イメージ

```
feat: プレイヤーの移動を Input System の Move に接続

---
actions のアセットが最初から WASD を持っていたので、配線するだけで動いた。
ロジックを MonoBehaviour の外に出したら EditMode で試せて気持ちいい。

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
