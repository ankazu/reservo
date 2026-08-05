> ⚠️ **重要文件：請勿刪除**
>
> 這是 Reservo MVP 的唯一主計劃。產品範圍、目前進度、缺口、優先級、下一個切片與完成條件都在此維護。重大決策另記錄於 `docs/adr/`；文件載入方式見 [文件入口](README.md)。

# Reservo 訂房系統 MVP 主計劃

- 最後更新：2026-08-05
- 目前階段：公開 request 日期邊界與濫用防護已完成，下一步補齊 guest reservation access
- 唯一下一步：[Slice 2：Guest reservation access](#slice-2guest-reservation-access)

## 1. 目標與範圍

建立一個以 Nuxt、Vue、TypeScript 與 Nitro Server 為核心的訂房系統 MVP。第一版只支援：

- 單一 Nuxt application
- 單一住宿場所
- 單一幣別 TWD
- 固定 `Asia/Taipei` 業務時區
- Guest checkout
- 搜尋房型、建立暫存訂房、確認、取消、過期與查詢
- 假付款確認，不串接真正 payment provider

MVP 的成功標準不是功能數量，而是：搜尋與庫存結果正確、不超賣、重複請求不重複訂房、狀態轉換可預期、訂房資料不被未授權讀取，且核心流程能在 CI 與接近 production 的環境重現。

### 明確不在 MVP

- 會員註冊、登入、session 與會員訂單列表
- 真正 payment provider 與退款
- Redis、microservices、workspace 拆分
- 多住宿場所、多幣別
- 入住、退房、no-show
- 複雜優惠碼、報表、渠道同步
- audit logs
- 多金流 adapter

只有在出現實際需求時才加入額外抽象：第二個金流才抽 adapter；確認有快取或併發瓶頸才加入 Redis；需要獨立部署才拆 workspace；支援第二個住宿場所才擴充 Property 管理。

## 2. 技術基線

- Frontend：Vue 3、Nuxt、TypeScript、Pinia
- Backend：Nuxt Nitro Server、Node.js、TypeScript
- Database：PostgreSQL
- ORM／migration：Drizzle ORM、Drizzle Kit
- Validation：Zod
- i18n：Nuxt i18n，預設 `zh-TW`
- Tests：Vitest；核心使用者流程使用 Playwright
- Money：integer TWD amount，不用浮點數保存金額

完整 persistence、money、date/time、authentication boundary、payment 與 cancellation 決策見 [ADR 0001](adr/0001-persistence-decisions.md)。

## 3. 核心領域規則

### 3.1 領域概念

- `Property`：住宿場所；MVP 只有一個。
- `RoomType`：客人實際預訂的商品，例如雙人房。
- `Room`：實體房間，例如 101；MVP 不做入住分房。
- `RoomInventory`：某個 room type 在某個 stay date 的庫存。
- `Reservation`：一次訂房交易與生命週期。
- `ReservationItem`：房型、rate plan 與金額的歷史 snapshot。

`Property`、`RoomType`、`Room`、`RoomInventory`、`Reservation` 與 `ReservationItem` 必須保持為不同概念。Guest 預訂 `RoomType`，不是特定 `Room`。

### 3.2 日期

住宿日期採半開區間：

```text
[checkInDate, checkOutDate)
```

晚數是 checkout 與 check-in 的日期差；checkout 當天不占庫存。Stay date 是 `YYYY-MM-DD`，日期計算使用 UTC-normalized calendar values，業務邊界使用固定 `Asia/Taipei`。

公開 API 還必須補齊以下共同政策，且 availability 與 hold 使用同一份 schema／規則：

- check-in 不得早於台北今日
- 最大住宿晚數
- 最遠可預訂日期
- request 展開後的最大 inventory row 數

最大住宿晚數與 booking window 的數值在 Slice 1 決定並記入本節；建議預設分別為 30 晚與 365 天。

### 3.3 庫存

```text
available = total_quantity - reserved_quantity - blocked_quantity
```

`room_inventory` 必須對 `(room_type_id, stay_date)` 唯一。建立 hold 時，以下步驟必須在同一個 PostgreSQL transaction 完成：

1. 準備所有需要的 inventory rows。
2. Lock 每個 stay date 的 inventory row。
3. 驗證每晚 availability 都足夠。
4. 增加 `reserved_quantity`。
5. 建立 `PENDING_PAYMENT` reservation、`expiresAt` 與 item snapshot。
6. 任一步驟失敗即 rollback。

Cancellation 與 expiration 必須安全且可重複執行，庫存不得釋放超過一次。

### 3.4 訂房狀態

```text
PENDING_PAYMENT → CONFIRMED
PENDING_PAYMENT → EXPIRED
PENDING_PAYMENT → CANCELLED
CONFIRMED       → CANCELLED
```

狀態只有：

```ts
type ReservationStatus =
  'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'
```

取消期限保存在 `reservations.cancellable_until`。MVP 固定使用入住日 `Asia/Taipei` 00:00，且只有嚴格早於該 timestamp 才能取消。詳細 migration 限制見 ADR 0001。

### 3.5 Idempotency

建立訂房必須支援 `Idempotency-Key`。相同 key 與相同 canonical payload 回傳原訂房；相同 key 與不同 payload 必須回傳穩定 conflict error，不得建立第二筆訂房。

Legacy fingerprint 規則見 [ADR 0002](adr/0002-idempotency-fingerprint-legacy.md)。目前 client 額外傳送 `X-Request-Fingerprint`；是否移除這個重複契約列入 P2，server 無論如何都必須根據 validated body 計算 canonical fingerprint。

### 3.6 Availability aggregation

成功但 `available: false` 的房型仍是完整搜尋結果的一部分。只要任一房型 request reject，整次搜尋失敗，不顯示 partial room list，並提供 retry。詳細規則見 [ADR 0003](adr/0003-availability-search-failure-policy.md)。

### 3.7 Reservation snapshot 與價格

`ReservationItem` 保存 room-type name、rate-plan name、nightly price、taxes、discounts 與 quantity snapshot；reservation 保存 subtotal、taxes、discounts 與 total summary。

目前 MVP 實作是整段住宿使用相同 `nightly_price`，taxes 與 discounts 為 0。Seasonal／逐晚價格不在目前已完成範圍；若要加入，必須先決定 JSONB breakdown 或 reservation-item-night model，再更新本節與 ADR。

## 4. 程式邊界與 API 慣例

### 4.1 模組責任

```text
Page / Component
  → Pinia Store
  → Feature API module
  → Nuxt $fetch
  → Nitro API route
  → Service
  → Repository
  → PostgreSQL
```

- Page／component 不處理 HTTP 細節。
- Store 協調 UI state 與 feature workflow。
- Feature API module 負責 URL、headers 與 response decoding。
- API route 只翻譯 HTTP input／output。
- Business rules 與 transaction 放在 `server/services`。
- Database queries 放在 `server/repositories`。
- Shared schemas 與 types 放在 `shared/`。

### 4.2 Response shape

```ts
type ApiResponse<T> =
  | { success: true; data: T }
  | {
      success: false
      error: {
        code: string
        message: string
        details?: unknown
      }
    }
```

External input 使用 Zod。API error code 與 message 保持 language-neutral，不回傳 raw database errors；client 用 error code 查找 i18n message。

### 4.3 目前 routes

```text
GET  /api/availability
POST /api/reservations
GET  /api/reservations/:reservationId
POST /api/reservations/:reservationId/confirm
POST /api/reservations/:reservationId/cancel
POST /api/reservations/:reservationId/expire
POST /api/internal/reservations/expire
```

Planned routes：

```text
GET /api/property
GET /api/room-types
```

在 Slice 3 完成前，首頁仍依賴固定 seed room-type UUID。沒有列在本節的 auth、payment、admin routes 不屬於目前 MVP 契約。

## 5. 目前完成基線

### 已完成

- Nuxt 單一 application 與 i18n 基礎
- PostgreSQL、Drizzle schema 與 migrations
- `Property`／`RoomType`／`Room` 分離
- 每日 `RoomInventory` 與唯一限制
- 半開日期、晚數與 availability 計算
- Server-side flat nightly price quote
- 動態建立缺少的 inventory rows
- Transactional `PENDING_PAYMENT` hold
- Inventory row locks 與 rollback
- Idempotency key、payload fingerprint 與 legacy migration policy
- Confirm、cancel、single expiration 與 maintenance batch expiration
- Cancellation／expiration exactly-once inventory release
- Reservation 與 item snapshots、price summary、guest count、cancellable deadline
- Reservation details API
- 首頁搜尋、availability、hold、倒數、confirm、cancel、retry 與簡易 lookup UI
- Error code 到 `zh-TW`／`en` i18n
- Availability 與 hold 共用日期政策（台北今日、30 晚、365 天 booking window）
- Availability、reservation lookup 與 hold 的 application-level rate limit
- Hold request 8 KiB body、128-byte idempotency key 與 30-row expansion 上限

### 目前驗證證據

- 2026-08-05：Vitest 71 passed、10 skipped。
- 被 skipped 的 10 個 tests 需要真實 `DATABASE_URL`，包含重要 PostgreSQL integration coverage，因此不算 release verification。
- UI 局部 typecheck 已存在，但沒有覆蓋完整 pages、stores、server 與 tests。
- 尚無 CI、完整 Playwright flow 與可重現的 production deployment verification。

## 6. 未完成需求與執行順序

一次只執行一個 slice。每個 slice 必須有明確 public seam、focused tests、完成條件與主計劃更新；不要同時展開後續 slice。

### Slice 0：文件與開發環境基線

優先級：P0；狀態：✅ 完成（2026-08-05）。

- 對齊 README、Node.js 版本與唯一 package manager。
- 增加 database setup 與 migration scripts。
- 新增完整 `nuxt typecheck`，保留局部 typecheck 只作快速回饋。
- 統一 local 與 CI 將使用的驗證指令。

完成條件：新開發者可只依 README，從空環境建立資料庫、套用 migrations、啟動專案並執行完整驗證。

驗證證據：

- `.nvmrc` 固定 Node.js 22.22.0，npm 固定為 10.9.x，且不符合 engines 時拒絕安裝。
- README 已記錄 npm-only setup、PostgreSQL database、Drizzle migration workflow 與統一驗證方式。
- `db:generate`、`db:check`、`db:migrate`、完整 `typecheck` 與 `check` scripts 已建立。
- 完整 Nuxt typecheck 已涵蓋並修正先前未檢查的 pages、API client、server routes 與 Drizzle transaction types。

### Slice 1：日期邊界與 request abuse 防護

優先級：P0；狀態：✅ 完成（2026-08-05）。

- 決定並實作最大住宿晚數與 booking window。
- Server 拒絕過去入住日期與過大日期範圍。
- Availability 與 hold 共用相同日期政策。
- 限制 request body、`Idempotency-Key` 與展開 inventory rows 的大小。
- 對 availability、lookup 與 hold 加入 hosting／proxy rate limit。
- 定義同一 IP／email 的短時間 hold 防濫用策略，不為此引入 Redis。

完成條件：匿名 request 無法建立過去訂房、展開無界 inventory rows，或用大量 holds 長時間占滿庫存而完全無限制。

驗證證據：

- Availability 與 hold route 在每次 request 以 `Asia/Taipei` 今日建立同一份 Zod date policy；拒絕過去入住、超過 30 晚與超過 365 天 booking window。
- 單一房型 request 最多展開 30 個 inventory rows；hold body 上限 8 KiB，idempotency key 上限 128 bytes。
- Application layer 對 availability（60／分鐘／IP）、lookup（30／分鐘／IP）、hold（5／15 分鐘／IP、3／15 分鐘／normalized email）回傳一致的 `429 RATE_LIMITED` 與 `Retry-After`。
- Rate-limit state 刻意維持 process-local，不加入 Redis；`deploy/nginx/reservo.conf` 提供 production Node server 的 proxy rate-limit 與可信 client IP 基線。
- Focused schema、HTTP guard 與 limiter tests 已涵蓋共同日期政策、declared／streamed body 上限、header 上限、idempotent replay、window reset 與 client isolation。

### Slice 2：Guest reservation access

優先級：P0；狀態：下一步；實作前先新增 ADR。

- 建立高 entropy reservation access token。
- API 只回傳一次明文 token，database 只保存 hash。
- Lookup 與 cancel 同時驗證 reservation ID 與 token。
- Confirm 視為付款／內部操作，不保留無保護的公開 mutation。
- 建立訂房後提供可複製的安全詳情連結。
- Token 不得出現在 server logs。
- 測試 missing、invalid、wrong-reservation token 與 PII 不外洩。

完成條件：只知道 reservation UUID 無法讀取 guest PII 或改變訂房狀態；沒有會員帳號的 guest 仍能安全保存並重新開啟訂房。

### Slice 3：CI 與真實 PostgreSQL release gate

優先級：P0；狀態：未開始。

- CI 啟動與 production major version 相同的 PostgreSQL。
- 從空資料庫套用全部 migrations。
- 強制執行 concurrency、idempotency、expiration 與 migration tests，不得 skip。
- 執行 format check、完整 typecheck、unit／integration tests 與 production build。
- 必要 tests skipped 時讓 CI 失敗。

完成條件：不超賣、idempotency、狀態轉換與 exactly-once inventory release 在真實 PostgreSQL CI 中持續通過。

### Slice 4：動態 property 與 room-type catalog

優先級：P1；狀態：未開始。

- 增加 read-only property／room-type API。
- 移除首頁硬編碼 room-type UUID。
- 決定由單一 aggregated availability endpoint 或現有 client aggregation 提供完整結果。
- 保留 ADR 0003 all-or-nothing failure policy。
- 明確處理 Room 增減後既有 inventory `total_quantity` 的同步政策。

完成條件：新增、移除或重新 seed room type 不需要修改首頁程式碼。

### Slice 5：受保護的訂房詳情頁

優先級：P1；狀態：未開始；依賴 Slice 2。

- 新增獨立 route，以 reservation ID 與 access token 載入。
- 顯示 guest、日期、晚數、room-type snapshot、rate-plan snapshot、quantity 與 TWD summary。
- 覆蓋 loading、not-found、unauthorized、API error、expired 與 cancelled。
- 補 page、store 與 API client tests。

完成條件：重新載入或分享正確安全連結仍能取得訂房；錯誤與終止狀態完整呈現。

### Slice 6：最低限度庫存營運

優先級：P1；狀態：未開始；實作前記錄操作與授權邊界。

- 提供查看指定日期 reserved／blocked／available 的方式。
- 提供安全、可驗證的 block／unblock 操作。
- 可以是受保護 internal API、簡單 admin page 或有 runbook 的 CLI；不必建立完整 admin platform。
- 操作不得讓 quantity 為負或超過 total。

完成條件：住宿方能在不直接手改資料表的情況下處理維修、停售與恢復庫存。

### Slice 7：API、E2E 與營運驗證

優先級：P1；狀態：未開始。

- 補齊所有 public routes 的 HTTP status 與 `ApiResponse<T>` tests。
- Playwright：搜尋 → hold → 安全詳情頁 → confirm／cancel。
- 驗證 expiration scheduler、secret、retry 與 backlog。
- 補 migration／deployment runbook、health checks 與 structured logging。
- 監控 scheduler 最後成功時間、每次 expired 數量與 backlog。

完成條件：核心流程能在接近 production 的環境自動驗證，部署後能察覺 database、migration 或 expiration scheduler 失效。

### P2：完成公開 MVP 前評估

- PostgreSQL check constraints：quantity 非負、reserved + blocked 不超過 total、guest count 與日期有效、金額 invariant 成立。
- 決定移除或保留 client `X-Request-Fingerprint`，避免不必要的雙重 canonicalization 契約。
- 若固定 nightly price 不再足夠，先設計逐晚價格 snapshot，再加入 seasonal pricing。

## 7. MVP Definition of Done

只有全部符合才標示為可公開部署的 MVP：

- [ ] 未持有有效 access token 的使用者不能讀取或修改訂房。
- [ ] Server 拒絕過去入住、無界住宿期間與超出 booking window 的 request。
- [ ] Availability 與 hold 有合理 rate limit 與 hold abuse 防護。
- [ ] 搜尋、hold、confirm、cancel、expire 的狀態與庫存結果正確。
- [ ] 相同 idempotency key 不建立重複訂房，不同 payload 被拒絕。
- [ ] Cancellation 與 expiration 只釋放一次庫存。
- [ ] 房型 catalog 不依賴前端硬編碼 database UUID。
- [ ] 住宿方有最低限度的 inventory block／unblock 操作方式。
- [ ] 所有 migrations 可從空資料庫成功執行。
- [ ] PostgreSQL concurrency 與 lifecycle tests 在 CI 實際執行且通過。
- [ ] 完整 typecheck、format check、tests 與 production build 通過。
- [ ] Playwright 核心訂房流程通過。
- [ ] Expiration scheduler 已部署，並可觀察最後成功時間與 backlog。
- [ ] README 可讓新開發者重現開發、database 與驗證環境。
- [ ] 本文件的目前狀態、routes、驗證數字與實作一致。

## 8. 驗證指令目標

Slice 0 完成後，repository 應提供一致 scripts；目標 release verification 為：

```bash
npm ci
npm run db:migrate
npm run format:check
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
```

在 CI 中，integration tests 缺少 `DATABASE_URL` 或被 skipped 必須視為設定錯誤，而不是成功。

## 9. 進度更新規則

每完成一個 slice：

1. 將該 slice 狀態改為完成並附驗證證據。
2. 將下一個 slice 標示為唯一下一步。
3. 更新「目前完成基線」與 routes。
4. 若改變重大決策，新增或取代 ADR。
5. 不建立新的 status、review 或 roadmap 文件。
