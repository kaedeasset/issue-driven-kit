# 基本設計書 — Java契約・月次請求管理サンプル

| 項目 | 内容 |
|---|---|
| 文書ID | JAVA-BD-001 |
| 段 | **上流**（受注の後に人が書き、受注先と合意した文書という想定。共通 §1.2）。生成 AI 駆動の段（詳細設計・実装・テスト）の入力で、その段の中では変えない |
| 版 / 日付 | 1.1 / 2026-11-03（1.0 は 2026-11-02。1.0 から：Docker Compose と Testcontainers をやめ PostgreSQL 17 を Windows に入れておく・Java 版のキットを作らず Node 版を広げて当てる（8 章）・1.1 に使う技術と版を足した・8 章に詳細設計の単位と決めた方式を書き、Issue の並びは案件のリポジトリで作る形にした） |
| 対象リポジトリ | 回ごとに `issue-driven-example-java-r<回>`（新規作成） |
| 対応要件 | [`requirements.md`](requirements.md) JAVA-F / JAVA-BR / JAVA-AC |
| 共通の前提 | キットの `docs/guides/working/examples/README.md`（以下「共通 §n」） |

## 1. システムアーキテクチャ

```mermaid
flowchart LR
  B[PCブラウザ HTML/CSS/JS] -->|HTTPS フォーム/HTML| MVC[Spring MVC + Thymeleaf]
  MVC --> SEC[Spring Security]
  MVC --> APP[Application Services]
  BATCH[管理UIまたはCLIバッチ起動] --> APP
  APP --> DOMAIN[契約・請求 Domain]
  DOMAIN --> REPO[Spring Data JPA]
  REPO --> DB[(PostgreSQL)]
  APP --> RUN[請求バッチ履歴]
```

- **クライアント**：ブラウザ。HTMLはSpring MVC + Thymeleafでサーバー生成。JavaScriptは確認ダイアログ、入力補助、プレビュー結果の表示に限定。
- **サーバー**：Java 25、Spring Boot 4、Spring MVC、Thymeleaf、Spring Security、Spring Data JPA。単一デプロイ単位のモジュラーモノリス。
- **DB**：PostgreSQL、Flywayマイグレーション。認証、請求、実績、入金、ジョブ履歴を管理。
- **バッチ**：Application Serviceから対象月ごとの請求作成を開始する。スケジューラ常時運用はMVP対象外。手動実行・再実行の確実性を先に検証。

### 1.1 使う技術と版（詳細設計の前に決めておく）

**2026-11-03 にレジストリ（Maven Central・Adoptium）で確かめた安定版**から選んだ。基本設計で**メジャーとマイナーまで**決める。Spring の部品・Flyway・PostgreSQL の JDBC・JUnit は、**Spring Boot が管理する版**を使い、個別に版を書かない（組み合わせが確かめられている版のため）。パッチは C1 で入れた時点の最新を `pom.xml` と Maven Wrapper に固定し、README に書く。メジャーかマイナーを上げるときは、上流（基本設計）に戻して直す（共通 §1.2）。

| 層 | 使う物 | 版 | 選んだ理由・注意 |
|---|---|---|---|
| 実行環境 | JDK（Eclipse Temurin） | 25（LTS） | いちばん新しい LTS |
| ビルド | Maven・Maven Wrapper | 3.10.x・3.3.x | Windows では `mvnw.cmd` |
| 土台 | Spring Boot | 4.1.x（確かめた時点で 4.1.2） | — |
| 画面・API | Spring MVC・Thymeleaf・Spring Security・Spring Data JPA（Hibernate） | Spring Boot 4.1 が管理する版 | — |
| DB の移行 | Flyway（`flyway-core`・`flyway-database-postgresql`） | Spring Boot 4.1 が管理する版 | — |
| DB の接続 | PostgreSQL JDBC | Spring Boot 4.1 が管理する版 | — |
| DB | PostgreSQL | 17（確かめた時点の最新は 17.11） | Windows のサービス（共通 §2.2）。Flyway などの対応が 18 より長い |
| テスト | JUnit（Jupiter）・AssertJ・Spring の MockMvc | Spring Boot 4.1 が管理する版 | — |
| テスト | Maven Surefire・Failsafe | Spring Boot 4.1 が管理する版 | 単体と統合を分けて回し、結果の XML をキットの P-1 が読む |
| キットの脚本 | Node.js・npm | 22.14.0・11.6.2 | キットと確認コマンドのため（共通 §3.1） |

## 2. プロジェクト/パッケージ構成

```text
issue-driven-example-java/
├── mvnw / mvnw.cmd / .mvn/
├── pom.xml
├── src/main/java/example/billing/
│   ├── BillingApplication.java
│   ├── security/
│   ├── customer/                     # MVC, service, entity, repository
│   ├── plan/
│   ├── contract/
│   ├── usage/
│   ├── invoice/
│   ├── payment/
│   ├── batch/
│   ├── audit/
│   └── common/                       # error, money, time, transaction
├── src/main/resources/
│   ├── templates/                     # Thymeleaf: login, dashboard, customers...
│   ├── static/                        # css/js
│   ├── db/migration/                  # Flyway
│   └── application.yml
├── src/test/java/example/billing/     # JUnit 5, MockMvc, integration
├── src/test/resources/fixtures/
├── docs/inspecs/<年>/<月>/requirements.md   # 上流から受け取る（人の文書。Claude は書き換えない）
├── docs/inspecs/<年>/<月>/basic-design.md   # 同じ
├── docs/guides/working/               # detailed-design/（詳細設計）・issue-plan.md（Issue の並び）
├── scripts/                            # キットの Node 版（test.mjs・issue-run/）
├── .issue-kit/config.json              # キットのテストの入口の設定（回すコマンドと結果の XML の場所）。package.json は置かない
├── .env.example                        # 接続文字列の見本（実の値はユーザーの環境変数か .env）
└── .github/workflows/
```

パッケージは業務機能ごとの縦割りとし、MVCコントローラーからRepositoryへ直接書き込まず、Application Serviceでユースケース・トランザクションを統制する。

## 3. データ設計

### 3.1 論理データモデル

| テーブル | 主要列 | キー/制約 |
|---|---|---|
| `users` | id, login_id, password_hash, role, active | login_id UNIQUE |
| `customers` | id, customer_code, name, active, version | customer_code UNIQUE |
| `plans` | id, plan_code, name, active | plan_code UNIQUE |
| `plan_rates` | id, plan_id, effective_month, base_fee_jpy, usage_unit_jpy | (plan_id,effective_month) UNIQUE |
| `contracts` | id, contract_no, customer_id, plan_id, start_month, end_month, version | contract_no UNIQUE、月の整合性 |
| `usage_records` | id, contract_id, target_month, external_key, quantity, created_at | (contract_id,external_key) UNIQUE |
| `invoices` | id, contract_id, target_month, status, subtotal_jpy, tax_jpy, total_jpy, version, confirmed_at | (contract_id,target_month) UNIQUE |
| `invoice_items` | id, invoice_id, line_no, item_type, description, qty, unit_price_jpy, amount_jpy | (invoice_id,line_no) UNIQUE |
| `payments` | id, invoice_id, reference_no, amount_jpy, paid_at, actor_id | (invoice_id,reference_no) UNIQUE |
| `billing_runs` | id, target_month, request_id, status, started_at, ended_at, scanned, created, skipped, failed, error_summary | request_id UNIQUE |
| `audit_logs` | id, actor_id, action, entity_type, entity_id, old_new_summary, occurred_at, request_id | append-only |

- idはUUID（実装ではDB互換とJPAマッピングを確認）、月は`YYYY-MM`を意味する`YearMonth`として扱い、DB上は月初`date`か`char(7)`のどちらかへ統一する。**推奨は月初DATE**。
- `plan_rates`は発効月で管理し、対象月以下の最大発効月を採用する。過去の料金レコードは更新禁止（新レコード追加のみ）。
- 請求作成時に料金・対象月・利用数量を`invoice_items`へスナップショット化する。確定後は不変。
- 金額は`long`（円）。乗算時は`Math.multiplyExact`、加算は`Math.addExact`でオーバーフローを検出。
- 確定済み請求の後からの料金変更で過去請求を書換えない。

### 3.2 データ例（固定fixture）

| 対象 | 値 |
|---|---|
| 顧客 | C001 架空企業A |
| 契約 | S001、2026-01開始、終了なし、プランBASIC |
| 料金 | BASIC：基本1000円/月、従量150円/単位 |
| 利用実績 | 2026-10、3単位、external_key=`usage-S001-202610-001` |
| 請求プレビュー | 税抜1450円、税145円、税込1595円 |

### 3.3 状態定義

```mermaid
stateDiagram-v2
  [*] --> DRAFT
  DRAFT --> CONFIRMED: 経理が確定
  CONFIRMED --> PARTIAL: 一部入金
  CONFIRMED --> PAID: 全額入金
  PARTIAL --> PAID: 残額入金
```

- `DRAFT/CONFIRMED/PARTIAL/PAID`は画面で見せる**請求の状態**。実装では`invoice_status(DRAFT/CONFIRMED)`と`payment_status(UNPAID/PARTIAL/PAID)`を別列/導出値として管理してもよいが、テスト上は上図と同じ振る舞いとする。
- 料金変更後の再計算はDRAFTのみ。確定後の訂正はMVP対象外。
- 契約の請求対象は開始月～終了月（両端含む）で決定。`PAUSED`等の複雑な状態はMVPで使わない。

## 4. 課金計算・バッチ基本設計

### 4.1 計算式

```text
planRate = latest rate with effectiveMonth <= targetMonth
usageQty = sum(usage.quantity for contract and targetMonth)
subtotal = planRate.baseFeeJpy + planRate.usageUnitJpy * usageQty
tax      = floor(subtotal * 10 / 100)
total    = subtotal + tax
```

- 料金単価・基本料金はいずれも非負。0利用でも基本料金を請求する。
- 税率は業務デモ用10%固定で、請求単位に切捨て。税務上の一般解ではない。
- `YearMonth`で対象月を厳密に決め、TZ変更で対象月がずれないようにする。
- 上記の算術オーバーフロー時は対象レコードを失敗扱いとして履歴に記録。

### 4.2 月次請求の処理フロー

```mermaid
flowchart TD
  A[対象月の指定] --> B[請求対象契約の検索]
  B --> C{契約/月の請求がある?}
  C -->|ある| SKIP[既存を保持・SKIPPED]
  C -->|ない| D[料金/実績を読取]
  D --> E[請求明細と合計を計算]
  E --> F[契約/月の一意制約でINSERT]
  F -->|成功| G[DRAFT請求生成・監査記録]
  F -->|競合| SKIP
  G --> NEXT[次の契約へ]
  SKIP --> NEXT
  NEXT --> DONE[件数を集約して履歴確定]
```

#### トランザクション方針

- 請求を**契約単位の短いDBトランザクション**で作成。1件の処理失敗で他の契約を長時間ロックしない。
- 完了済み請求は再実行でSKIPPED。`UNIQUE(contract_id,target_month)`と条件付きINSERT/競合ハンドリングを併用。
- ジョブ全体の`billing_runs`にSUCCESS/PARTIAL_FAILED/FAILEDと処理件数を記録。部分失敗があればリトライで未作成契約のみ補完可能。
- 同一月のバッチ同時起動は**実行単位の排他制御**を設ける（PostgreSQL の advisory lock。8.3 A1）。仮に重複起動しても一意制約によって二重請求を防ぐ。
- 失敗注入テスト：対象契約の一部で例外を起こし、再実行後に1件/契約/月となることを確認。
- 利用実績と料金変更が請求作成中に発生する場合は、請求対象月の実績締めを明示する。MVPでは**プレビューと本実行の間に実績を変更し得る**ため、実行時点の再計算を正とし、プレビュー結果との差分は明示する。
- DRAFT請求の再計算は経理が明示的に要求した場合のみ実行し、利用実績が変わっても自動更新しない。プレビューで最新値と既存DRAFTの差を示す。

### 4.3 入金処理

1. 経理担当が確定済み請求を開き、入金日・金額・参照番号を送信。
2. サーバーは権限・状態・正の金額・参照番号一意・未収額を検証。
3. 該当請求の更新をロックして累計入金を計算。超過入金は禁止。
4. paymentsとaudit_logsを一トランザクションで保存。入金参照番号の再送は重複レコードにしない。
5. 未収額が正ならPARTIAL、0ならPAIDと画面で表現。

## 5. MVC画面・URL設計

| メソッド・パス | 画面/処理 | 権限 |
|---|---|---|
| GET `/login` / POST `/login` | ログイン画面/認証（Spring Security） | 匿名 |
| GET `/dashboard` | ダッシュボード | 認証済 |
| GET/POST `/customers` | 顧客一覧/登録 | 全員表示、登録admin/sales |
| GET/POST `/plans` | プラン一覧/登録 | 全員表示、変更admin/sales |
| GET/POST `/contracts` | 契約一覧/登録 | 全員表示、登録admin/sales |
| GET/POST `/usage-records` | 利用実績一覧/登録 | 全員表示、登録admin/sales |
| GET `/billing/preview?month=YYYY-MM` | 請求プレビュー | admin/accounting |
| POST `/billing/runs` | 月次請求バッチ起動 | admin/accounting |
| GET `/billing/runs/{id}` | バッチ履歴詳細 | admin/accounting |
| GET `/invoices` / GET `/invoices/{id}` | 請求一覧/明細 | 全員 |
| POST `/invoices/{id}/confirm` | 請求確定 | admin/accounting |
| POST `/invoices/{id}/payments` | 入金登録 | admin/accounting |
| GET `/audit-logs` | 監査ログ | admin/accounting |
| GET `/actuator/health` | ヘルス | システム |

- HTML formはPOST-Redirect-GETを基本とし、二重送信時の防止策とCSRF tokenを含める。
- `400`バリデーション、`403`権限不足、`404`対象なし、`409`競合、`422`業務エラーを画面用メッセージへ変換。HTMLのエスケープを有効化。
- 経理操作には明示的な確認画面と結果メッセージを提供。

## 6. 認証・認可・監査

- Spring Securityのform login/セッション認証。パスワードを安全なハッシュで保存。セッションはHttpOnly/Secure/SameSite Cookieを適切に設定し、CSRFトークンを使用。
- Controller側の画面制御に加えService/メソッドレベルで権限を強制する。
- 実在ユーザー情報、パスワード、Cookie、DB秘密、Stack Trace全文を画面/ログに表示しない。
- 重要イベント：料金変更、契約登録/終了、実績登録、バッチ、請求確定、入金登録。監査は対象ID、時刻、actor、イベントを保持。
- マイグレーションとシードは別権限・別手順で実行。DBの本番認証情報をGitに置かない。

## 7. テスト設計

| 層 | 技術・方式 | 重点条件 |
|---|---|---|
| 単体 | JUnit 5 + AssertJ等 | JAVA-BR-01～11、金額/年月の境界値 |
| MVC | Spring MockMvc | ログイン/CSRF/role/画面遷移、JAVA-AC-12/16 |
| 統合 | Windows のサービスの PostgreSQL 17 の `billing_java_test`（共通 §2.2） | unique、lock、請求・入金トランザクション |
| バッチ | 固定seed、並列実行、失敗注入 | JAVA-AC-02～05/14 |
| 通し | MockMvc のシナリオの試験（8.3 A5。ブラウザの E2E は MVP では入れない） | 契約→実績→月次請求→確定→入金 |
| 再現 | `./mvnw verify`、seedリセット | JAVA-AC-15 |

- H2だけの試験ではPostgreSQLの排他・一意制約・トランザクション特性を証明しない。結合テストはPostgreSQLで回す。
- 試験の入口が毎回 Flyway で `billing_java_test` を作り直してシードを入れる（`clean` は試験の DB だけに許す）。DB につながらないときは理由を 1 行出して `Result: FAIL`。Testcontainers（Docker）は使わない。
- Maven Surefire/Failsafeを用い単体と結合を明示的に実行。0件テストを成功として扱わない契約を検証する。
- CI例：JDK25→Maven依存解決→静的解析→unit→DBマイグレーション→integration→batch並列→package→レポート保管。

## 8. issue-driven-kit の当て方・詳細設計の単位

### 8.1 当て方（Java 版のキットは作らない）

1.0 では Java 版のキット（KIT-JAVA-01〜05）を新しく作る案だった。1.1 では、**キットの Node 版を入れ、テストの入口を広げて当てる**（共通 §3）。先に済ませるキットの準備は .NET と同じ P-1・P-2・P-6（計画 4 章）で、Java の分は次のとおり。

| # | Java で要ること |
|---|---|
| P-1 | テストの入口が `mvnw.cmd verify` を回し、`target/surefire-reports/` と `target/failsafe-reports/` の XML を読んで `Result:` 行を出す。0 件は FAIL |
| P-2 | 点検（doctor）が JDK 25 と `mvnw.cmd` を見る |
| P-6 | Node 版の `CLAUDE.md` のひな形と設定を、vitest など Node の前提から外す |

- 確認コマンドは ```` ```js ````（Node.js で `mvnw.cmd` を呼ぶ）。テストの入口の設定は `.issue-kit/config.json` に書く（`package.json` は置かない。キットの準備 P-6）。
- 判定に使うテストと見本（`src/test/resources/fixtures/`）は、実装の Issue より前に別の Issue で固め、実装の Issue では守るファイルにする（共通 §4.2）。

### 8.2 詳細設計の単位

Issue の並び（夜ごとの表）はこの文書に書かない。案件のリポジトリで、要件定義書とこの文書から Claude Code が作る（共通 §4.4）。

この基本設計だけで実装の Issue が書ける部分（テストの入口・スキーマ・シード・ドメインの計算）は、詳細設計を作らない。ほかは、下の単位ごとに**夜の「設計書を書く」Issue**（D 番号）で、実装の 1 晩前に詳細設計を書かせ、人が朝に読んで直す（共通 §3.2）。形は共通 §3.3。

| 単位 | 案件のリポジトリでのファイル | 中身（URL・画面） | 受け持つ要件 |
|---|---|---|---|
| DD-01 共通とセキュリティ | `docs/guides/working/detailed-design/dd-01-common-security.md` | エラーの変換と画面の文言・相関 ID・ログ・ヘルス・フォームのログイン・CSRF・ロールごとの認可（5.2 の表）・共通のレイアウト | JAVA-F-01・02、JAVA-AC-12・16 |
| DD-02 顧客・料金プラン・契約 | `docs/guides/working/detailed-design/dd-02-masters-contracts.md` | 顧客・プラン・発効月の料金・契約の URL と画面と検証 | JAVA-F-03〜05、JAVA-BR-01〜03・11、JAVA-AC-13 |
| DD-03 利用実績と請求のプレビュー | `docs/guides/working/detailed-design/dd-03-usage-preview.md` | 利用実績の登録と重複の排除・請求の対象の判定・プレビューの計算と画面 | JAVA-F-06・07、JAVA-BR-04・05、JAVA-AC-01・05 |
| DD-04 月次のバッチ | `docs/guides/working/detailed-design/dd-04-batch.md` | バッチの起動・契約ごとのトランザクション・排他・失敗の注入・`billing_runs`・実行の画面 | JAVA-F-08、JAVA-BR-06、JAVA-AC-02〜04・14 |
| DD-05 請求の確定と入金 | `docs/guides/working/detailed-design/dd-05-invoice-payment.md` | 確定・確定後の不変・競合・入金・未収額・照会の画面 | JAVA-F-09〜11、JAVA-BR-07〜10、JAVA-AC-06〜11 |
| DD-06 監査・運用・性能 | `docs/guides/working/detailed-design/dd-06-audit-ops.md` | 監査ログと画面・バッチの履歴・ダッシュボードの数字・シナリオの試験・性能の測り方・README の目次 | JAVA-F-12〜14、JAVA-AC-15、§8 の性能 |

### 8.3 決めた方式（詳細設計の前に決めておく）

1.1 の「使う技術と版」と一緒に、基本設計で決めておく（夜の Issue の中で決めさせない。共通 §1.2）。

| # | 決めたこと | 決定 | 選ばなかった案 |
|---|---|---|---|
| A1 | バッチの排他 | PostgreSQL の advisory lock（対象月から鍵を作る）。重なっても一意制約で二重請求を防ぐ | ロックの表 |
| A2 | 月の DB の型 | 月初の `date`（基本設計 3.1 の推奨） | `char(7)` |
| A3 | 同時更新の条件 | JPA の `@Version`（楽観ロック） | 行のロック |
| A4 | DRAFT の再計算 | 経理が明示したときだけ（基本設計 4.2） | 実績が変わったら自動で |
| A5 | 通しの試験 | MockMvc のシナリオの試験（ブラウザの E2E は MVP では入れない） | Playwright |

## 9. 開発・デプロイ・復旧

- ローカル起動：Windows のサービスの PostgreSQL 17（共通 §2.2）に Flyway → seed → `mvnw.cmd spring-boot:run`。Docker は使わない。
- 配布物：Spring Boot実行JAR。HTTPSはリバースプロキシ/実行環境を明記し、認証Cookieの安全な設定を適用。
- DBはバックアップ/復旧手順、migration適用時の失敗手順をREADMEに掲載。
- バッチ障害時：`billing_runs`の状態確認→原因是正→同対象月で再実行。二重作成がないことを試験。
- ジョブ履歴には対象月、開始終了、実行者、件数、失敗サマリ、追跡ID。秘密情報を記録しない。

## 10. 要件との対応・未決事項

- JAVA-F-03～06→customer/plan/contract/usage→JAVA-AC-05/13。
- JAVA-F-07～09→invoice/batch→JAVA-AC-01～07/14。
- JAVA-F-10/11→payment/invoice views→JAVA-AC-08～11。
- JAVA-F-01/02/12/13→security/audit/billing_runs→JAVA-AC-12/16。
- 使う物と版は 1.1、バッチの排他・`YearMonth` の DB の型・同時更新の条件・ドラフトの再計算・通しの試験の形は 8.3 で決めた（夜の Issue の中で決めさせない）。
