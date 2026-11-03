# 基本設計書 — C# Windowsネイティブ販売管理サンプル

| 項目 | 内容 |
|---|---|
| 文書ID | NET-BD-001 |
| 段 | **上流**（受注の後に人が書き、受注先と合意した文書という想定。共通 §1.2）。生成 AI 駆動の段（詳細設計・実装・テスト）の入力で、その段の中では変えない |
| 版 / 日付 | 1.1 / 2026-11-03（1.0 は 2026-11-02。1.0 から：PostgreSQL 17 を Windows に入れておく・.NET 版のキットを作らず Node 版を広げて当てる（8 章）・1.1 に使う技術と版を足した・8 章に詳細設計の単位と決めた方式を書き、Issue の並びは案件のリポジトリで作る形にした） |
| 対象リポジトリ | 回ごとに `issue-driven-example-dotnet-r<回>`（新規作成） |
| 対応要件 | [`requirements.md`](requirements.md) NET-F/NET-BR/NET-AC |
| 共通の前提 | キットの `docs/guides/working/examples/README.md`（以下「共通 §n」） |

## 1. 全体構成

```mermaid
flowchart LR
  User[Windows利用者] --> UI[WinUI 3 .NET 10]
  UI -->|HTTPS REST JSON| API[ASP.NET Core Web API .NET 10]
  API --> DB[(PostgreSQL)]
  API --> LOG[監査ログ/アプリログ]
  UI --> PDF[ローカルPDF表示・印刷]
  CI[Windows CI / テスト] --> UI
  CI --> API
```

- Windowsクライアント：WinUI 3 + Windows App SDK + C# MVVM（CommunityToolkit.Mvvm等）。**Windowsネイティブとして新規構築**。
- APIサーバー：ASP.NET Core Web API、.NET 10、EF Core + Npgsql。Controller（またはEndpoint）→Application→Domain→Infrastructure。
- ファイル出力：CSV・PDFの生成対象を明確にする。CSV商品取込はクライアントで一次解析後APIに送信し、サーバーで再検証/一括反映。
- データの正はAPI/DB。クライアントの表示キャッシュは正としない。

### 1.1 使う技術と版（詳細設計の前に決めておく）

**2026-11-03 にレジストリ（NuGet・.NET のリリースの一覧）で確かめた安定版**から選んだ。基本設計で**メジャーとマイナーまで**決める。パッチは C1 で入れた時点の最新を `packages.lock.json` と `global.json` に固定し、README に書く。メジャーかマイナーを上げるときは、上流（基本設計）に戻して直す（共通 §1.2）。

| 層 | 使う物 | 版 | 選んだ理由・注意 |
|---|---|---|---|
| 実行環境 | .NET SDK | 10.0（LTS。確かめた時点の SDK は 10.0.403） | 11.0 は rc で、サポートも短い（STS） |
| 画面 | WinUI 3・Windows App SDK（`Microsoft.WindowsAppSDK`） | 2.6.x | — |
| 画面 | `CommunityToolkit.Mvvm` | 8.4.x | MVVM |
| 画面 | 表の部品 | WinUI 3 の標準の `ListView` | A1 |
| API | ASP.NET Core・組み込みの OpenAPI（`Microsoft.AspNetCore.OpenApi`） | 10.0.x | .NET 10 と同じ版 |
| API | `Microsoft.AspNetCore.Authentication.JwtBearer` | 10.0.x | A4 |
| ORM | Entity Framework Core・`Npgsql.EntityFrameworkCore.PostgreSQL` | 10.0.x・10.0.x | — |
| 帳票 | `PDFsharp-MigraDoc` | 6.5.x | A2 |
| CSV | `CsvHelper` | 34.0.x | A6 |
| DB | PostgreSQL | 17（確かめた時点の最新は 17.11） | Windows のサービス（共通 §2.2） |
| テスト | xUnit v3（`xunit.v3`） | 4.0.x | 単体と ViewModel |
| テスト | `Microsoft.AspNetCore.Mvc.Testing` | 10.0.x | API の統合 |
| テスト | `JunitXml.TestLogger` | 8.1.x | `dotnet test` の結果を JUnit の XML にする（キットの P-1 が読む） |
| テスト | FlaUI（`FlaUI.UIA3`） | 5.0.x | 画面のスモーク（A3） |
| キットの脚本 | Node.js・npm | 22.14.0・11.6.2 | キットと確認コマンドのため（共通 §3.1） |

## 2. ソリューション構成

```text
issue-driven-example-dotnet/
├── SalesFlow.slnx
├── src/
│   ├── SalesFlow.Desktop/              # WinUI 3 / Views, ViewModels, Services
│   ├── SalesFlow.Contracts/            # API DTO / enum / schema（UI,API間はJSON契約）
│   ├── SalesFlow.Api/                  # ASP.NET Core / endpoint, auth
│   ├── SalesFlow.Application/          # 用途別service, interfaces
│   ├── SalesFlow.Domain/               # Entity, rule, money, state
│   └── SalesFlow.Infrastructure/       # EF Core, repositories, logging
├── tests/
│   ├── SalesFlow.Domain.Tests/
│   ├── SalesFlow.Api.IntegrationTests/
│   ├── SalesFlow.Desktop.ViewModel.Tests/
│   └── SalesFlow.Desktop.UiSmoke/      # Windows対話実行環境で実行
├── database/seed/
├── docs/inspecs/<年>/<月>/requirements.md   # 上流から受け取る（人の文書。Claude は書き換えない）
├── docs/inspecs/<年>/<月>/basic-design.md   # 同じ
├── docs/guides/working/               # detailed-design/（詳細設計）・issue-plan.md（Issue の並び）
├── scripts/                            # キットの Node 版（test.mjs・issue-run/）
├── .github/workflows/
├── package.json                        # 依存なし。キットの issueKit の欄だけ
├── .env.example                        # 接続文字列の見本（実の値はユーザーの環境変数か .env）
├── README.md
└── CLAUDE.md
```

依存方向：Desktop→Contracts、Api→Application→Domain、Infrastructure→Application/Domain（DIで注入）。DesktopからInfrastructure/EF Coreへ直接参照しない。

## 3. データ・APIモデル

### 3.1 DB論理テーブル

| テーブル | 主なフィールド | 制約 |
|---|---|---|
| users | id, login_id, password_hash, role, active | login_id UNIQUE |
| refresh_tokens | id, user_id, token_hash, expires_at, revoked_at | 平文トークン保存禁止 |
| customers | id, code, name, active, version | code UNIQUE |
| products | id, code, name, unit_price_jpy, active, version | code UNIQUE |
| stocks | product_id, quantity, version | quantity >= 0 |
| orders | id, order_no, customer_id, status, subtotal_jpy, tax_jpy, total_jpy, version | order_no UNIQUE |
| order_items | id, order_id, line_no, product_id, code/name_snapshot, unit_price_jpy, quantity, amount_jpy | (order_id,line_no) UNIQUE |
| invoices | id, order_id, invoice_no, issued_at, subtotal_jpy, tax_jpy, total_jpy | order_id UNIQUE, invoice_no UNIQUE |
| invoice_items | id, invoice_id, line_no, label, qty, unit_price_jpy, amount_jpy | (invoice_id,line_no) UNIQUE |
| stock_movements | id, product_id, delta, reason, order_id?, actor_id, occurred_at | 監査追跡 |
| audit_logs | id, entity_type, entity_id, action, actor_id, occurred_at, request_id, data_json | append-only |

- PKはUUID、日時はUTC、金額はlong（円）。DTOの金額も整数値、JSONでdecimalの丸め混入を避ける。
- EF Core migrationをSQLレビュー可能な形でコミット。DB制約をアプリ側検証と二重化する。

### 3.2 HTTP API

| メソッド | パス | 用途 | 主要要件 |
|---|---|---|---|
| POST | `/api/v1/auth/login` | サインイン | NET-F-01 |
| POST | `/api/v1/auth/refresh` | トークン更新 | NET-F-01 |
| POST | `/api/v1/auth/logout` | サインアウト/失効 | NET-F-01 |
| GET/POST | `/api/v1/customers` | 顧客照会/登録 | NET-F-03 |
| PATCH | `/api/v1/customers/{id}` | 顧客変更 | NET-F-03 |
| GET/POST | `/api/v1/products` | 商品照会/登録 | NET-F-04 |
| PATCH | `/api/v1/products/{id}` | 商品変更 | NET-F-04 |
| POST | `/api/v1/products/{id}/stock-adjustments` | 在庫調整 | NET-F-05 |
| GET/POST | `/api/v1/orders` | 受注照会/新規 | NET-F-06 |
| PATCH | `/api/v1/orders/{id}` | 受注下書き編集 | NET-F-06 |
| POST | `/api/v1/orders/{id}/confirm` | 確定 | NET-F-07 |
| POST | `/api/v1/orders/{id}/cancel` | 取消 | NET-F-07 |
| POST | `/api/v1/orders/{id}/invoice` | 請求発行 | NET-F-08 |
| GET | `/api/v1/invoices/{id}` | 請求照会 | NET-F-08 |
| GET | `/api/v1/invoices/{id}/pdf` | 帳票PDFのダウンロード | NET-F-09 |
| POST | `/api/v1/products/import-preview` | CSV検証/プレビュー | NET-F-10 |
| POST | `/api/v1/products/import-commit` | CSV確定 | NET-F-10 |
| GET | `/api/v1/orders/export.csv` | 受注一覧CSV | NET-F-10 |
| GET | `/api/v1/audit-logs` | 監査ログ | NET-F-12 |
| GET | `/health/ready` | 稼働確認 | NET-F-14 |

- JSONはcamelCase、日時ISO8601、`{code,message,details,requestId}`を共通エラー形式とする。
- APIで400（形式不正）、401、403、404、409（状態・版競合）、422（業務ルール違反）、500を区別。
- APIスキーマはOpenAPIで公開・バージョン管理。DTO/クライアント型の差分検出テストを設ける。

## 4. Windowsクライアント基本設計

### 4.1 画面構成とUI状態

| 画面 | ViewModel | 主要状態・操作 |
|---|---|---|
| LoginPage | LoginViewModel | 認証中、入力エラー、失敗、画面遷移 |
| ShellPage | ShellViewModel | ナビゲーション、ユーザー表示、接続状態 |
| CustomersPage | CustomersViewModel | 検索、選択、ページ、編集、競合 |
| ProductsPage | ProductsViewModel | 商品、在庫、CSV、編集 |
| OrderEditPage | OrderEditViewModel | 明細行、計算プレビュー、保存/確定 |
| OrdersPage | OrdersViewModel | 状態フィルタ、詳細表示、取消 |
| InvoicesPage | InvoicesViewModel | 請求照会、PDF保存、印刷 |
| AuditPage | AuditViewModel | 条件指定、監査履歴 |

- `INotifyPropertyChanged`、非同期Command、入力検証をViewModelに集約し、画面コードビハインドにはビジネスロジックを置かない。
- `HttpClientFactory`相当とtyped API clientでHTTP呼出しを統一し、キャンセルトークン、タイムアウト、リクエストIDを扱う。
- 状態はIdle/Loading/Saving/Success/Error/Conflict。通信中ボタンをdisableし、成功不明の操作は取得APIで結果再確認。
- 主要操作はUI Automation対応のAccessible Nameを定義。100/150/200%DPIでレイアウト崩れを試験。

### 4.2 認証・トークン

- ローカルデモアカウントのID/パスワードをHTTPS送信し、サーバーが短寿命アクセストークンとローテーション可能な更新トークンを発行する（実企業のSSOは対象外）。
- 更新トークンはWindowsの保護されたCredential Locker等に保存し、トークンを平文ファイル・ログ・Gitへ出さない。
- サーバーでは更新トークンのハッシュと失効時刻を保存。logout時に失効。RBACはAPIで強制。
- デモ構成はローカルHTTP許可を当然としない。開発用TLS証明書の信頼手順をREADMEに明記する。

## 5. 業務処理シーケンス

### 5.1 受注確定

```mermaid
sequenceDiagram
  participant W as Windows Client
  participant A as ASP.NET API
  participant D as Domain Service
  participant P as PostgreSQL
  W->>A: POST /orders/{id}/confirm + version
  A->>D: ConfirmOrder(id, version, actor)
  D->>P: Begin Transaction
  D->>P: 受注状態とversion確認
  D->>P: 在庫を条件付きで減算
  D->>P: 状態CONFIRMED、移動履歴、監査保存
  P-->>D: Commit
  D-->>A: confirmed order
  A-->>W: 200 or 409/422
```

- DB行ロックまたは条件付き更新で在庫を守り、途中失敗時は全ロールバック。
- 状態変更と`version`条件一致を1トランザクションで保証。二重処理を防止。
- 金額は整数。`subtotal=sum(price×qty)`、`tax=floor(subtotal×10/100)`。請求は値のスナップショットから作成。

### 5.2 CSV取込（MVPは全件反映）

1. Windowsファイル選択→UTF-8 CSV読み込み。大容量を避けるため1万行/ファイル10MB上限（MVP規定）。
2. ヘッダーは`code,name,unitPriceJpy,initialStock`（新規商品のみ）。BOMあり・なしを許容し、区切りは`,`固定。
3. preview APIで全行検証、エラー位置と内容、検証ID/ハッシュを返す。
4. commit APIはプレビューIDとハッシュを要求。内容を再検証して一括DB反映。期限切れや他者による変更は拒否。
5. エラー1件でも全体反映0件。ロール・重複コード・異常値を検査。

### 5.3 PDF・印刷

- PDFはAPI側が**請求スナップショット**から生成し、クライアントがファイル保存/標準PDF表示を実行。
- 請求番号、宛先、品名、明細数量・単価、税、税込計、発行日時を含める。
- PDFの表示/印刷はシステムの標準アプリを起動。印刷実行自体のE2E合否は人手確認と切り分ける。
- PDF のライブラリは PDFsharp-MigraDoc（8.3 A2）。日本語のフォントは Windows に入っている物を実行時に使い、フォントのファイルを配らない。

## 6. 競合・例外・回復

- 古い`version`の保存は409、クライアントは最新取得/再編集を案内。
- timeout時のconfirm/invoiceは成功している可能性がある。リトライ前に受注/請求状態を再照会し、冪等性キーも検討。
- 外部ファイルパス・ユーザープロファイル名を監査や公開ログへ含めない。
- API障害では編集内容を画面上に残し、再操作の前にサーバー状態を確認する。

## 7. テストとビルド

| 試験種別 | 実行場所 | 方法・対象 | 期待 |
|---|---|---|---|
| Domain単体 | Windows/Linux可 | `dotnet test` / xUnit等 | NET-BR計算・遷移・境界値合格 |
| API統合 | Windows/Linux可 | PostgreSQL試験DB + HTTP | NET-AC-01～08、15 |
| ViewModel単体 | Windows（必要に応じ環境差を分離） | MVVMロジックのテスト | 入力・非同期状態・エラー表示 |
| UIスモーク | 対話Windowsセッション | FlaUI（UI Automation。8.3 A3） | 起動、主操作、DPI、フォーカス |
| CSV/PDF | API/Windows | CSV fixture、PDFの内容抽出と人間による表示確認 | NET-AC-09～11 |
| MSIXインストール | WindowsテストVM | MSIX生成、信頼設定、導入/削除 | NET-AC-12 |

- `dotnet build -warnaserror`、`dotnet test`、DBマイグレーション、API契約、CSV/PDF、Windows UI確認を区別する。
- CIはWindows runnerでDesktopをビルド。GUIテストは**対話セッションで成功した証拠が必要**であり、非対話CIで未実行なら`NOT RUN`と記録。
- 試験の DB は Windows のサービスの PostgreSQL 17 の `salesflow_net_test`（共通 §2.2）。テストの入口が毎回マイグレーションを当て直してシードを入れる。DB につながらないときは理由を 1 行出して `Result: FAIL`。
- ビルド成果物・MSIX・署名素材をGitのソース管理対象にしない。テストログは個人情報をマスク。

## 8. issue-driven-kit の当て方・詳細設計の単位

### 8.1 当て方（.NET 版のキットは作らない）

1.0 では .NET 版のキット（KIT-NET-01〜05）を新しく作る案だった。1.1 では、**キットの Node 版を入れ、テストの入口を広げて当てる**（共通 §3）。先に済ませるキットの準備は次のとおり（計画 4 章）。

| # | キット側の準備 | このアプリで要る理由 |
|---|---|---|
| P-1 | テストの入口が決めたコマンド（`dotnet build -warnaserror` と `dotnet test --logger junit` など）を回し、結果の XML を読んで `Result:` 行を出す。0 件は FAIL | `dotnet test` の合否を無人の回の合格の条件にする |
| P-2 | 点検（doctor）が `dotnet`・Windows App SDK を見る | 夜に「道具が無い」で落ちないように |
| P-6 | Node 版の `CLAUDE.md` のひな形と実行用の設定を、vitest などの前提から外す | .NET のリポジトリに Node の決まりが混ざらないように |

- 確認コマンドは ```` ```js ````（Node.js で `dotnet` を呼ぶ）。リポジトリには依存を持たない `package.json` を置く。
- 画面のスモークテスト（UI Automation）は、ログインしたままの画面が要る。その Issue を回す夜は Windows をロックしない。ロックされていて動かせないときは `NOT RUN` として FAIL にせず、Issue の合格の条件にも入れない（人が別に記録する）。

### 8.2 詳細設計の単位

Issue の並び（夜ごとの表）はこの文書に書かない。案件のリポジトリで、要件定義書とこの文書から Claude Code が作る（共通 §4.4）。

この基本設計だけで実装の Issue が書ける部分（テストの入口・ドメイン・スキーマ・シード）は、詳細設計を作らない。ほかは、下の単位ごとに**夜の「設計書を書く」Issue**（D 番号）で、実装の 1 晩前に詳細設計を書かせ、人が朝に読んで直す（共通 §3.2）。形は共通 §3.3。

| 単位 | 案件のリポジトリでのファイル | 中身（API・画面） | 受け持つ要件 |
|---|---|---|---|
| DD-01 API の共通と認証 | `docs/guides/working/detailed-design/dd-01-api-common-auth.md` | エラーの `code` の一覧・requestId・ログ・`/health/ready`・ロールの判定・ログイン・トークンの更新と失効・OpenAPI の契約の出し方 | NET-F-01・02・14、NET-BR-09、NET-AC-08・14 |
| DD-02 デスクトップの土台 | `docs/guides/working/detailed-design/dd-02-desktop-shell.md` | Shell・画面の移動・ViewModel の状態（4.1）・API の呼び出し・サインインの画面・資格情報の保持・テストのしかた（ViewModel の単体） | NET-UI-01・02、NET-F-11 |
| DD-03 マスターと在庫 | `docs/guides/working/detailed-design/dd-03-masters.md` | 顧客・商品・在庫の調整の API と画面 | NET-F-03〜05、NET-BR-01・07、NET-UI-03・04 |
| DD-04 受注 | `docs/guides/working/detailed-design/dd-04-orders.md` | 受注の下書き・確定・取消・同時更新の API と、明細のグリッドの画面 | NET-F-06・07、NET-BR-02〜05・07、NET-AC-01〜04・07 |
| DD-05 請求と PDF | `docs/guides/working/detailed-design/dd-05-invoices-pdf.md` | 請求書の発行・照会・PDF の中身と置き方・印刷の起動 | NET-F-08・09、NET-BR-06・10、NET-AC-05・06・11 |
| DD-06 CSV | `docs/guides/working/detailed-design/dd-06-csv.md` | 取り込み（preview・commit・ハッシュ）・受注一覧の書き出し・画面 | NET-F-10、NET-BR-08、NET-AC-09・10 |
| DD-07 監査・ホーム・配布 | `docs/guides/working/detailed-design/dd-07-audit-release.md` | 監査ログの API と画面・ホーム・画面のスモークテストの道具と項目・MSIX・README の目次 | NET-F-12〜14、NET-AC-12・13・15 |

### 8.3 決めた方式（詳細設計の前に決めておく）

1.1 の「使う技術と版」と一緒に、基本設計で決めておく（夜の Issue の中で決めさせない。共通 §1.2）。

| # | 決めたこと | 決定 | 選ばなかった案・理由 |
|---|---|---|---|
| A1 | 明細のグリッドに使う部品 | **WinUI 3 の標準の `ListView`（列は自前のテンプレート）**。外の表の部品を使わない | 外の DataGrid：WinUI 3 向けの手入れとライセンスが部品ごとに違い、UI Automation で操作できるかも揃わない |
| A2 | PDF を作るライブラリ | **PDFsharp-MigraDoc**（MIT）。日本語のフォントは Windows に入っている游ゴシックを実行時に使い、フォントのファイルを配らない | QuestPDF：会社の売上の額で有料のライセンスが要るため、公開の見本に向かない |
| A3 | 画面のスモークテストの道具 | **FlaUI**（`FlaUI.UIA3`。UI Automation） | WinAppDriver：手入れが止まっている |
| A4 | アクセストークンの形と保持 | JWT（`Microsoft.AspNetCore.Authentication.JwtBearer`）。アクセストークンは 15 分、更新トークンは 14 日でハッシュを DB に保存。クライアントは更新トークンを Windows の資格情報の保管（`PasswordVault`）に置く | — |
| A5 | MSIX の署名 | Windows App SDK の単一プロジェクトの MSIX と、開発用の自己署名証明書（作り方と信頼のさせ方を README に書く）。本番の署名は対象外 | — |
| A6 | CSV の読み書き | **CsvHelper** | 自前の解析：BOM・引用符の扱いを作り直すことになる |

## 9. デプロイ・運用

- API: `ASPNETCORE_ENVIRONMENT`、接続文字列など環境変数/秘密管理で分離。最低限`/health/ready`と構造化ログ。
- DB: PostgreSQLのバックアップ/復旧・migration forward/backward手順をREADMEで示す。サンプルでは本番自動運用を保証しない。
- Windows: MSIX配布テストは自己署名証明書による**開発機限定**の手順を示し、本番配布の署名要件と区別。
- バージョン: .NET SDK、Windows App SDK、NuGet、OSビルド番号を記録して再現可能にする。

## 10. トレーサビリティ・決定待ち

- NET-F-03/04/05→商品・顧客・在庫API→NET-UI-03/04→NET-AC-01～03。
- NET-F-06/07/08→受注/請求API→NET-UI-05/06/07→NET-AC-04～08。
- NET-F-09/10→PDF/CSV API→NET-UI-07/08→NET-AC-09～11。
- NET-F-13/14→CI/MSIX/診断→NET-AC-12～15。
- 使う物と版は 1.1、グリッド・PDF・MSIX の署名・UI のスモークの道具・トークンの方式は 8.3 で決めた（夜の Issue の中で決めさせない）。PostgreSQL の試験の DB は 7 章（Windows のサービス）。
