---
description: Use when the user asks to push commits to GitHub. Triggers on "pushして", "プッシュ", "GitHubに上げて", "リモートに反映".
---

# Push Skill（Unity 用）

`origin` は private の GitHub（作り方と規則の正は `Docs/Guides/Working/github-repo.md`）。**普通に `git push` する。**
**この SKILL にルールを書き足さない**（足すなら github-repo.md）。

## 守ること

- **push はユーザーが言ったときだけ。** commit までは進めてよいが、push を勝手に足さない。
- **`--force` を打たない。** 履歴を書き換えたいときは別件としてユーザーに相談する。
- `origin` がまだ無ければ push しない。github-repo.md §1 の作り方をユーザーに示し、作ってよいか確かめる（GitHub にリポジトリを作るのは外向きの操作）。
- GitHub は 100MB 超のファイルを拒否する。弾かれたら中身を疑う（大きな素材を add していないか）。

## 手順

### 1. 未コミットの確認

```powershell
git status --porcelain
```

未コミットの変更は送られない。あれば commit スキルを先に出すかユーザーに確認する。

### 2. 送る

```powershell
git push origin main                 # 普段。ブランチを指定して送る
git push -u origin <new-branch>      # 新しいブランチの初回
```

### 3. 合否は ls-remote で見る（push の散文で判断しない）

```powershell
git ls-remote origin refs/heads/main
git rev-parse main
```

2つの SHA が一致すれば成功。

### 大きい差分が HTTP 408 で切られたとき

GitHub の HTTPS は1回の送信が大きいと切る（元のプロジェクトで 2026-09-18 に実測。音源 64MB が引き金）。コミットを小分けにして送る:

```powershell
$line = git rev-list --reverse --first-parent origin/main..main
for ($i = 7; $i -lt $line.Count; $i += 8) { git -c http.postBuffer=1048576000 push origin "$($line[$i]):refs/heads/main" }
git -c http.postBuffer=1048576000 push origin main
```

`--first-parent` の順に打つこと。順序が前後すると rejected になる。

## 実行後

ユーザーには **URL・送ったブランチ・増えたコミット数** を1行で返す。
