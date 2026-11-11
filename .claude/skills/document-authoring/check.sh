#!/bin/sh
# check.sh — Markdown の文書を rules.md の検査（D1〜D7）で調べる。POSIX の sh・awk・sed・grep だけで動く。
#   sh <このフォルダ>/check.sh [ファイル…]
# ファイルを渡さなければ、repo の git ls-files の *.md のうち check_paths に当たるものを全部調べる。
# 値は repo の直下の document-authoring.conf（無ければ下の既定）。書き方: 名前=値。# の行と空行は読まない。
# 出力: 外れたら「DOC-CHECK FAIL D<n> <ファイル>:<行> <理由>」、警告は「DOC-CHECK WARN …」。
# 最後の行: DOC-CHECK PASS|FAIL files=<数> errors=<数> warnings=<数>
# 終了コード: FAIL なら 1。警告だけなら 0。

top=$(git rev-parse --show-toplevel 2>/dev/null) || top=$(pwd)
conf_file="$top/document-authoring.conf"

# conf <名前> <既定> — repo の設定に名前があればその値、無ければ既定
conf() {
    v=""
    if [ -f "$conf_file" ]; then
        v=$(awk -v k="$1" '
        { sub(/\r$/, "") }
        /^[ \t]*#/ || /^[ \t]*$/ { next }
        { i = index($0, "="); if (i && substr($0, 1, i - 1) == k) { v = substr($0, i + 1); f = 1 } }
        END { if (f) print v; else print "\001" }' "$conf_file")
    else
        v=$(printf '\001')
    fi
    if [ "$v" = "$(printf '\001')" ]; then printf '%s' "$2"; else printf '%s' "$v"; fi
}

check_paths=$(conf check_paths "docs README.md")
frontmatter_paths=$(conf frontmatter_paths "docs")
frontmatter_keys=$(conf frontmatter_keys "date type project")
types=$(conf types "spec|design|architecture|guide|reference|report")
vague_words=$(conf vague_words "適切に|適宜|必要に応じて|十分な|よしなに|いい感じに")

# under <パス> <前置きの一覧> — パスが一覧のどれか（フォルダかファイル）に当たれば 0
under() {
    for p in $2; do
        p=${p%/}
        case "$1" in "$p"|"$p"/*) return 0 ;; esac
    done
    return 1
}

list=$(mktemp)
trap 'rm -f "$list" "$list.out"' EXIT
if [ $# -gt 0 ]; then
    for f in "$@"; do printf '%s\n' "$f"; done > "$list"
else
    (cd "$top" && git ls-files -- '*.md') | while IFS= read -r f; do
        under "$f" "$check_paths" && printf '%s\n' "$top/$f"
    done > "$list"
fi

files=0; errors=0; warnings=0
while IFS= read -r f; do
    [ -n "$f" ] || continue
    if [ ! -f "$f" ]; then
        echo "DOC-CHECK FAIL D0 $f ファイルが無い"; errors=$((errors + 1)); continue
    fi
    files=$((files + 1))
    # repo の直下からのパス（frontmatter_paths の判定と表示に使う）
    case "$f" in "$top"/*) rel=${f#"$top"/} ;; *) rel=$f ;; esac
    need_fm=0; under "$rel" "$frontmatter_paths" && need_fm=1

    NEED_FM=$need_fm FM_KEYS=$frontmatter_keys TYPES=$types VAGUE=$vague_words awk '
    function out(kind, id, msg) { print kind " " id " " NR " " msg }
    BEGIN { need_fm = ENVIRON["NEED_FM"] + 0; vague = ENVIRON["VAGUE"]; types = "^(" ENVIRON["TYPES"] ")$"
            nk = split(ENVIRON["FM_KEYS"], keys, " ") }
    { sub(/\r$/, "") }
    # frontmatter（1 行目が --- のとき、次の --- まで）
    NR == 1 && $0 == "---" { in_fm = 1; has_fm = 1; next }
    in_fm {
        if ($0 == "---") { in_fm = 0; next }
        i = index($0, ":")
        if (i) { k = substr($0, 1, i - 1); v = substr($0, i + 1); sub(/^[ \t]+/, "", v); sub(/[ \t]+$/, "", v); fm[k] = v }
        next
    }
    # D6 自分の PC の絶対パス（コードの枠の中も見る）。<you> のような置き換えの印は通す
    # 置き換えの印（<you>・…・...・*・$HOME・%USERNAME%・` ・行の終わり）が続くものは先に消してから見る
    {
        p = $0
        gsub(/([Uu]sers|home)[\\\/](<[^>]*>|…|\.\.\.|\*|\$[A-Za-z_{][A-Za-z0-9_}]*|%[A-Za-z]+%|`)/, "", p)
        if (p ~ /[A-Za-z]:[\\\/][Uu]sers[\\\/][^\\\/ ]/ || p ~ /(^|[^A-Za-z0-9_.])\/Users\/[^\/ ]/ || p ~ /(^|[^A-Za-z0-9_.])\/home\/[^\/ ]/)
            out("FAIL", "D6", "自分の PC の絶対パスがある。repo の中は相対パス、外は <you> などに置き換える")
    }
    # コードの枠（``` か ~~~）
    {
        line = $0; sub(/^ ? ? ?/, "", line)
        if (!in_fence && (line ~ /^```/ || line ~ /^~~~/)) {
            match(line, /^(`+|~+)/); mark = substr(line, 1, RLENGTH)
            rest = substr(line, RLENGTH + 1); gsub(/[ \t]/, "", rest)
            if (rest == "") out("FAIL", "D3", "コードの枠に言語が無い（text・sh・ts・json・mermaid など）")
            in_fence = 1; next
        }
        if (in_fence) {
            # 開けたのと同じ字で、同じ数以上だけの行で閉じる（```` の中の ``` では閉じない）
            t = line; sub(/[ \t]+$/, "", t)
            if (index(t, mark) == 1 && (t ~ /^`+$/ || t ~ /^~+$/)) in_fence = 0
            next
        }
    }
    # 見出し
    /^#+[ \t]/ {
        lv = index($0, " "); t = index($0, "\t"); if (t && (t < lv || !lv)) lv = t; lv = lv - 1
        if (lv == 1) { h1++; if (h1 == 2) out("FAIL", "D1", "H1（# の見出し）が 2 つ目") }
        if (prev && lv > prev + 1) out("FAIL", "D2", "見出しが " prev " 段から " lv " 段へ飛んでいる")
        prev = lv
    }
    # D7 あいまいな言葉（警告。`…` の中は見ない）
    { v = $0; gsub(/`[^`]*`/, "", v) }
    vague != "" && v ~ vague { out("WARN", "D7", "あいまいな言葉がある。数・条件・コマンドに置き換える") }
    # D5 リンク先（`…` の中は見ない）。LINK として sh に渡す
    {
        s = $0; gsub(/`[^`]*`/, "", s)
        while (match(s, /\]\([^)]+\)/)) {
            tgt = substr(s, RSTART + 2, RLENGTH - 3); s = substr(s, RSTART + RLENGTH)
            sub(/[ \t].*$/, "", tgt); sub(/#.*$/, "", tgt)
            if (tgt == "" || tgt ~ /^[A-Za-z][A-Za-z0-9+.-]*:/ || tgt ~ /^</) continue
            print "LINK D5 " NR " " tgt
        }
    }
    END {
        if (in_fm) { NR = 1; out("FAIL", "D4", "frontmatter の終わりの --- が無い") }
        if (!h1) { NR = 1; out("FAIL", "D1", "H1（# の見出し）が無い") }
        if (need_fm) {
            NR = 1
            if (!has_fm) out("FAIL", "D4", "frontmatter（1 行目からの --- の塊）が無い")
            else {
                for (j = 1; j <= nk; j++) if (fm[keys[j]] == "") out("FAIL", "D4", "frontmatter に " keys[j] ": が無い")
                if (fm["type"] != "" && fm["type"] !~ types) out("FAIL", "D4", "type: " fm["type"] " は決まりの種類でない（" ENVIRON["TYPES"] "）")
                if (fm["date"] != "" && fm["date"] !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) out("FAIL", "D4", "date: は YYYY-MM-DD")
            }
        }
    }' "$f" > "$list.out"

    dir=$(dirname "$f")
    while IFS=' ' read -r kind id ln msg; do
        case "$kind" in
        LINK)
            case "$msg" in /*) p="$top$msg" ;; *) p="$dir/$msg" ;; esac
            if [ ! -e "$p" ]; then
                echo "DOC-CHECK FAIL D5 $rel:$ln リンク先が無い: $msg"; errors=$((errors + 1))
            fi ;;
        FAIL) echo "DOC-CHECK FAIL $id $rel:$ln $msg"; errors=$((errors + 1)) ;;
        WARN) echo "DOC-CHECK WARN $id $rel:$ln $msg"; warnings=$((warnings + 1)) ;;
        esac
    done < "$list.out"
done < "$list"

if [ "$errors" -gt 0 ]; then
    echo "直し方は rules.md の検査の表（D1〜D7）。直して check.sh を回し直す。"
    echo "DOC-CHECK FAIL files=$files errors=$errors warnings=$warnings"
    exit 1
fi
echo "DOC-CHECK PASS files=$files errors=$errors warnings=$warnings"
