# 運用マニュアル

[README](../README.md) に戻る。**このリポジトリが正。** ほかのリポジトリはこれを `git subtree` で取り込み、更新は `git subtree pull` で受け取る。取り込んだ側で直したときは、その日のうちに `git subtree push` でここへ送り返す。

## どこを直すか（3 段）

repo ごとの違いは、取り込んだフォルダの**外**の `commit-hooks.conf` に書く。だから pull しても上書きされない。

| 直したいもの | 直す場所 | pull で |
|---|---|---|
| 全部の repo に効く決まり（メッセージの形・検査の仕組み・既定の値） | このリポジトリの `rules.md`・`hooks/`・`profiles/common.conf` | 全部の repo に入る |
| あるフレームワークの repo 全部に効くもの（生成物のフォルダ・`.meta`・ステージの決まり） | このリポジトリの `profiles/<profile>/`（`unreal`・`unity`・`node`・`plain`） | そのフレームワークの repo に入る |
| その repo だけの違い（種類を足す・字数・生成物を足す） | 取り込んだ repo の直下の `commit-hooks.conf` | 上書きされない |

フレームワークを足すときは `profiles/<名>/profile.conf` と `stage.md` を作り、`test.sh` に場合を足し、「フレームワークごとの運用の違い」の表に列を足す。

## フレームワークごとの運用の違い

取り込み・返し方・受け取り方の流れはどのフレームワークでも同じ（下の「流れ」）。違うのは次のところだけ。
ステージしない物とコミット前に確かめることの細目は `profiles/<profile>/stage.md`。

| | Unreal（`unreal`） | Unity（`unity`） | Node.js（`node`） |
|---|---|---|---|
| フックの入れ方 | `install.sh unreal`。Git LFS のフックが `.git/hooks/` に並ぶが、そのまま残る | `install.sh unity` | husky・lefthook を使う repo では `install.sh` が止まる → その仕組みのフックから本体を呼ぶ（[install.md](install.md)「hooksPath を使う repo」）。**husky を後から入れると、`npm install` のたびに `core.hooksPath` が書かれて中継が黙って効かなくなる**。入れたら同じ日に `.husky/` へ 2 本を足す |
| 取り込む前の設定 | LFS を使うなら、全部の PC で `git lfs install`（忘れると P7 で止まる） | Project Settings の **Version Control → Mode = Visible Meta Files** と **Editor → Asset Serialization → Mode = Force Text**（新しいプロジェクトの既定はこの 2 つ。古いプロジェクトは確かめる）（バイナリのままだと .meta とシーンの差分が読めない）。LFS を使うなら `git lfs install` | なし |
| 合わせられないファイル | `.uasset`・`.umap` はマージできない。同じアセットを 2 か所で同時に直さない（LFS を使うなら `git lfs lock`）。ぶつかったら片方を選ぶしかない | シーン・プレハブは Force Text なら UnityYAMLMerge（Smart Merge）で合わせられる。git の mergetool に登録しておく。テクスチャ・モデルは合わせられない | ロックファイルはぶつかったら手で合わせず、`package.json` を合わせてから `npm install` で作り直す |
| まとめて変わるコミット | エンジンの版上げ・アセットの一括保存・リダイレクタの整理は、それだけのコミットに分ける（差分が大きく、ほかの変更が埋もれる） | エディタの版上げ（`ProjectSettings/ProjectVersion.txt`）と、それで書き換わるアセットは、それだけのコミットに分ける | 依存の一括更新は、それだけのコミットに分ける |
| `確かめ:` に書くもの | C++ を変えたらビルドの結果（例 `確かめ: UE ビルド Succeeded（Result: Succeeded）`）。アセットだけならエディタで開いて確かめたこと | エディタでコンパイルエラー 0・Play で確かめたこと・テストランナーの結果 | `npm test`・型の検査・lint の結果（例 `確かめ: npm test 120 件 PASS・tsc エラー 0`） |
| worktree | worktree ごとに `Intermediate/`・`DerivedDataCache/` が別にでき、最初のビルドが重い | worktree ごとに `Library/` が別にでき、最初の読み込みが重い | worktree ごとに `npm install` が要る |
| 誰が育てるか | このリポジトリ（力を入れる） | Unity の repo（土台だけ置いてある） | Node.js の repo（土台だけ置いてある）。OS ごとの担当は「担当表」 |

フレームワークを足すときは、この表に列を足し、`profiles/<名>/` を作る。

## OS ごとの違い

フックは git が自分の sh で動かすので、コミットのときの動きはどの OS でも同じ。違うのは、手で回すときとファイルの扱いで、**その OS で確かめられる repo が書く。**

| ファイル | 中身 | 担当 |
|---|---|---|
| `os/windows.md` | Windows の注意（sh の場所・改行・パスの長さ…） | このリポジトリ |
| `os/mac.md` | Mac の注意（BSD の道具・実行の印・NFD…） | Mac で使っている repo（いまは下書き・未確認） |
| `profiles/<profile>/windows.md`・`mac.md` | そのフレームワークをその OS で使うときだけの注意 | その組み合わせで使っている repo |

組み合わせのファイルは、要るものだけ作る（無ければ、まだその組み合わせで困ったことを書いた repo が無い）。全部の担当と状態は下の「担当表」。

**フックやスクリプトを直す人へ（どの OS でも）:** 本体は POSIX の sh・awk・sed・grep だけで書く。GNU にしか無い書き方（`sed -i`・sed の置き換えの `\t` や `\r`・`grep -P`・`date +%N`・`awk -v` で正規表現を渡す）は Mac で動かないか、黙って違う結果になる。

## 担当表（フレームワーク × OS）

| profile | 共通（`stage.md`・`profile.conf`） | Windows（`windows.md`） | Mac（`mac.md`） |
|---|---|---|---|
| （OS 全体） | — | `os/windows.md`: **このリポジトリ**・確かめ済み | `os/mac.md`: **Mac の repo**・下書き（未確認） |
| `unreal` | **このリポジトリ**・力を入れる | **このリポジトリ**・確かめ済み | 未作成（Mac で UE を使う repo が作る） |
| `unity` | Unity の repo・土台だけ | 未作成（Unity の repo が作る） | 未作成 |
| `node` | Node.js の repo・土台だけ | Node.js の repo・下書き | 未作成（Mac の Node.js の repo が作る） |
| `plain` | このリポジトリ | — | — |
| `hooks/`・`install.sh`・`test.sh`・`common.conf`・`rules.md` | **このリポジトリ**。直したら全部の OS で `test.sh` が要る（下） | | |

担当が変わったら、この表と、そのファイルの頭の「担当・状態」を一緒に書き換える。

## 組み合わせごとの更新の仕方

どの組み合わせも、流れは同じ（直す → `test.sh` → 返す → ここで main に入れる → 各 repo が受け取る）。違うのは、**どの OS で `test.sh` を回すか**と、**誰が確かめたことにするか**。

`test.sh` の最後の行は `HOOKS-TEST PASS cases=<数> os=windows|mac|linux`。返すときの報告と、コミットの `確かめ:` にはこの行をそのまま書く。

| 直したもの | 回す OS | main に入れる条件 | 入れた後 |
|---|---|---|---|
| `os/windows.md`・`profiles/*/windows.md` | Windows | Windows の `os=windows` の PASS | — |
| `os/mac.md`・`profiles/*/mac.md` | Mac | Mac の `os=mac` の PASS | — |
| `stage.md`・`profile.conf`（共通の部分） | 直した人の OS | その OS の PASS | ほかの OS の repo は、受け取ったときに `test.sh` を回す |
| `hooks/`・`install.sh`・`test.sh`・`common.conf` | 直した人の OS | その OS の PASS。コミットの本文に、回していない OS を書く（例 `Mac では回していない`） | **受け取ったほかの OS の repo が `test.sh` を回す。FAIL ならその repo が直して返す**（下） |

**ファイルの頭の「状態」:** その組み合わせで確かめたら、`<OS の版>・<道具の版> で test.sh PASS（日付）` に書き換える。下書きのまま確かめた repo が、下書きの印を外す。

**ほかの OS で落ちたら（受け取った側）:**
1. `test.sh` の外れた場合の名前と出力を見る。OS の道具の違い（BSD と GNU など）が多い
2. 取り込み先で `Tools/commit-hooks/` の下だけを直し、自分の OS で PASS させる
3. 返す（ブランチ名に OS を入れる: `from-<repo名>-mac-<YYYYMMDD>`）。報告に「どの OS で落ちて、どの OS で PASS させたか」を書く
4. ここで main に入れる前に、元の OS（直した人の OS）でも `test.sh` を回す。両方 PASS で入れる

**OS の注意を書き足す（その OS の repo）:** その OS で困ったこと・確かめたことを `os/<OS>.md`（どのフレームワークでも）か `profiles/<profile>/<OS>.md`（そのフレームワークだけ）に書き、`test.sh` を回して返す。ほかの OS のファイルには書かない（確かめられないので）。気づいたことは、その OS の担当の repo に伝える。

## 流れ（1 回の直しが全部の repo に届くまで）

```
取り込み先 A で直す ──subtree push──▶ ここのブランチ from-A-<日付>
                                              │ test.sh を回して main に入れる
ここで直す ─────────────────────────────▶ main
                                              │
                  各 repo（A を含む）◀── subtree pull
```

main へ入れるのはこのリポジトリだけ。取り込み先は main へ直接 push しない。

## 取り込み先で直した分を返す（subtree push）

**返すもの:** ほかの repo にも効く直し（フックの不具合・検査の追加・フレームワーク別の決まり・stage.md の追記）。
**返さないもの:** その repo だけの違い（`commit-hooks.conf` に書く。取り込んだフォルダの外なので返らない）。

1. 取り込み先で `Tools/commit-hooks/` の下**だけ**を変えたコミットを作る。ほかのファイルと混ぜない（混ぜたコミットも返るが、そのときの件名と本文がほかのファイルの話になる）。メッセージは `rules.md` の形で、件名の範囲に profile を書く（例 `feat(unity): …`・`fix(hooks): …`）。
2. `sh Tools/commit-hooks/test.sh` が PASS すること（最後の行 `HOOKS-TEST PASS cases=<数> os=<OS>` を報告に書く。OS ごとの決まりは「組み合わせごとの更新の仕方」）。検査を足したなら、止まる場合と通る場合を test.sh に足してあること。
3. ブランチとして送る:

   ```sh
   git subtree push --prefix=Tools/commit-hooks https://github.com/kaedeasset/commit-hooks.git from-<repo名>-<OS>-<YYYYMMDD>
   ```

   - 書き込みの権限が要る（kaedeasset の repo）。権限の無い人は、GitHub で fork してそこへ push し、PR を出す
   - 履歴の長い repo では、分ける計算に数分かかる（`git subtree split` が全部の履歴をたどる）
   - 同じ日に 2 回返すときは、ブランチ名の末尾に `-2` を付ける
4. 返したことを、その repo の作業の報告に 1 行書く（ブランチ名）。ここの main に入るまでは、その repo の中で先に効いているだけ。

## 返ってきたブランチを main に入れる（このリポジトリの作業）

```sh
git fetch origin
git log --oneline main..origin/from-<repo名>-<OS>-<日付>      # 何が来たか
git diff main...origin/from-<repo名>-<OS>-<日付> --stat
git switch main && git merge --no-ff origin/from-<repo名>-<OS>-<日付>   # 件名は Merge … なので検査に止められない
sh test.sh                                                 # HOOKS-TEST PASS
git push origin main && git push origin --delete from-<repo名>-<OS>-<日付>
```

入れる前に見ること:
- **共通の部分（`hooks/`・`common.conf`）を変えていないか。** 変えていれば、ほかのフレームワークの repo にも効く。Unreal の repo で試してから入れる
- **既定を変えていないか。** `common.conf` の値（字数・種類・大きさ）を変えると全部の repo が変わる。その repo だけの事情なら、その repo の `commit-hooks.conf` へ戻してもらう
- **新しい設定の名前には、必ず `common.conf` に既定を足しているか。** 既定が無いと、pull しただけの repo が全部 `COMMIT-HOOKS FAIL conf` で止まる
- 外の人の PR なら、フックは誰の PC でも動くシェルなので、中身を全部読んでから入れる

ぶつかったら、ここで解く。取り込み先では解かない（取り込み先は pull だけをする）。

## ここで直す

1. このリポジトリで直す。検査を変えたら test.sh に止まる場合と通る場合を足す。新しい設定の名前は `common.conf` に既定つきで足す（フレームワーク別の値は `profiles/<名>/profile.conf`）
2. `sh test.sh` → `HOOKS-TEST PASS`
3. コミットして push（このリポジトリにもフックが入っている。`sh install.sh plain`）
4. 使っている repo に「pull して」と伝える（下）

## 更新を受け取る（subtree pull）

```sh
git subtree pull --prefix=Tools/commit-hooks https://github.com/kaedeasset/commit-hooks.git main --squash
sh Tools/commit-hooks/test.sh      # 自分の OS で回す。FAIL なら「ほかの OS で落ちたら」
```

- 中継は本体のパスを指すだけなので、`install.sh` を回し直す必要はない（回しても `unchanged`）
- `commit-hooks.conf` は取り込んだフォルダの外なので変わらない
- subtree の作るコミットは `Merge …` なので検査に止められない
- 作業ツリーが汚れていると pull できない。先にコミットする
- いつ pull するか: 返したブランチが main に入った後と、ここから「pull して」と言われたとき。毎日でなくてよい

## やらないこと

- 取り込み先で直して返さずに置く（次の pull でぶつかる・ほかの repo に届かない）
- 取り込み先から main へ直接 push する
- `--no-verify` で止まったコミットを通す（止まったら検査か中身のどちらが違うかを見る。検査が違うならここを直して返す）
- 自分の repo の事情のために `common.conf` の既定を変える

## 注意（踏んだもの）

- 文字数はロケールに頼らず、UTF-8 の続きのバイトを除いて数える（`LC_ALL=C` の awk で日本語 40 字が 120 字になった）。試験の「40 字は通る・41 字は止まる」で確かめている。
- Mac の sed は置き換えの `\t`・`\r` を文字にしない。タブや CR が要るところは awk か `printf` で作る（試験の CRLF の場合がこれで Mac だけ落ちるところだった）。
- `awk -v` で正規表現を渡すと `\.` などのエスケープが先に消え、`^id_rsa\.pub$` が `id_rsaXpub` にも当たっていた。環境変数で渡して `ENVIRON` で読む。
- Claude Code の Bash ツールのコマンド文字列にバックスラッシュを直接書くと潰れることがある。スクリプトはファイルに書いてから実行する。

