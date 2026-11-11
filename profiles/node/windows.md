# Node.js × Windows の注意

- **担当:** Windows で使っている Node.js の repo（このリポジトリは土台だけ）
- **状態:** **下書き。** Node.js の repo で確かめた記録はまだ無い（2026-10-31）。確かめたら `Node <版>・npm <版>・Windows <版> で確かめた（日付）` に書き換える
- **更新の仕方:** docs/operations.md「組み合わせごとの更新の仕方」

| | 注意（下書き） | どうする |
|---|---|---|
| npm scripts | Windows の npm は scripts を cmd.exe で動かす。`rm -rf`・`FOO=1 node …`・`cp` など sh の書き方は落ちる | `rimraf`・`cross-env` などを使うか、処理を `node scripts/x.mjs` に書く。`確かめ:` にどの OS で回したかを書く |
| husky | `.husky/` のフックは Git for Windows の sh で動く。CRLF だと落ちる | `.gitattributes` に `.husky/** text eol=lf` |
| パスの長さ | `node_modules` の奥で 260 字を超えやすい | `git config --global core.longpaths true` |
