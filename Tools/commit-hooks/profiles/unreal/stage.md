# ステージの決まり（Unreal Engine）

**載せない（P4 で止まる）:**
- フォルダ: `Binaries/`・`Intermediate/`・`Saved/`・`DerivedDataCache/`・`.vs/`・`.idea/`（`Plugins/*/` の下も同じ）
- IDE が作るファイル: `*.sln`・`*.suo`・`*.VC.db`・`*.VC.opendb`・`*.opensdf`・`*.opendb`・`*.sdf`・`*.xcodeproj/`・`*.xcworkspace/`（GenerateProjectFiles で作り直せる）

**マップは丸ごと載せる（P6 で警告）:** World Partition や 1 アクタ 1 ファイル（OFPA）のマップは、`.umap` の外の `Content/__ExternalActors__/<マップ>/` と `Content/__ExternalObjects__/<マップ>/` にアクタごとのファイルがある。一部だけを載せると、別の PC でマップを開いたときにアクタが消える・読めない。警告が出たら、残りのファイルも足すか、意図して外したのかを確かめる。

**LFS（P7 で止まる）:** `.uasset`・`.umap` を Git LFS で扱う repo では、`git lfs install` をしていない PC で add すると中身がそのまま入る。止まったら `git lfs install` を回し、`git rm --cached <パス>` → `git add <パス>` で入れ直す。LFS を使わない repo では、大きいアセットは P3 の大きさで止まる。

**気をつけて載せる:**
- 購入したアセット（Fab・Marketplace）は、配布の規約で公開できないことがある。public の repo には載せない（`.gitignore` に入れる）
- `.uasset` は合わせられない（マージできない）。同じアセットを 2 か所で同時に直さない
- `Config/*.ini` に自分の PC の絶対パスを書かない

**コミットの前に:** C++（`Source/`・`Plugins/*/Source/`）を変えたら、エディタを閉じてビルドが通ることを確かめ、`確かめ:` に結果の行を書く。
