#!/bin/sh
# test.sh — check.sh の試験。一時フォルダに使い捨ての repo を作り、このフォルダを .claude/skills/document-authoring/ に写して回す。
#   sh test.sh
# 場合ごとに CASE <名> ok|NG、最後に DOC-TEST PASS|FAIL cases=<数> os=<OS>（外れた場合の名前つき）。

src=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo"
git init -q "$repo" || exit 1
cd "$repo" || exit 1
skill=.claude/skills/document-authoring
mkdir -p "$skill" docs
cp "$src/check.sh" "$src/rules.md" "$src/SKILL.md" "$src/document-authoring.conf.example" "$skill/"
cp -r "$src/templates" "$skill/"

failed=""
n=0
check() { n=$((n + 1)); if [ "$2" -eq 0 ]; then echo "CASE $1 ok"; else echo "CASE $1 NG"; printf '%s\n' "$3" | sed 's/^/    /'; failed="$failed,$1"; fi; }
run() { out=$(sh "$skill/check.sh" "$@" 2>&1); rc=$?; }
# expect_fail <名> <検査の番号> <ファイル>
expect_fail() { run "$3"; [ $rc -ne 0 ] && printf '%s' "$out" | grep -q "DOC-CHECK FAIL $2 "; check "$1" $? "$out"; }
# expect_pass <名> <ファイル>…
expect_pass() { nm=$1; shift; run "$@"; [ $rc -eq 0 ] && printf '%s' "$out" | grep -q '^DOC-CHECK PASS' && ! printf '%s' "$out" | grep -q 'DOC-CHECK FAIL D'; check "$nm" $? "$out"; }
fm() { printf -- '---\ndate: 2026-11-11\ntype: %s\nproject: sample\n---\n\n' "${1:-guide}"; }
fence='```'

# --- 通る
{ fm; printf '# 手順\n\n## 1. 準備\n\n### 1.1 道具\n\n%ssh\ngit --version\n%s\n\n[README](../README.md)\n' "$fence" "$fence"; } > docs/good.md
printf '# 読んで\n' > README.md
expect_pass '形の合った文書は通る' docs/good.md

# --- D1 H1
{ fm; printf '## 章だけ\n'; } > docs/d1a.md
expect_fail 'H1が無いと止める' D1 docs/d1a.md
{ fm; printf '# 一つ目\n\n# 二つ目\n'; } > docs/d1b.md
expect_fail 'H1が2つだと止める' D1 docs/d1b.md
{ fm; printf '# 題\n\n%ssh\n# これはコメント\n%s\n'  "$fence" "$fence"; } > docs/d1c.md
expect_pass 'コードの枠の中の#は見出しでない' docs/d1c.md

# --- D2 見出しの飛び
{ fm; printf '# 題\n\n## 章\n\n#### 飛んだ\n'; } > docs/d2.md
expect_fail '見出しが飛ぶと止める' D2 docs/d2.md
{ fm; printf '# 題\n\n## 章\n\n### 節\n\n## 次の章\n'; } > docs/d2b.md
expect_pass '見出しが浅く戻るのは通る' docs/d2b.md

# --- D3 コードの枠の言語
{ fm; printf '# 題\n\n%s\nls\n%s\n' "$fence" "$fence"; } > docs/d3.md
expect_fail '言語の無いコードの枠を止める' D3 docs/d3.md
{ fm; printf '# 題\n\n~~~\nls\n~~~\n'; } > docs/d3b.md
expect_fail '言語の無い~~~の枠を止める' D3 docs/d3b.md
{ fm; printf '# 題\n\n````markdown\n%sts\nconst a = 1\n%s\n````\n\n## 後\n' "$fence" "$fence"; } > docs/d3c.md
expect_pass '````の中の```で閉じない' docs/d3c.md

# --- D4 frontmatter
printf '# 題\n' > docs/d4a.md
expect_fail 'docsでfrontmatterが無いと止める' D4 docs/d4a.md
printf -- '---\ndate: 2026-11-11\ntype: guide\n---\n\n# 題\n' > docs/d4b.md
expect_fail 'frontmatterの名前が足りないと止める' D4 docs/d4b.md
{ fm memo; printf '# 題\n'; } > docs/d4c.md
expect_fail '決まりにないtypeを止める' D4 docs/d4c.md
printf -- '---\ndate: 2026/11/11\ntype: guide\nproject: s\n---\n\n# 題\n' > docs/d4d.md
expect_fail 'dateの形が違うと止める' D4 docs/d4d.md
printf -- '---\ndate: 2026-11-11\ntype: guide\nproject: s\n\n# 題\n' > docs/d4e.md
expect_fail 'frontmatterが閉じていないと止める' D4 docs/d4e.md
expect_pass 'docsの外はfrontmatterが要らない' README.md

# --- D5 リンク
{ fm; printf '# 題\n\n[無い](nothing.md)\n'; } > docs/d5.md
expect_fail '無いリンク先を止める' D5 docs/d5.md
{ fm; printf '# 題\n\n[有る](good.md#1-準備) [外](https://example.com) [章](#題) `[例](x.md)` [上](/README.md)\n'; } > docs/d5b.md
expect_pass 'アンカー・URL・コードの中・repoの直下からのリンクは通る' docs/d5b.md

# --- D6 自分の PC の絶対パス
{ fm; printf '# 題\n\n例: C:\\Users\\taro\\work\\a.cs\n'; } > docs/d6a.md
expect_fail 'WindowsのUsersのパスを止める' D6 docs/d6a.md
{ fm; printf '# 題\n\n%ssh\ncd /Users/taro/work\n%s\n' "$fence" "$fence"; } > docs/d6b.md
expect_fail 'コードの枠の中のMacのパスも止める' D6 docs/d6b.md
{ fm; printf '# 題\n\n[a](file:///C:/Users/taro/a.cs)\n'; } > docs/d6c.md
expect_fail 'file:///のUsersのパスを止める' D6 docs/d6c.md
{ fm; printf '# 題\n\n例: C:\\Users\\<you>\\work と /Users/<you>/work と /home/<you>\n'; } > docs/d6d.md
expect_pass '<you>に置き換えたパスは通る' docs/d6d.md
{ fm; printf '# 題\n\nパス（`C:\\Users\\…`・`/Users/`・C:\\Users\\...・/home/*・$HOME 以外の C:\\Users\\%%USERNAME%%）は書かない\n'; } > docs/d6e.md
expect_pass '決まりを説明する書き方は通る' docs/d6e.md
{ fm; printf '# 題\n\n`必要に応じて` のような言葉を避ける。\n'; } > docs/d7b.md
run docs/d7b.md
[ $rc -eq 0 ] && ! printf '%s' "$out" | grep -q 'WARN'; check 'コードの中のあいまいな言葉は警告しない' $? "$out"

# --- D7 あいまいな言葉（警告だけ）
{ fm; printf '# 題\n\n必要に応じて設定する。\n'; } > docs/d7.md
run docs/d7.md
[ $rc -eq 0 ] && printf '%s' "$out" | grep -q 'DOC-CHECK WARN D7 ' && printf '%s' "$out" | grep -q 'warnings=1'; check 'あいまいな言葉は警告だけ' $? "$out"

# --- 改行
awk '{ printf "%s\r\n", $0 }' docs/good.md > docs/crlf.md
expect_pass 'CRLFの文書も通る' docs/crlf.md

# --- 設定（repo の直下の document-authoring.conf）
printf 'types=guide|memo\nvague_words=\n' > document-authoring.conf
expect_pass 'confでtypeを足せる' docs/d4c.md
run docs/d7.md
[ $rc -eq 0 ] && ! printf '%s' "$out" | grep -q 'WARN'; check 'confでvague_wordsを空にすると警告しない' $? "$out"
printf 'frontmatter_paths=\n' > document-authoring.conf
expect_pass 'confでfrontmatterを要らなくできる' docs/d4a.md
rm document-authoring.conf

# --- ファイルを渡さないとき（git ls-files の *.md のうち check_paths）
rm -f docs/*.md
{ fm; printf '# 題\n'; } > docs/a.md
printf '# 外\n\n## x\n\n#### 飛ぶ\n' > other.md
printf '# 読んで\n' > README.md
git add -A >/dev/null 2>&1
run
[ $rc -eq 0 ] && printf '%s' "$out" | grep -q 'DOC-CHECK PASS files=2 '; check '既定はdocsとREADMEだけを見る' $? "$out"
printf 'check_paths=docs README.md other.md\n' > document-authoring.conf
run
[ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'DOC-CHECK FAIL D2 other.md:5 '; check 'confでcheck_pathsを足せる' $? "$out"
rm document-authoring.conf

# --- 終わりの行と終了コード
run docs/nothing.md
[ $rc -ne 0 ] && printf '%s' "$out" | tail -1 | grep -q '^DOC-CHECK FAIL files=0 errors=1'; check '無いファイルを渡すと止める' $? "$out"

# --- このキット自身の文書（写した物がそのまま通る）
expect_pass 'rules.mdとSKILL.mdとtemplatesが通る' "$skill/rules.md" "$skill/SKILL.md" "$skill"/templates/*.md

case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) os=windows ;; Darwin) os=mac ;; *) os=linux ;; esac
if [ -z "$failed" ]; then
    echo "DOC-TEST PASS cases=$n os=$os"
else
    echo "DOC-TEST FAIL cases=$n os=$os failed=${failed#,}"
    exit 1
fi
