---
name: document-authoring
description: Use when writing or revising a technical document (spec, design, guide, reference, report, README) in Markdown. Triggers on "ドキュメント書いて", "仕様書作成", "設計書書いて", "ガイド作成", "手順書", "READMEを書いて", "文書を直して".
---

# 文書作成 Skill

技術の文書を決まった形で書き、`check.sh` で検査してから出す。この SKILL は手順だけを書く。決まりの中身は下の 1 つを指すだけ。

- **書き方・形・検査の正:** このフォルダの `rules.md`
- **ひな形:** このフォルダの `templates/`（`design.md`・`guide.md`・`report.md`）
- **置き場:** 取り込み先の `CLAUDE.md` の「置き場」（無ければ `rules.md` の「置き場」）

## 手順

1. 何の文書か（`type`）と、読む人を決める。決まらなければユーザーに聞く
2. `rules.md` を読み、種類に合うひな形を `templates/` から選ぶ
3. 書く。触れたファイル・コマンドは、実際にあること・動くことを確かめてから書く
4. 検査する

   ```sh
   sh .claude/skills/document-authoring/check.sh <書いたファイル>
   ```

5. `DOC-CHECK FAIL` なら、表示された項目と行を直して 4 へ。`WARN D7` は、数・条件に置き換えられるなら置き換える
6. `rules.md` の「機械で見られないもの」を自分で見る
7. 報告に、書いたファイルと `check.sh` の最後の行を書く

<!-- 取り込み先が .claude/skills/document-authoring 以外なら、4 のパスを直す -->
<!-- ここから下に、この repo だけの決まりを書く（rules.md と重ねて書かない） -->
