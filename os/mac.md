# Mac の注意（どのフレームワークでも）

- **担当:** Mac で使っている repo（Mac の PC で確かめて直し、subtree push で返す）
- **状態:** **下書き・未確認。** Windows の PC から書いた（2026-10-31）。Mac で `test.sh` を回した記録はまだ無い。Mac の repo が最初に取り込んだとき、`test.sh` を回してこの表を確かめ、違っていれば直して返す。確かめたら上の「状態」を `macOS <版>・git <版> で test.sh PASS（日付）` に書き換える
- **更新の仕方:** docs/operations.md「組み合わせごとの更新の仕方」

| | 注意（下書き） | どうする |
|---|---|---|
| 道具の違い | sed・awk・grep は BSD の版。GNU にしか無い書き方（`sed -i`・置き換えの `\t` `\r`・`grep -P`・`date +%N`）は動かないか違う結果になる。awk は版によって UTF-8 の扱いが違う | フックは `LC_ALL=C` の awk でバイトとして数えている。`test.sh` の「40 字は通る・41 字は止まる」が PASS するかで確かめる |
| 中継の実行の印 | 実行の印が無いフックは、git が注意を出して**飛ばす** | `install.sh` が `chmod +x` する。手で写したときは `chmod +x .git/hooks/commit-msg .git/hooks/pre-commit` |
| 日本語のファイル名 | ファイルの名前が濁点などの分かれた形（NFD）で返ってくる | `git config core.precomposeunicode` を `true`（既定）のままにする。`false` だと Windows で同じ名前が別のファイルとして入る |
| 大文字小文字だけの名前の変更 | APFS は既定で区別しない。Finder で変えると git が気づかない | `git mv -f Foo.cpp foo.cpp` |
| OS が作るファイル | `.DS_Store`・`._*`（外付けの FAT・exFAT のディスクで作られる） | P4 が止める。`.gitignore` にも足す |
| git の版 | Xcode の Command Line Tools の git は古いことがある。`install.sh` は `git rev-parse --path-format`（2.31 以降）を使う | `git --version` を見る。古ければ Homebrew の git を入れる |
| LFS | PC ごとに `git lfs install`（Homebrew で git-lfs を入れてから） | 忘れると P7 で止まる |
