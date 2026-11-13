# 写しの元と、正の置き場

## 正の置き場

**キットの仕様（`shared/spec/`）・説明書（`shared/manuals/`）・読み物（`shared/reading/`）・設計（`docs/design/`）・Node 版（`editions/node/`）の正は、このキットに置く。**

`editions/unity/files/` は、作者の Unity のリポジトリ KaedeScapeBuii（private）で動いた一式の写しで、正はそちらにある。キットの中では直さない。

`editions/unreal/files/` は、作者の Unreal Engine のリポジトリ kaedevn（private）で動いている無人の回の部品 8 ファイルの写しで、正はそちらにある。キットの中では直さない。Unity 版の元になった実物で、入れる脚本は無い（写しだけ）。PC の中の個人のパスや秘密の値は元から無く、伏せた所は無い（元のコミットの中身と同じ）。

## 公開の前に抜いた物（2026-10-23）

このリポジトリは公開なので、作者の private のリポジトリの中身は入れていない。

| 抜いた物 | どうしたか |
|---|---|
| 元のリポジトリの記録の写し（作業の記録・無人の回のまとめ・プロンプトの記録・事例 18 ファイル） | 入れていない。説明書の中の、その記録へのリンクは文字にした（「記録 23/01」などの呼び名は残る） |
| PC の中のパス `C:\Users\<作者>\` | `C:\Users\<you>\` にした。`editions/unity/files/` も同じに伏せ、試験 K-4 は参照も同じに伏せてから比べる（実物との差はこれだけ） |

`shared/fixtures/` の見本の本文は、作者の private のリポジトリ（KaedeScapeBuii #1〜#13・rpg-online-cloudflare #1〜#4）の Issue の本文。どれも Claude Code が書いた作業の指示で、読み取りの試験に使う。

## 写しの元

| 元 | コミット | 写した日 | 写した物 |
|---|---|---|---|
| mkanakureon/KaedeScapeBuii（private） | fde14ae（説明書・設計書）・9ec9bcc（それ以外） | 2026-10-23 | `shared/manuals/`・`shared/reading/`・`docs/design/`・`editions/unity/files/` |
| mkanakureon/kaedevn（private） | 173367ee | 2026-11-13 | `editions/unreal/files/`（`Scripts/issue-run.ps1`・`Scripts/lib/text.ps1`・`.claude/issue-run/` の 3 つ・Issue のひな形・`issue-run.md`・`issue-goal-setting.md`） |
| キットの開発用のリポジトリ（private） | 9d35ab0 | 2026-10-23 | 全部（公開のリポジトリは、ここから 1 コミットで始めた） |
