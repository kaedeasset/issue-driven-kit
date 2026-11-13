---
description: Use when the user asks to open a Pull Request from a dev branch to main. Triggers on "PRを出して", "プルリク作って", "PRだして", "レビューに出して".
---

# PR Skill（Unity 用）

開発ブランチから `main` への Pull Request を作成する。

## 前提

- **GitHub リモートと `gh` CLI 認証**が必要。`git remote -v` / `gh auth status` で確認し、
  未設定なら `Docs/Guides/Working/github-repo.md` の手順を示す（作るのはユーザーの了承の後）。

## 手順

1. **未コミット変更の確認** — `git status`。ある場合は commit スキルを提案。
2. **main を取り込む**
   ```bash
   git fetch origin main
   git merge origin/main
   ```
   - コンフリクトが出たらユーザーに報告して解決を依頼。シーン・プレハブの衝突は手で YAML を混ぜない（Unity の UnityYAMLMerge か、どちらかを採る）。
3. **確かめ（typecheck/lint の代わり）**
   ```powershell
   pwsh -NoProfile -File Scripts/unity-test.ps1 -CompileOnly
   pwsh -NoProfile -File Scripts/unity-test.ps1 -Platform All
   ```
   合否は `Result:` 行。`BLOCKED` ならエディタを閉じてもらうか、PR の Test plan を [ ] のままにする。
4. **push** — `git push -u origin $(git branch --show-current)`
5. **PR 作成** — `git diff main...HEAD --stat` で変更概要、`git log main..HEAD --oneline` でコミット一覧を確認して `gh pr create`。

## PR のフォーマット

```bash
gh pr create --title "{タイトル}" --body "$(cat <<'EOF'
## Summary
<変更内容の箇条書き>

## Test plan
- [x] コンパイル（unity-test.ps1 -CompileOnly: Result: PASS）
- [x] EditMode / PlayMode（unity-test.ps1 -Platform All: Result: PASS n/n）
- [ ] <手動確認項目（Play モードで操作確認 等）>

Closes #<Issue 番号（あれば）>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- タイトル: 70 文字以内・プレフィックス付き（`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`）・日本語 OK
- Test plan: 実行して通ったものだけ [x]。手動確認は [ ]

## 注意事項

- **`main` ブランチからは PR を作らない** — 開発ブランチからのみ。main にいる場合は「開発ブランチに切り替えてください」と伝える（`git switch -c feat/xxx`）。
- PR 作成後に URL を返す。
