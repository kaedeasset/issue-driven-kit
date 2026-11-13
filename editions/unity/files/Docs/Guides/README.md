# Docs/Guides — 用途別の分類

**直下に README 以外の文書を置かない。** 読む場面と使い方で分ける（元の Unreal Engine のプロジェクトと同じ分け方）。

| 置き場 | 何を置くか | いつ読むか |
|---|---|---|
| [`Working/`](Working/) | 仕組み・方式・運用の**正** | **関連作業のとき。実装を変えたら対応箇所を更新する** |
| [`Procedures/`](Procedures/) | 実行順・コマンド・結果の読み方 | 作業を再現するとき |
| [`Manuals/`](Manuals/) | 使う人に渡す説明書 | 使うとき |
| [`Decisions/`](Decisions/) | 方針・決定の**正** | 決めるとき・変わったとき |
| [`Reading/`](Reading/) | 読み物・参考 | 学ぶとき（**作業中には引かない**） |

## 足すとき

「実装を変えたら、この文書も直すか」で決まる。

```text
直す           → Working/     （直さないなら、それは正ではない）
使う人に渡す   → Manuals/
順番に実行する → Procedures/
決定そのもの   → Decisions/
一度読めば済む → Reading/
```

`Working/` に足したら **CLAUDE.md の入口の表にも1行足す**。入口に無い文書は読まれない。
その時点の記録（更新しない）は `Docs/Reports/YYYY/MM/DD/`（`save-report` スキル）。
人が書く入力の文書（例: アセットの一覧の CSV）は `Docs/InSpecs/YYYY/MM/` だけに置く。Claude はそこを読むだけで書き換えず、ここ（`Docs/Guides/`）と `Docs/Reports/` の文書を書く。
