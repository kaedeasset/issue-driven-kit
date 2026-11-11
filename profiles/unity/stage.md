# ステージの決まり（Unity）

**載せない（P4 で止まる）:** repo の直下の `Library/`・`Temp/`・`Obj/`・`Logs/`・`UserSettings/`・`MemoryCaptures/`・`Build/`・`Builds/`。

**`.meta` は対で扱う（P5 で止まる）:**
- `Assets/` の下にファイルやフォルダを足したら、その `.meta` も足す（フォルダの `.meta` も）。`.meta` は Unity のエディタが作るので、足す前に一度エディタで開く
- 消すときは `.meta` も一緒に消す。`.meta` だけを足さない
- `.` で始まる名前と `~` で終わる名前は Unity が読まないので、`.meta` は要らない

**気をつけて載せる:** `ProjectSettings/`・`Packages/manifest.json`・`Packages/packages-lock.json` は載せる。購入したアセット（Asset Store）は、配布の規約で公開できないことがある。public の repo には載せない。

**コミットの前に:** スクリプトを変えたら、エディタでコンパイルエラーが無いことを確かめて `確かめ:` に書く。
