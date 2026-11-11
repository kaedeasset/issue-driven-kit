---
description: Use when the user asks to commit changes, stage files, or create a git commit. Triggers on "コミットして", "commit", "変更をコミット".
---

# コミット Skill

`git add` → `git commit` を決まった形で行う。この SKILL は 1 度写したら更新しなくてよい（決まりの中身は下の 2 つを指すだけ）。

- **メッセージの形と検査の正:** `Tools/commit-hooks/rules.md`
- **ステージしない物とコミット前に確かめること:** `Tools/commit-hooks/profiles/<profile>/stage.md`（`<profile>` は repo の直下の `commit-hooks.conf` の `profile=`）
- **自分の OS の注意:** `Tools/commit-hooks/os/<windows|mac>.md` と、あれば `Tools/commit-hooks/profiles/<profile>/<windows|mac>.md`

<!-- 取り込み先が Tools/commit-hooks 以外なら、上のパスを直す -->

## 手順

1. `git status` と `git diff --stat` で変更を見る
2. ステージするファイルを決める（下と `stage.md`）
3. `rules.md` の形でメッセージをファイルに書く
4. `git commit -F <ファイル>`
5. フックで止まったら、表示された項目どおりに直して 4 へ。**`--no-verify` を使わない**
6. `git status` / `git log --oneline -1` で成功を確かめる

## ステージするファイル

| ユーザーの表現 | 動作 |
|---|---|
| "コミットして" | **今回の依頼で変更・作成したファイル**だけ。他の作業の未コミットや自分が作っていないファイルは含めず、残っていることを報告する |
| "全部コミットして" | 未追跡を含む全変更（生成物・秘密は除く）。自分が作っていないファイルは中身を確かめてから |

<!-- ここから下に、この repo だけの決まりを書く（stage.md と重ねて書かない） -->
