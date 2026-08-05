# Reservo

Reservo 是單一住宿場所、單一幣別的訂房系統 MVP。應用程式使用 Nuxt、Vue、TypeScript、Nitro、PostgreSQL、Drizzle ORM、Zod 與 Vitest。

產品範圍、目前切片與完成條件以 [MVP 主計劃](docs/booking-system-plan.md) 為準；需要其他決策文件時，依 [文件入口](docs/README.md) 按需求載入。

## 系統需求

- Node.js 22.22.0
- npm 10.9.x
- PostgreSQL

Repository 使用 `package-lock.json`，唯一支援的 package manager 是 npm。若使用 nvm：

```bash
nvm install
nvm use
node --version
npm --version
```

預期版本為 Node.js `v22.22.0` 與 npm `10.9.x`。`.npmrc` 會拒絕不符合 `package.json#engines` 的安裝環境。

## 從空環境開始

### 1. 安裝 dependencies

```bash
npm ci
```

### 2. 建立 PostgreSQL database

先以有 `CREATEROLE`／`CREATEDB` 權限的 PostgreSQL 管理身分，建立專案專用的 local role 與 database：

```bash
createuser --login --pwprompt reservo_app
createdb --owner=reservo_app reservo
cp .env.example .env
```

`createuser` 會要求輸入 local password。接著把 `.env` 中的 `replace-with-local-password` 換成同一組密碼；若密碼含有 URI 特殊字元，必須先 percent-encode：

```dotenv
DATABASE_URL=postgresql://reservo_app:YOUR_LOCAL_PASSWORD@localhost:5432/reservo
RESERVATION_MAINTENANCE_SECRET=replace-with-a-long-random-secret
```

如果 PostgreSQL 安裝使用不同的管理 role、host 或 port，請以相同原則建立 application role／database，並讓 `DATABASE_URL` 與實際 credentials 完全一致。`npm run db:migrate` 同時是連線驗證；authentication 或 database 設定錯誤時必須先修正，不能略過 migration。

`.env` 只供本機使用，不得提交。正式環境必須透過 hosting platform 的 secret／environment 管理設定這兩個值。

### 3. 套用 migrations

```bash
npm run db:migrate
```

這會依 `drizzle.config.ts` 將 `db/migrations/` 內尚未執行的 Drizzle migrations 套用到 `DATABASE_URL` 指向的 database。

### 4. 啟動開發環境

```bash
npm run dev
```

預設網址是 `http://localhost:3000`。

## Database migration workflow

修改 `db/schema.ts` 後：

```bash
npm run db:generate
npm run db:check
```

接著：

1. Review 新增的 SQL、Drizzle snapshot 與 journal。
2. 確認 migration 能處理既有資料，不只處理空 database。
3. 在本機或 disposable database 執行 `npm run db:migrate`。
4. 執行相關 integration tests。
5. 將 schema、SQL 與 `db/migrations/meta/` 一起提交。

不要修改已經部署的 migration。需要修正時新增 forward migration；production migration 前應先備份並依部署 runbook 驗證。

## 驗證

日常快速回饋：

```bash
npm run typecheck:ui
npm test
```

提交前完整驗證：

```bash
npm run check
```

`npm run check` 依序執行：

1. `npm run format:check`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`

其中 `npm run typecheck` 使用 Nuxt 的完整 typecheck，涵蓋 application 與 server code；`typecheck:ui` 只是較快的局部檢查，不能取代完整驗證。

目前 PostgreSQL integration tests 在沒有 `DATABASE_URL` 時會顯示 skipped。公開部署前的 CI release gate 必須提供真實 PostgreSQL，並將必要 integration tests skipped 視為失敗；這項工作列在主計劃 Slice 3。

## 常用指令

| 指令                   | 用途                                  |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | 啟動 Nuxt development server          |
| `npm run build`        | 建立 production build                 |
| `npm run preview`      | 預覽 production build                 |
| `npm run db:generate`  | 根據 Drizzle schema 產生 migration    |
| `npm run db:check`     | 檢查 Drizzle migration metadata       |
| `npm run db:migrate`   | 對 `DATABASE_URL` 套用 migrations     |
| `npm run format`       | 使用 Prettier 格式化 repository       |
| `npm run format:check` | 檢查格式，不修改檔案                  |
| `npm run typecheck:ui` | 快速檢查 UI component 與 shared types |
| `npm run typecheck`    | 完整 Nuxt typecheck                   |
| `npm test`             | 執行 Vitest suite                     |
| `npm run check`        | 執行提交前完整驗證                    |

## Repository structure

```text
app/                  Nuxt pages、components、stores 與 client API
server/api/           Nitro HTTP route handlers
server/services/      Reservation、inventory 與 domain workflows
server/repositories/  PostgreSQL access 與 queries
shared/               Client／server 共用 schemas、types 與 utilities
db/                   Drizzle schema 與 migrations
locales/              Nuxt i18n messages
test/                 Unit、component、route 與 PostgreSQL integration tests
docs/                 主計劃、ADR 與 operation runbooks
```

## Reservation expiration

Production 必須定期呼叫受 secret 保護的 expiration endpoint，釋放逾時 hold 的庫存。設定方式與操作限制見 [Reservation expiration maintenance](docs/maintenance-expiration.md)。

## 目前限制

這是 guest-checkout MVP，目前不包含會員系統、真正 payment provider、Redis、多住宿場所、多幣別、複雜優惠或完整 admin platform。公開部署前仍需完成主計劃列出的 access token、request bounds、CI PostgreSQL、動態 room catalog、inventory operations 與 E2E slices。
