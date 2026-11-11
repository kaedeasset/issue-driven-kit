#!/bin/sh
# install.sh — 共有の .git/hooks/ に中継の commit-msg・pre-commit を書く（本体はこのフォルダの hooks/）。
#   sh <commit-hooks を置いたフォルダ>/install.sh <profile>     （profile は profiles/ の下のフォルダ名: unreal・unity・node）
# repo の直下に commit-hooks.conf（その repo だけの違い）が無ければ、commit-hooks.conf.example から作る。あれば上書きしない。
# .git/hooks/ は全 worktree で共有なので、1 回入れれば全 worktree に効く。core.hooksPath は変えない（Git LFS などのフックが残る）。
# 何度実行しても同じ。同名のフックが違う中身で既にあれば、中身を出して止める（上書きしない）。
# core.hooksPath が設定されている（husky など）と .git/hooks/ は読まれないので、止める（docs/install.md「hooksPath を使う repo」）。
# 終わりの行: HOOKS-INSTALL conf=created|exists|mismatch commit-msg=installed|unchanged|conflict pre-commit=… others=<残っているフック> verdict=PASS|FAIL
# 戻し方: .git/hooks/commit-msg と .git/hooks/pre-commit を消す。

profile="$1"
here=$(cd "$(dirname "$0")" && pwd)
cd "$here" || exit 1
# リポジトリの直下からこのフォルダまで（例 Tools/commit-hooks/。直下なら空）
dir=$(git rev-parse --show-prefix) || exit 1
common=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1
hookdir="$common/hooks"

hp=$(git config --get core.hooksPath)
if [ -n "$hp" ]; then
    echo "core.hooksPath=$hp が設定されている。.git/hooks/ の中継は読まれない。その仕組みのフックから本体を呼ぶ（docs/install.md「hooksPath を使う repo」）"
    echo "HOOKS-INSTALL commit-msg=skipped pre-commit=skipped others= verdict=FAIL"
    exit 1
fi

mkdir -p "$hookdir"
ok=1; state=""

# repo の直下の commit-hooks.conf（その repo だけの違い）。無ければひな形から作る・あれば上書きしない
top=$(git rev-parse --show-toplevel)
if [ -z "$profile" ] || [ ! -f "profiles/$profile/profile.conf" ]; then
    echo "profile を 1 つ渡す: sh install.sh <$(ls profiles | grep -v '\.conf$' | tr '\n' '|' | sed 's/|$//')>"
    echo "HOOKS-INSTALL conf=none verdict=FAIL"
    exit 1
fi
if [ -f "$top/commit-hooks.conf" ]; then
    have=$(awk '{ sub(/\r$/, "") } /^profile=/ { v = substr($0, 9) } END { print v }' "$top/commit-hooks.conf")
    if [ "$have" = "$profile" ]; then
        state=" conf=exists"
    else
        echo "FAIL: $top/commit-hooks.conf の profile=$have が、渡した $profile と違う（上書きしない。直すなら conf の profile= を書き換える）"
        state=" conf=mismatch"; ok=0
    fi
else
    sed -e "s|@PROFILE@|$profile|" -e 's/\r$//' commit-hooks.conf.example > "$top/commit-hooks.conf"
    state=" conf=created"
fi
for name in commit-msg pre-commit; do
    tmp="$hookdir/.$name.commit-hooks.tmp"
    sed -e "s|@HOOK@|$name|g" -e "s|@DIR@|$dir|g" -e 's/\r$//' hooks/relay.sh > "$tmp"
    if [ -f "$hookdir/$name" ]; then
        if cmp -s "$tmp" "$hookdir/$name"; then
            state="$state $name=unchanged"; rm -f "$tmp"; chmod +x "$hookdir/$name"; continue
        fi
        echo "FAIL: $hookdir/$name が別の中身で既にある（上書きしない。中身を見て、消してよければ消してから入れ直す）:"
        cat "$hookdir/$name"
        state="$state $name=conflict"; ok=0; rm -f "$tmp"; continue
    fi
    mv "$tmp" "$hookdir/$name"; chmod +x "$hookdir/$name"
    state="$state $name=installed"
done
others=$(ls "$hookdir" | grep -v '\.sample$' | grep -v -x -e commit-msg -e pre-commit | tr '\n' ',' | sed 's/,$//')
if [ $ok = 1 ]; then v=PASS; else v=FAIL; fi
echo "HOOKS-INSTALL${state} others=$others verdict=$v"
[ $ok = 1 ]
