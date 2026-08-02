> ⚠️ **重要文件：請勿刪除**
>
> 這是 Reservo 初始訂房系統 MVP 規劃文件。若需調整內容，請直接更新並保留此文件；重大架構決策請另外記錄在 `docs/adr/`。

# 訂房系統 MVP 規劃

## 目標

建立一個以 Nuxt、Vue、TypeScript 與 Nitro Server 為核心的訂房系統 MVP。

第一版以單一 Nuxt 專案、單一住宿場所、單一幣別為範圍，優先完成可靠的房型搜尋、庫存控管與訂房流程。

## 技術方向

- 前端：Vue 3、Nuxt、TypeScript
- 後端：Nuxt Nitro Server、Node.js、TypeScript
- 資料庫：PostgreSQL
- ORM：Drizzle ORM 或 Prisma，實作時擇一
- 輸入驗證：Zod
- 測試：Vitest；重要使用者流程再加入 Playwright

MVP 不使用 Redis，也不拆分成微服務或多個 workspace package。Nitro 的 `server/` 直接提供後端 API。

## 核心領域概念

### Property

住宿場所，例如旅館或民宿。MVP 先假設系統只有一個 Property。

### RoomType

可販售的房型，例如雙人房、家庭房。客人訂的是房型，不是特定房號。

### Room

住宿場所中的實體房間，例如 101、102。MVP 保留此概念，但實體房間的分配可以延後到入住前或入住時。

### RoomInventory

某個房型在某一天的庫存資料。可售數量計算如下：

```text
available = total_quantity - reserved_quantity - blocked_quantity
```

### Reservation

一次訂房交易，包含入住人、日期、狀態與總金額。

### ReservationItem

訂房中的房型與價格快照。需要保存房型名稱、方案名稱、每晚價格、稅金、折扣等資料，避免日後修改房型或價格時影響歷史訂單。

## 日期規則

住宿日期使用半開區間：

```text
[checkInDate, checkOutDate)
```

入住日包含在住宿期間，退房日不包含。例如 6 月 1 日入住、6 月 3 日退房，實際住宿晚數是 6 月 1 日與 6 月 2 日，共 2 晚。

## 訂房狀態

MVP 先使用以下狀態：

```ts
type ReservationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
```

狀態轉換：

```text
PENDING_PAYMENT → CONFIRMED
PENDING_PAYMENT → EXPIRED
PENDING_PAYMENT → CANCELLED
CONFIRMED       → CANCELLED
```

取消規則：`reservations.cancellable_until` 保存取消期限；MVP 固定使用
`Asia/Taipei`，期限是入住日台北時間 00:00，且必須嚴格早於該 timestamp
才可取消。這項政策不使用 `properties.timezone`，因此 property 的 timezone
設定不會改變新訂單或歷史訂單的取消期限。已存在的資料若曾依 property
timezone 計算，需由 corrective migration 正規化為此 MVP policy。

後續若加入入住、退房或未入住流程，再新增 `CHECKED_IN`、`CHECKED_OUT`、`NO_SHOW`。

## 核心訂房流程

```text
搜尋可售房型
  → 建立暫存訂房
  → 鎖定指定日期的庫存
  → 建立 PENDING_PAYMENT 訂房
  → 付款成功後改為 CONFIRMED
  → 付款逾時後改為 EXPIRED 並釋放庫存
```

### 防止超賣

建立暫存訂房時，必須在同一個 PostgreSQL transaction 中完成：

1. 取得指定房型、指定日期的 `room_inventory` row lock。
2. 檢查每晚的 `available` 是否足夠。
3. 增加 `reserved_quantity`。
4. 建立 `PENDING_PAYMENT` 訂房與 `expiresAt`。
5. 任一步驟失敗就 rollback。

`room_inventory` 必須先建立好每個「房型 + 日期」的資料列，才能可靠地使用 row lock 防止併發超賣。

同一個訂房請求應支援 `Idempotency-Key`，避免使用者重複點擊造成重複訂單。

## 初步資料表

```text
properties
room_types
rooms
room_inventory
users
guests
reservations
reservation_items
payments
```

`reservations` MVP 重要欄位：

```text
id
user_id
status
check_in_date
check_out_date
guest_count
total_amount
cancellable_until
expires_at
created_at
updated_at
```

`room_inventory` MVP 重要欄位：

```text
room_type_id
stay_date
total_quantity
reserved_quantity
blocked_quantity
```

建議對以下欄位建立唯一限制：

```text
(room_type_id, stay_date)
```

## API 方向

### 公開功能

```text
GET  /api/properties
GET  /api/properties/:propertyId/availability
GET  /api/room-types/:roomTypeId
POST /api/reservations/holds
POST /api/reservations/:id/payment
GET  /api/reservations/:id
POST /api/reservations/:id/cancel
```

### 使用者功能

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/me
GET  /api/me/reservations
```

### 管理功能

```text
POST  /api/admin/room-types
PATCH /api/admin/room-types/:id
PATCH /api/admin/inventory
GET   /api/admin/reservations
```

統一回應格式：

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

## 建議目錄結構

```text
app/
├─ pages/
├─ components/
├─ composables/
├─ server/
│  ├─ api/
│  ├─ services/
│  ├─ repositories/
│  └─ utils/
├─ shared/
│  ├─ types/
│  └─ schemas/
└─ db/
```

API route 只負責處理 HTTP 輸入與輸出；庫存計算、狀態轉換與訂房交易邏輯集中在 `server/services`，資料庫查詢集中在 `server/repositories`。

建議先形成幾個小而清楚的模組介面：

```ts
createReservationHold(input)
confirmReservation(input)
cancelReservation(input)
expireReservation(input)
```

## MVP 保留項目

以下項目是真正影響訂房正確性與資料一致性的核心，第一版保留：

- 半開日期區間 `[checkInDate, checkOutDate)`
- `RoomType` 與 `Room` 分離
- `room_inventory` 每日庫存
- `available` 計算邏輯
- `reservation_items` 訂單快照
- 暫存訂房與 `expiresAt`
- PostgreSQL transaction 與 row lock
- 統一的 `ApiResponse<T>`
- 簡化版 `ReservationStatus` 狀態機

## 刪除或延後項目

### 不在 MVP 實作

- pnpm workspace 與獨立 `packages/`：改為單一 Nuxt 專案。
- Redis：先使用 PostgreSQL transaction 與 row lock；只有效能需求出現後再加入。
- 多金流 `PaymentGateway` 抽象：先串接一個金流，甚至可以先用假付款流程。
- 多幣別、多語言、多旅館：先固定單一住宿場所與單一幣別。
- `audit_logs`：日後需要營運追蹤或合規時再加入。
- `CancellationPolicy` 獨立資料表：先使用 `reservations.cancellable_until`。
- 入住、退房、未入住狀態：MVP 先不處理現場營運流程。
- 複雜優惠碼、報表、渠道同步：等核心訂房流程穩定後再評估。

### 延後的判斷原則

只有在出現實際需求時才加入額外抽象：

- 有第二個金流商，才抽出金流 Adapter。
- 有快取或併發效能瓶頸，才加入 Redis。
- 有第二個應用程式或需要獨立部署，才拆 workspace package。
- 有多個住宿場所，才引入完整的 Property 管理模型。

## MVP 開發順序

1. 建立 Nuxt、Nitro、TypeScript 與 PostgreSQL 基礎環境。
2. 建立房型、房間與每日庫存資料表。
3. 完成房型與可售庫存管理。
4. 完成日期搜尋與價格計算。
5. 完成暫存訂房、transaction、row lock 與逾時釋放。
6. 完成假付款或單一金流流程。
7. 完成訂房查詢與取消。
8. 補上核心服務的單元測試與訂房流程的整合測試。
