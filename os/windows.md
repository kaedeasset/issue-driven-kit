# Windows の注意（どのフレームワークでも）

- **担当:** このリポジトリ（Windows の Unreal の PC で使いながら直す）
- **状態:** Windows 11・Git for Windows で `test.sh` PASS（2026-10-31）
- **更新の仕方:** docs/operations.md「組み合わせごとの更新の仕方」

フックは git が自分の sh（Git for Windows の MSYS の sh）で動かすので、コミットのときは何もしなくてよい。気をつけるのは次のところ。

| | 注意 | どうする |
|---|---|---|
| `install.sh`・`test.sh` を手で回す | PowerShell・cmd では `sh` が見つからない（Git for Windows は `Git\cmd` だけを PATH に足す） | Git Bash で回すか、`& "C:\Program Files\Git\bin\sh.exe" Tools/commit-hooks/install.sh <profile>` |
| 改行 | Git for Windows の既定は `core.autocrlf=true`。sh のファイルが CRLF で取り出されると落ちる | 取り込み先の `.gitattributes` に `Tools/commit-hooks/** text eol=lf`。人ごとの autocrlf に頼らない |
| 大文字小文字だけの名前の変更 | NTFS は区別しない。エクスプローラーで変えると git が気づかない | `git mv -f Foo.cpp foo.cpp`。区別する Linux の CI でだけ落ちる |
| パスの長さ | 260 字を超えると取り出せない・add できないことがある | `git config --global core.longpaths true` |
| OS が作るファイル | `Thumbs.db`・`ehthumbs.db`・`desktop.ini` | P4 が止める。`.gitignore` にも足す |
| LFS | PC ごとに `git lfs install` が要る | 忘れると P7 で止まる |
| PowerShell からコミット | here-string を `git commit -m` に置くと、行の頭の空白や `"` が崩れる | メッセージはファイルに書いて `git commit -F <ファイル>` |
