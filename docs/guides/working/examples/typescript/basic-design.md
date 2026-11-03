# 基本設計書 — TypeScript フルスタック受発注管理サンプル

| 項目 | 内容 |
|---|---|
| 文書ID | TS-BD-001 |
| 版/日付 | 1.1 / 2026-11-03（1.0 は 2026-11-02。1.0 から：Docker Compose をやめ PostgreSQL 17 を Windows に入れておく・テストの DB の決まり・11 章を夜ごとの Issue の並びに書き直した） |
| 対象 | 回ごとに `issue-driven-example-typescript-r<回>`（新規リポジトリ） |
| 対応要件 | [`requirements.md`](requirements.md) TS-F / TS-BR / TS-AC |
| 共通の前提 | キットの `docs/guides/working/examples/README.md`（以下「共通 §n」） |

## 1. アーキテクチャ

```mermaid
flowchart LR
  U[利用者 PC] --> W[Next.js / React Web]
  W -->|同一オリジンのBFF経由| N[NestJS REST API]
  N --> P[(PostgreSQL)]
  N --> O[構造化ログ]
  CI[GitHub Actions] --> W
  CI --> N
```

- **クライアント**：Next.js App Router、React、TypeScript strict。操作画面はクライアントコンポーネント中心、初期表示や認証境界はサーバー側で制御する。
- **サーバー**：NestJS（API、ユースケース、ドメイン規則、永続化境界）。PrismaでPostgreSQLへアクセス。
- **接続**：Next.js側の同一オリジンBFF（route handlers等）経由でAPIに到達させる。ブラウザからAPIへ認証秘密を直接渡さない。
- **トランザクション**：在庫減算、受注確定、請求発行をDB原子的に処理。PrismaトランザクションとDB制約を併用。
- **配布**：ローカル開発は Windows のサービスの PostgreSQL 17（共通 §2.2）、クライアント・API は各開発プロセス。Docker は使わない。本番公開は MVP 必須ではない。

## 2. ディレクトリ構成

```text
issue-driven-example-typescript/
├── apps/
│   ├── web/                 # Next.js: app/, components/, features/, lib/
│   └── api/                 # NestJS: src/modules/{auth,customers,products,inventory,orders,invoices,audit}
├── packages/
│   └── contracts/           # OpenAPI由来のDTO型またはスキーマ
├── prisma/                  # schema.prisma, migrations, seed
├── tests/
│   ├── fixtures/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── requirements.md
│   ├── basic-design.md
│   └── decisions/
├── scripts/                 # kit導入後の test.mjs / issue-run/
├── .github/workflows/
├── .env.example             # 接続文字列の見本（実の値は .env。コミットしない）
├── package.json
├── package-lock.json
└── CLAUDE.md
```

契約を共有しても、サーバーの業務ロジックをフロントエンドに流出させない。内部importによるAPI層の迂回は禁止。

## 3. レイヤー・責務

| 層 | 責務 | 制約 |
|---|---|---|
| Web UI | 入力支援、状態表示、フォームバリデーション | 金額・権限・在庫の最終判定をしない |
| Web BFF | Cookie/セッション確認、サーバーAPIへの代理要求 | 機密情報のブラウザ公開禁止 |
| Nest Controller | RESTルート、DTO検証、HTTPステータス、認可ガード | DB直接更新禁止 |
| Application Service | 受注確定・取消・請求発行ユースケース、取引境界 | 冪等性と競合判定 |
| Domain | 状態遷移、金額計算、在庫制約 | 外部依存を最小化 |
| Repository | Prismaモデルへの永続化と検索 | DB制約との一貫性 |

## 4. データモデル（論理）

| テーブル | 主な列 | キー・制約 |
|---|---|---|
| `users` | id, login_id, password_hash, role, active, created_at | id PK、login_id UNIQUE |
| `customers` | id, code, name, active, version, timestamps | code UNIQUE |
| `products` | id, code, name, current_price_jpy, active, version | code UNIQUE |
| `stocks` | product_id, quantity, version | product_id PK/FK、quantity>=0 |
| `orders` | id, order_no, customer_id, status, subtotal_jpy, tax_jpy, total_jpy, version, timestamps | order_no UNIQUE、FK |
| `order_items` | id, order_id, line_no, product_id, product_code_snapshot, product_name_snapshot, unit_price_jpy, quantity, line_total_jpy | (order_id,line_no) UNIQUE |
| `invoices` | id, invoice_no, order_id, issued_at, subtotal_jpy, tax_jpy, total_jpy | order_id UNIQUE、invoice_no UNIQUE |
| `inventory_movements` | id, product_id, delta, reason, source_type, source_id, actor_id, created_at | 業務処理ごと追跡可能 |
| `audit_logs` | id, actor_id, action, entity_type, entity_id, metadata_json, occurred_at, request_id | append-only |

- PKはUUID、日時はUTC timestamptz、金額と数量は整数型。集計・計算過程で符号と範囲を確認し、必要な箇所はbigintを用いる。
- `stocks.quantity >= 0` と請求書の`order_id UNIQUE` はアプリ側だけでなくDBでも強制する。
- 監査ログにはパスワード・トークン・決済情報を格納しない。
- `version`で楽観ロックを行い、version不一致時にHTTP 409を返す。

## 5. 状態遷移

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> CONFIRMED: confirm / 在庫を減らす
  DRAFT --> CANCELED: cancel
  CONFIRMED --> CANCELED: cancel / 在庫を戻す
  CONFIRMED --> INVOICED: issue invoice
```

- DRAFTのみ明細変更可能。CONFIRMEDへの遷移時に明細と合計を確定。
- CANCELEDとINVOICEDからの遷移はMVPでは不可。
- confirm/cancel/issueはサーバー側で現在状態を条件に更新し、成功更新件数を検証。リトライ時の二重更新を防ぐ。

## 6. 金額・在庫処理

```text
subtotal = sum(unit_price_jpy * quantity)
tax      = floor(subtotal * 10 / 100)
total    = subtotal + tax
```

- 税計算は明細ごとでなく受注税抜計に対して一度実施。テスト固定値：2350→税235→計2585。
- confirm時は対象商品の在庫行を一貫した順序でロックするか、条件付き在庫減算を使用。数量不足時は全処理ロールバック。
- 注文・在庫移動・監査を同一トランザクションで保存。取消も同様。
- 請求書発行では`invoices.order_id`の一意制約と状態条件を併用し、二重発行を防ぐ。
- PostgreSQLの分離レベル、競合時再試行は専用の並行テストで検証して確定する。

## 7. API基本設計

JSONはcamelCase、日付はISO8601、エラーは `{code,message,details,requestId}`。ページングは`page`/`pageSize`。`If-Match`または明示的`version`をリクエストに含める（実装時に一つに統一）。

| 操作 | メソッド・パス | 権限 | 主な応答 |
|---|---|---|---|
| ログイン | `POST /api/v1/auth/login` | 匿名 | 200/401 |
| ログアウト | `POST /api/v1/auth/logout` | 認証済 | 204 |
| 顧客一覧・登録 | `GET/POST /api/v1/customers` | 全員参照/登録admin | 200/201 |
| 顧客変更 | `PATCH /api/v1/customers/{id}` | admin | 200/409 |
| 商品一覧・登録 | `GET/POST /api/v1/products` | 全員参照/登録admin | 200/201 |
| 在庫調整 | `POST /api/v1/products/{id}/stock-adjustments` | admin | 201/422 |
| 受注一覧・登録 | `GET/POST /api/v1/orders` | 全員参照/作成operator以上 | 200/201 |
| 受注明細変更 | `PATCH /api/v1/orders/{id}` | operator以上 | 200/409 |
| 受注確定 | `POST /api/v1/orders/{id}/confirm` | operator以上 | 200/409/422 |
| 受注取消 | `POST /api/v1/orders/{id}/cancel` | operator以上 | 200/409 |
| 請求発行 | `POST /api/v1/orders/{id}/invoice` | operator以上 | 201/200(既存)/409 |
| 請求一覧/詳細 | `GET /api/v1/invoices[/{id}]` | 全員 | 200/404 |
| 監査ログ | `GET /api/v1/audit-logs` | admin | 200/403 |
| ヘルス | `GET /health/live`, `/health/ready` | システム | 200/503 |

401=未認証、403=権限不足、404=なし、409=版/状態競合、422=業務ルール違反、500=想定外。DB内部エラーは公開しない。

## 8. 画面設計（概要）

| 画面ID | 画面 | 表示・入力 | 検証 |
|---|---|---|---|
| TS-UI-01 | ログイン | ログインID、パスワード、送信 | 空値、失敗理由の抽象化 |
| TS-UI-02 | ダッシュボード | 受注件数、未請求件数、在庫一覧導線 | 集計時点を表示 |
| TS-UI-03 | 顧客 | 一覧、検索、コード、名前、有効フラグ | 重複コード/競合 |
| TS-UI-04 | 商品 | 一覧、検索、コード、品名、単価、在庫 | 単価上限/無効化 |
| TS-UI-05 | 受注 | 明細行の追加削除、合計、確定、取消 | 明細不足、状態に応じボタン制御 |
| TS-UI-06 | 請求 | 発行、請求詳細、印刷向けHTML | 二重押下の防止 |
| TS-UI-07 | 監査 | 日時/操作者/操作のフィルタ | adminのみ |

エラーは入力項目と画面上部の双方に表示。API拒否をUIのみに頼って握り潰さない。

## 9. 認証・セキュリティ

- デモ用ローカルユーザーをシードで作成（初期パスワードは環境変数で設定し、実値をGitに含めない）。強固なパスワードハッシュを使用。
- Webからの認証は同一オリジンBFF経由でSecure/HttpOnly/SameSite Cookieを用いる。状態変更リクエストのCSRF対策を実装する。
- BFF→APIの認証情報はサーバー間のみで保持。roleはサーバーで検証し、UIは表示制御に限る。
- DTO検証、レスポンスの秘密除去、リクエストサイズ/レート制限、セキュリティヘッダーを適用する。

## 10. テスト・CI設計

| テスト階層 | 対象 | 合格基準 |
|---|---|---|
| 単体 | 金額計算、状態遷移、入力検証 | TS-BR全件の境界値確認 |
| API統合 | DBを使う受注確定/取消/請求 | TS-AC-01～09、12 |
| 同時実行 | 同一受注の競合、在庫競合 | 二重減算/請求0件 |
| Web E2E | ログイン→受注→確定→請求→照会 | TS-AC主要シナリオを実画面で確認 |
| セキュリティ | 未ログイン、viewer、CSRF | 401/403、書込なし |
| 再現性 | DB初期化→seed→testを2連続 | TS-AC-10 |

- 推奨：Vitest（単体/API）、Playwright（E2E）、PostgreSQLテストDB。
- CIステップ：install→format/lint→tsc→unit→integration→web build→e2e→結果集約。
- kitの`node scripts/test.mjs`が確実に終了コードと`Result: PASS/FAIL`を返す契約を保持。テスト未検出はFAIL。
- DB は Windows のサービスの PostgreSQL 17 の `salesflow_ts_test`（共通 §2.2）。テストの入口が毎回スキーマを作り直してシードを入れる（`prisma migrate reset --force`）。DB につながらないときは理由を 1 行出して `Result: FAIL`。確認コマンドの中で DB を起動しない。
- CI は GitHub Actions の `services: postgres`（`postgres:17`）。

## 11. issue-driven-kit組込み・Issue の並び

### 11.1 組込み

1. キットの Node 版の `editions/node/install.mjs` を `--dry-run` で確かめてから入れる。入れたコミットを先に確定し、版を `.issue-kit/version` に残す。
2. 仕様・テスト・見本の変更は、実装の Issue と別の Issue（またはコミット）で先に固め、実装の Issue では守るファイルにする（共通 §4.2）。
3. 対象の Issue に `claude-run` を付ける。閉じるのは人。結果はアプリの `docs/reports/` に残る。
4. 夜は `node scripts/issue-run/issue-run.mjs --round-minutes 60 --max-rounds 2`（共通 §4.3）。

### 11.2 Issue の並び（回1の初版）

番号（T01…）は作る順で、そのまま実行の順になる。**その夜の分は前の日の昼に作る**（朝に作る手直しの Issue が先に回るように。共通 §4.2）。行数は本体とテスト、分は 1 回で合格したときの見込み。

**認証の分け方**：権限の枠（ロールの判定と、だれが要求したかを取り出す口）を T07 で先に作り、ログインとセッション（T08）は後から差し込む。マスターの API は T07 だけを前提にするので、T08 が落ちても夜2のマスターは進む。

| 時 | 番号 | Issue | 前提 | 行数 | 分 |
|---|---|---|---|---|---|
| 1日目 昼 | C1 | 初期化（monorepo・TypeScript strict・ESLint・`package.json` の `issueKit`）・PostgreSQL の DB とユーザー・`.env.example` | — | 会話 | — |
| 1日目 昼 | C2 | キットを入れる・点検・ラベル・Windows の設定（共通 §2.1）・DB につながることを手で確かめる | C1 | 会話 | — |
| 夜1 | T01 | テストの入口：vitest の projects（web・api）・型チェック・0 件 FAIL・わざと落とす・DB につながらないときの FAIL | — | 600 | 45 |
| 夜1 | T02 | DB のスキーマ（9 表・制約・`stocks.quantity >= 0`・請求の一意） | T01 | 450 | 40 |
| 夜1 | T03 | シード・テスト用のデータ・試験用の DB の作り直し（TS-AC-10 の土台） | T02 | 450 | 40 |
| 夜1 | T04 | 共通：エラーの形 `{code,message,details,requestId}`・追跡 ID・JSON のログ | T01 | 450 | 35 |
| 夜1 | T05 | 共通：ヘルスチェック（live・ready）・ページング | T04 | 450 | 35 |
| 夜1 | T06 | ドメイン：金額の計算・状態の遷移（DB を使わない。TS-BR-01〜04） | T01 | 450 | 30 |
| 夜1 | T07 | 権限の枠：ロールのガード・要求者を取り出す口・401 と 403（TS-BR-10） | T04 | 500 | 40 |
| 夜1 | T08 | 認証：ログイン・ログアウト・セッション・パスワードのハッシュ（TS-AC-11） | T03, T07 | 600 | 45 |
| 夜1 | T09 | BFF（同じオリジン・Cookie・CSRF）・ログイン画面 | T08 | 600 | 45 |
| 夜2 | T10 | 顧客の API（作成・一覧・検索・変更・無効化・版の競合） | T03, T07 | 550 | 40 |
| 夜2 | T11 | 顧客の画面 | T09, T10 | 550 | 45 |
| 夜2 | T12 | 商品の API | T03, T07 | 600 | 40 |
| 夜2 | T13 | 商品の画面・在庫の表示 | T09, T12 | 600 | 45 |
| 夜2 | T14 | 在庫の調整の API・在庫の動き・監査ログを書く | T12 | 450 | 40 |
| 夜2 | T15 | 在庫の調整の画面 | T13, T14 | 350 | 30 |
| 夜2 | T16 | 受注の下書きの API（明細・合計・TS-AC-01） | T06, T10, T12 | 550 | 45 |
| 夜2 | T17 | 受注の下書きの画面（明細の編集） | T11, T13, T16 | 550 | 50 |
| 夜3 | T18 | 受注の確定（在庫を減らす・1 つのトランザクション・TS-AC-02・03） | T14, T16 | 450 | 45 |
| 夜3 | T19 | 受注の取消（在庫を戻す・二重に戻さない・TS-AC-04） | T18 | 450 | 40 |
| 夜3 | T20 | 同時更新の 409・並行テスト・確定と取消のボタン（TS-AC-08） | T17, T19 | 500 | 50 |
| 夜3 | T21 | 請求書の発行の API（二重発行の防止・金額の固定・TS-AC-05・06・09） | T18 | 550 | 45 |
| 夜3 | T22 | 請求書の照会・印刷向けの HTML の画面 | T17, T21 | 550 | 45 |
| 夜3 | T23 | 監査ログの照会（API と画面） | T09, T14 | 500 | 40 |
| 夜3 | T24 | ダッシュボード | T09, T18 | 500 | 40 |
| 夜4 | T25 | E2E：ログイン → 受注 → 確定 → 請求 → 照会 | T20, T22 | 450 | 50 |
| 夜4 | T26 | E2E：権限・ログアウト後・2 回続けて同じ結果（TS-AC-07・10・11） | T25 | 450 | 45 |
| 夜4 | T27 | 性能：固定データ（顧客 1 千・商品 1 千・受注 1 万）で一覧の p95 を測る | T03, T16 | 400 | 40 |
| 夜4 | T28 | README・運用の文書（PostgreSQL を入れる・起動・初期化・復旧） | T26 | 400 | 30 |
| 5日目 昼 | — | 完成の判定（要件 §9。README のとおりに人が再現する） | 全部 | — | — |

夜1の鎖はいちばん長くて T01→T02→T03→T08→T09 の 5 段。夜2以降の前の夜の分は済んでいる前提で、夜の中の鎖は 3 段まで。手直しの Issue（約 4 件）は、その朝に作り、その夜の最初に回る。

## 12. トレーサビリティと未決事項

- TS-F-03/04→TS-UI-03/04→マスタAPI→TS-AC-09/12。
- TS-F-06/07/08→TS-UI-05→受注API→TS-AC-01～04/08。
- TS-F-09→TS-UI-06→請求API→TS-AC-05/06。
- TS-F-01/02→TS-UI-01→認証/権限→TS-AC-07/11。
- 導入時にNext.js/NestJS/Prismaの対応済みバージョンを検証しlock固定。
- APIスキーマ生成方式、認証ライブラリ、CIのE2Eブラウザ実行基盤は初期IssueでADRとして確定。
