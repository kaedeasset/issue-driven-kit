# ステージの決まり（Node.js）

**載せない（P4 で止まる）:** `node_modules/`・`.next/`・`.nuxt/`・`.turbo/`・`.parcel-cache/`・`coverage/`（どこの下でも）。
`dist/`・`build/` は repo によって載せるので止めない。載せない repo は `commit-hooks.conf` の `generated=` で足す。

**気をつけて載せる:**
- ロックファイル（`package-lock.json`・`pnpm-lock.yaml`・`yarn.lock`）は `package.json` の依存を変えたら一緒に載せる
- `.npmrc` に `_authToken` が書いてあれば載せない（トークンは環境変数で渡す）

**コミットの前に:** 試験（`npm test` など）と型の検査があれば回して `確かめ:` に書く。

**Windows と Mac の両方で使う repo:**
- 片方の OS で依存を足すと、もう片方の OS 用の任意の依存（`@esbuild/*`・`@rollup/rollup-*` など）がロックファイルから消えることがある（npm の既知の不具合）。依存を変えたコミットは、ロックファイルの差分で別の OS 用の行が消えていないかを見る。消えていたら `node_modules` とロックファイルを消して `npm install` し直す
- `node_modules` は OS ごとにネイティブのモジュールが違う。PC の間で写さない。OS を替えたら `npm install` し直す
- OS ごとの注意は `profiles/node/windows.md`・`mac.md`（無ければまだ誰も書いていない）
