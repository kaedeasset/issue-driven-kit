# conf.sh — 設定を 3 段で読む（commit-msg・pre-commit が . で読む）。上の段ほど優先:
#   1. repo の直下の commit-hooks.conf（その repo だけの違い。profile= が要る）
#   2. profiles/<profile>/profile.conf（フレームワーク別）
#   3. profiles/common.conf（全部に共通。名前は全部ここにある）
# conf <名前> で値を出す。ファイル・profile・名前が無ければ理由を出して 1 を返す（呼ぶ側がフックごと止める）。
ch_root=$(cd "$(dirname "$0")/.." && pwd)
repo_conf="$(git rev-parse --show-toplevel)/commit-hooks.conf"
if [ ! -f "$repo_conf" ]; then
    echo "COMMIT-HOOKS FAIL conf $repo_conf が無い。install.sh <profile> を回すと作られる（作ったらコミットする）" >&2
    exit 1
fi
# conf_in <ファイル> <名前> — そのファイルに名前があれば値を出して 0、無ければ 1
conf_in() {
    awk -v k="$2" '
    { sub(/\r$/, "") }
    /^[ \t]*#/ || /^[ \t]*$/ { next }
    { i = index($0, "="); if (i && substr($0, 1, i - 1) == k) { v = substr($0, i + 1); found = 1 } }
    END { if (!found) exit 1; print v }' "$1"
}
ch_profile=$(conf_in "$repo_conf" profile)
if [ -z "$ch_profile" ] || [ ! -f "$ch_root/profiles/$ch_profile/profile.conf" ]; then
    echo "COMMIT-HOOKS FAIL conf $repo_conf の profile=$ch_profile が無いか違う（$(ls "$ch_root/profiles" | grep -v '\.conf$' | tr '\n' ' ')のどれか）" >&2
    exit 1
fi
conf() {
    conf_in "$repo_conf" "$1" || conf_in "$ch_root/profiles/$ch_profile/profile.conf" "$1" || conf_in "$ch_root/profiles/common.conf" "$1" || {
        echo "COMMIT-HOOKS FAIL conf 設定 $1= がどの段にも無い（profiles/common.conf に足す）" >&2
        return 1
    }
}
