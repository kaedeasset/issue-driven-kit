# Unreal × Windows の注意

- **担当:** このリポジトリ（Windows の Unreal の PC で使いながら直す）
- **状態:** UE 5.8・Windows 11 で使っている（2026-10-31）
- **更新の仕方:** docs/operations.md「組み合わせごとの更新の仕方」

| | 注意 | どうする |
|---|---|---|
| `確かめ:` のビルド | エディタを開いたままだと Live Coding がビルドを止める | エディタを閉じて `Engine\Build\BatchFiles\Build.bat <Target>Editor Win64 Development -Project=<.uproject> -WaitMutex` を回し、最後の `Result: Succeeded` を `確かめ:` に書く |
| Visual Studio のファイル | `*.sln`・`.vs/`・`*.VC.db` は GenerateProjectFiles で作り直せる | 載せない（P4 が止める） |
| パスの長さ | プラグインの `Intermediate` の奥や、長い名前のアセットで 260 字を超えやすい | `git config --global core.longpaths true`。プロジェクトを浅いフォルダに置く |
| 大きいアセット | LFS を使わない repo では、`.uasset` の大きさは P3 の 95MiB で止まる | 大きいものは LFS にするか、`.gitignore` に入れて別で配る |
