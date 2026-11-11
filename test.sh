#!/bin/sh
# test.sh — install.sh・設定の 3 段・commit-msg・pre-commit の試験。一時フォルダに使い捨ての repo を作り、
# このフォルダを Tools/commit-hooks/ に写して install.sh で入れ、本物の git commit で回す。
#   sh test.sh
# 最後の行に回した OS（os=windows|mac|linux）を出す。
# 場合ごとに CASE <名> ok|NG、最後に HOOKS-TEST PASS|FAIL cases=<数> os=<OS>（外れた場合の名前つき）。

src=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# 写す物（.git と試験の外のもの以外）
copyto() { mkdir -p "$1"; cp -r "$src/hooks" "$src/profiles" "$src/install.sh" "$src/commit-hooks.conf.example" "$1/"; }
repo="$tmp/repo"
git init -q "$repo" || exit 1
cd "$repo" || exit 1
git config user.name test; git config user.email test@example.invalid; git config core.autocrlf false
copyto Tools/commit-hooks
printf 'Saved/\n*.bin\n' > .gitignore

failed=""
n=0
# check <名> <条件の終了コード> <外れたときに出すもの>
check() { n=$((n + 1)); if [ "$2" -eq 0 ]; then echo "CASE $1 ok"; else echo "CASE $1 NG"; printf '%s\n' "$3" | sed 's/^/    /'; failed="$failed,$1"; fi; }
# setconf <中身> — repo の commit-hooks.conf を書き換える（コミットはしない。フックは作業ツリーのファイルを読む）
setconf() { printf '%s\n' "$@" > commit-hooks.conf; }

# --- install.sh
out=$(sh Tools/commit-hooks/install.sh 2>&1); rc=$?
[ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'verdict=FAIL'; check 'install profileなしは止める' $? "$out"
out=$(sh Tools/commit-hooks/install.sh node 2>&1)
printf '%s' "$out" | grep -q 'conf=created commit-msg=installed pre-commit=installed .*verdict=PASS'; check 'install 1回目' $? "$out"
grep -q '^profile=node$' commit-hooks.conf; check 'confにprofileが入る' $? "$(cat commit-hooks.conf)"
echo '# 手で足した行' >> commit-hooks.conf
out=$(sh Tools/commit-hooks/install.sh node 2>&1)
printf '%s' "$out" | grep -q 'conf=exists commit-msg=unchanged pre-commit=unchanged .*verdict=PASS'; check 'install 2回目' $? "$out"
grep -q '手で足した行' commit-hooks.conf; check 'confを上書きしない' $? "$(cat commit-hooks.conf)"
out=$(sh Tools/commit-hooks/install.sh unity 2>&1); rc=$?
[ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'conf=mismatch'; check '違うprofileは止める' $? "$out"
grep -q 'Tools/commit-hooks/hooks/commit-msg' .git/hooks/commit-msg; check '中継が置き場を指す' $? "$(cat .git/hooks/commit-msg)"
git init -q "$tmp/other"; printf '#!/bin/sh\nexit 0\n' > "$tmp/other/.git/hooks/pre-commit"
copyto "$tmp/other/ch"
out=$(sh "$tmp/other/ch/install.sh" node 2>&1); rc=$?
[ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'pre-commit=conflict .*verdict=FAIL'; check '既存のフックを上書きしない' $? "$out"
git -C "$tmp/other" config core.hooksPath .husky
out=$(sh "$tmp/other/ch/install.sh" node 2>&1); rc=$?
[ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'verdict=FAIL'; check 'hooksPathがあれば止める' $? "$out"

# rules.md の例（説明を差し替えて使う）
good() {
    printf '%s\n\n期限が切れても前の画面に留まり、操作がすべて失敗していた。\n期限切れを受けたらログイン画面へ戻す。\n\n%s\n\n---\n原因は思ったより手前にあった。\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n' \
        "${1:-fix(login): 期限切れのときにログイン画面へ戻す}" "${2:-確かめ: 単体テスト 42 件 PASS。}"
}
git add .gitignore Tools commit-hooks.conf
good "chore: 試験の土台" > "$tmp/m"
git commit -q -F "$tmp/m" >/dev/null 2>&1 || { echo 'HOOKS-TEST FAIL 土台のコミットができない'; git commit -F "$tmp/m"; exit 1; }

# expect <名> <pass|止める項目> <メッセージのファイル>  — ステージした中身でコミットを試し、結果を比べる
expect() {
    name=$1; want=$2; file=$3
    out=$(git commit -q -F "$file" 2>&1); rc=$?
    if [ "$want" = pass ]; then
        [ $rc -eq 0 ]; r=$?
    else
        [ $rc -ne 0 ] && printf '%s' "$out" | grep -q "FAIL.*$want"; r=$?
    fi
    check "$name" $r "want=$want rc=$rc
$out"
    # 止まった場合はステージを空に戻す
    git reset -q
}
# 小さな更新をステージする（メッセージの場合用）
k=0
touchfile() { k=$((k + 1)); echo "$k" >> note.txt; git add note.txt; }

# --- commit-msg
touchfile; good > "$tmp/m"; expect 'rules.md の例' pass "$tmp/m"
touchfile; good 'fix: 一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十' > "$tmp/m"; expect '説明が40字' pass "$tmp/m"
touchfile; good 'fix: 一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一' > "$tmp/m"; expect '説明が41字' M2 "$tmp/m"
touchfile; good 'fix: abcdefghijabcdefghijabcdefghijabcdefghij' > "$tmp/m"; expect '英字で40字' pass "$tmp/m"
touchfile; good 'ログインを直した' > "$tmp/m"; expect '種類が無い' M1 "$tmp/m"
touchfile; good | sed '2s/^$/すぐ本文/' > "$tmp/m"; expect '2行目が空でない' M3 "$tmp/m"
touchfile; good | grep -v '^確かめ' > "$tmp/m"; expect '確かめが無い' M4 "$tmp/m"
touchfile; printf 'fix: ログインを直す\n\n確かめ: なし（文書のみ）\n\n---\n感想。\n' > "$tmp/m"; expect '本文が確かめだけ' M4 "$tmp/m"
touchfile; good | sed '/^---$/,/^$/d' > "$tmp/m"; expect '---が無い' M5 "$tmp/m"
touchfile; good | grep -v '^原因は' > "$tmp/m"; expect '---の後がCo-Authorだけ' M5 "$tmp/m"
touchfile; printf "Merge branch 'x'\n" > "$tmp/m"; expect 'Merge' pass "$tmp/m"
touchfile; printf 'Revert "fix: ログインを直す"\n\nThis reverts commit abc.\n' > "$tmp/m"; expect 'Revert' pass "$tmp/m"
touchfile; printf 'fixup! fix: ログインを直す\n' > "$tmp/m"; expect 'fixup' pass "$tmp/m"
touchfile; good '' '確かめ：全角のコロン' > "$tmp/m"; expect '全角の確かめ' pass "$tmp/m"
touchfile; good 'docs(readme): 範囲つき' > "$tmp/m"; expect '範囲つき' pass "$tmp/m"
# \r は Mac の sed が改行の文字にしないので awk で作る
touchfile; good | awk '{ printf "%s\r\n", $0 }' > "$tmp/m"; expect 'CRLFのメッセージ' pass "$tmp/m"

# --- 設定の 3 段
touchfile; good 'perf: 速くする' > "$tmp/m"; expect '種類perfは既定で止める' M1 "$tmp/m"
setconf 'profile=node' 'types=feat|fix|docs|refactor|chore|test|perf'
touchfile; good 'perf: 速くする' > "$tmp/m"; expect 'repoのconfでperfを足す' pass "$tmp/m"
setconf 'profile=node' 'subject_max=10'
touchfile; good 'fix: 一二三四五六七八九十一' > "$tmp/m"; expect 'repoのconfで字数を変える' M2 "$tmp/m"
setconf 'profile=nothing'
touchfile; good > "$tmp/m"; expect 'profileが違えば止める' 'conf' "$tmp/m"
mv commit-hooks.conf "$tmp/conf.bak"
touchfile; good > "$tmp/m"; out=$(git commit -q -F "$tmp/m" 2>&1); rc=$?; git reset -q
[ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'COMMIT-HOOKS FAIL conf .*commit-hooks.conf が無い'; check 'confが無ければ止める' $? "$out"
mv "$tmp/conf.bak" commit-hooks.conf
setconf 'profile=node'

# --- pre-commit（メッセージは rules.md の例）
good > "$tmp/m"
mkdir -p Saved; echo x > Saved/out.txt; git add -f Saved/out.txt; expect 'ignoreに当たるファイルをadd -f' P1 "$tmp/m"
touchfile; expect '追跡済みのファイルの更新' pass "$tmp/m"
echo SECRET=1 > .env; git add .env; expect '.envを足す' P2 "$tmp/m"
rm -f .env
setconf 'profile=node' 'secret_extra=^id_rsa$'
echo k > id_rsa; git add id_rsa; expect 'confのsecret_extra' P2 "$tmp/m"
rm -f id_rsa
setconf 'profile=node' 'secret_extra=^id_rsa\.pub$'
echo k > id_rsaXpub; git add id_rsaXpub; expect 'secret_extraの\.は文字どおり' pass "$tmp/m"
echo k > id_rsa.pub; git add id_rsa.pub; expect 'secret_extraの\.で当たる' P2 "$tmp/m"
rm -f id_rsa.pub; setconf 'profile=node'
# OS が作るファイルはどの profile でも止める
echo x > .DS_Store; git add -f .DS_Store; expect 'OSのファイル.DS_Store' P4 "$tmp/m"
rm -f .DS_Store
mkdir -p docs; echo x > docs/Thumbs.db; git add docs/Thumbs.db; expect 'OSのファイルThumbs.db' P4 "$tmp/m"
rm -f docs/Thumbs.db
echo x > 'docs/._note.md'; git add 'docs/._note.md'; expect 'OSのファイル._' P4 "$tmp/m"
rm -f 'docs/._note.md'
mkdir -p big
head -c $((96 * 1048576)) /dev/zero > big/96.dat; git add big/96.dat; expect '96MBのファイル' P3 "$tmp/m"
rm -f big/96.dat
head -c $((60 * 1048576)) /dev/zero > big/60.dat; git add big/60.dat
out60=$(git commit -q -F "$tmp/m" 2>&1); rc60=$?
[ $rc60 -eq 0 ] && printf '%s' "$out60" | grep -q 'WARN P3'; check '60MBのファイル' $? "rc=$rc60
$out60"

# P4: フレームワーク別の生成物
mkdir -p web/node_modules/x; echo x > web/node_modules/x/i.js; git add web/node_modules/x/i.js; expect 'node: node_modules' P4 "$tmp/m"
mkdir -p dist; echo x > dist/a.js; git add dist/a.js; expect 'node: distは止めない' pass "$tmp/m"
setconf 'profile=unreal'
mkdir -p Plugins/P/Binaries/Win64; echo x > Plugins/P/Binaries/Win64/a.dll; git add Plugins/P/Binaries/Win64/a.dll; expect 'unreal: プラグインのBinaries' P4 "$tmp/m"
mkdir -p Intermediate; echo x > Intermediate/a.txt; git add Intermediate/a.txt; expect 'unreal: Intermediate' P4 "$tmp/m"

# P5: Unity の .meta
setconf 'profile=unity'
mkdir -p Library; echo x > Library/a.txt; git add Library/a.txt; expect 'unity: Library' P4 "$tmp/m"
mkdir -p Assets/Library; echo x > Assets/Library/b.txt; echo m > Assets/Library/b.txt.meta; echo m > Assets/Library.meta
git add Assets; expect 'unity: Assetsの中のLibraryは止めない' pass "$tmp/m"
mkdir -p Assets/Img; echo x > Assets/Img/a.png; echo m > Assets/Img.meta; git add Assets/Img/a.png Assets/Img.meta; expect 'unity: アセットの.metaが無い' P5 "$tmp/m"
echo m > Assets/Img/a.png.meta; git add Assets/Img/a.png Assets/Img/a.png.meta; expect 'unity: フォルダの.metaが無い' P5 "$tmp/m"
git add Assets/Img Assets/Img.meta; expect 'unity: 全部そろえば通る' pass "$tmp/m"
echo m > Assets/ghost.png.meta; git add Assets/ghost.png.meta; expect 'unity: .metaだけ' P5 "$tmp/m"
rm -f Assets/ghost.png.meta
mkdir -p Assets/.hidden; echo x > Assets/.hidden/a.txt; git add -f Assets/.hidden/a.txt; expect 'unity: 隠しフォルダは.meta不要' pass "$tmp/m"
git rm -q Assets/Img/a.png; expect 'unity: 消して.metaが残る' P5 "$tmp/m"
git rm -q Assets/Img/a.png Assets/Img/a.png.meta; expect 'unity: 一緒に消せば通る' pass "$tmp/m"
setconf 'profile=node'
mkdir -p Assets; echo x > Assets/n.png; git add Assets/n.png; expect 'node: .metaは見ない' pass "$tmp/m"

# --- Unreal（P4 のファイル・P6・P7）
setconf 'profile=unreal'
echo x > Game.sln; git add Game.sln; expect 'unreal: .sln' P4 "$tmp/m"
rm -f Game.sln
mkdir -p Source/G; echo x > Source/G/G.cpp; git add Source/G/G.cpp; expect 'unreal: Sourceは通る' pass "$tmp/m"
# P6: マップ M と外部アクタ 2 本を土台にする
mkdir -p Content/Maps Content/__ExternalActors__/Maps/M/0/AB Content/__ExternalObjects__/Maps/M/1
echo m > Content/Maps/M.umap; echo a > Content/__ExternalActors__/Maps/M/0/AB/A1.uasset; echo b > Content/__ExternalActors__/Maps/M/0/AB/A2.uasset
git add Content; good 'chore: マップの土台' > "$tmp/m6"; git commit -q -F "$tmp/m6" >/dev/null 2>&1
echo a2 >> Content/__ExternalActors__/Maps/M/0/AB/A1.uasset; echo b2 >> Content/__ExternalActors__/Maps/M/0/AB/A2.uasset
echo o > Content/__ExternalObjects__/Maps/M/1/O1.uasset
git add Content/__ExternalActors__/Maps/M/0/AB/A1.uasset
out=$(git commit -q -F "$tmp/m" 2>&1); rc=$?
[ $rc -eq 0 ] && printf '%s' "$out" | grep -q 'WARN P6 Content/Maps/M.umap（同じマップのファイルが 2 本'; check 'unreal: マップの一部だけで警告' $? "rc=$rc
$out"
git add Content
out=$(git commit -q -F "$tmp/m" 2>&1); rc=$?
[ $rc -eq 0 ] && ! printf '%s' "$out" | grep -q 'WARN P6'; check 'unreal: マップを全部載せれば警告なし' $? "rc=$rc
$out"
setconf 'profile=node'
echo a3 >> Content/__ExternalActors__/Maps/M/0/AB/A1.uasset; echo b3 >> Content/__ExternalActors__/Maps/M/0/AB/A2.uasset
git add Content/__ExternalActors__/Maps/M/0/AB/A1.uasset
out=$(git commit -q -F "$tmp/m" 2>&1); rc=$?
[ $rc -eq 0 ] && ! printf '%s' "$out" | grep -q 'WARN P6'; check 'node: P6は見ない' $? "rc=$rc
$out"
git checkout -q -- Content
# P7: LFS の対象を、LFS の働かない設定で add する（中身がそのまま入る）
printf '*.uasset filter=lfs diff=lfs merge=lfs -text\n' > .gitattributes; git add .gitattributes
good 'chore: LFS の設定' > "$tmp/m7"; git commit -q -F "$tmp/m7" >/dev/null 2>&1
nolfs() { git -c filter.lfs.clean=cat -c filter.lfs.smudge=cat -c filter.lfs.process= -c filter.lfs.required=false "$@"; }
head -c 2048 /dev/zero | tr '\0' 'x' > Content/Raw.uasset; nolfs add Content/Raw.uasset; expect 'LFSの対象がそのまま' P7 "$tmp/m"
rm -f Content/Raw.uasset
printf 'version https://git-lfs.github.com/spec/v1\noid sha256:%064d\nsize 2048\n' 0 > Content/Ptr.uasset; nolfs add Content/Ptr.uasset; expect 'LFSのポインタは通る' pass "$tmp/m"
head -c 2048 /dev/zero | tr '\0' 'x' > Content/raw.txt; git add Content/raw.txt; expect 'LFSの対象でなければ見ない' pass "$tmp/m"

# どの OS で回したか（返すときの報告と確かめ: にそのまま書く）
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) os=windows ;; Darwin) os=mac ;; Linux) os=linux ;; *) os=$(uname -s) ;; esac
if [ -z "$failed" ]; then echo "HOOKS-TEST PASS cases=$n os=$os"; exit 0; fi
echo "HOOKS-TEST FAIL cases=$n os=$os failed=${failed#,}"
exit 1
