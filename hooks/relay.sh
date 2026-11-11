#!/bin/sh
# commit-hooks の中継（install.sh が書く・本体は各 worktree の @DIR@hooks/@HOOK@）
h="$(git rev-parse --show-toplevel)/@DIR@hooks/@HOOK@"
[ -f "$h" ] || { echo "@HOOK@: $h が無い（この worktree にはまだ commit-hooks が入っていない）。検査を飛ばす" >&2; exit 0; }
exec sh "$h" "$@"
