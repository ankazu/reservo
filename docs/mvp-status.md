# Reservo MVP 進度

> 最後更新：2026-08-02
>
> 這份文件是目前 MVP 的單一進度入口。每完成一個可驗證的功能切片，就更新本文件的狀態與下一步。

## 狀態說明

- ✅ 已完成：功能已實作，且有測試或可驗證的結果。
- 🟡 部分完成：核心邏輯已存在，但仍缺少 UI、持久化欄位、測試或營運流程。
- ⬜ 未開始：尚未實作。
- ⛔ MVP 不做：依目前 ADR 明確排除，不列入目前進度目標。

## 一眼看懂目前進度

目前已完成「搜尋可售房型 → 建立暫存訂房 → 確認／取消／過期」的後端核心流程，訂房摘要金額也已由 server-side quote 持久化，並有基本首頁 UI。

目前還不能稱為完整 MVP 的主要原因是：訂房詳情尚未接到前端頁面、API/E2E 測試與 PostgreSQL 驗證尚未完整落地。

## MVP 工作分區

### A. 專案基礎與資料模型

| 項目                                  | 狀態 | 說明                                                                       |
| ------------------------------------- | ---- | -------------------------------------------------------------------------- |
| Nuxt 單一專案結構                     | ✅   | 使用 Nuxt、Vue、TypeScript、Nitro。                                        |
| PostgreSQL + Drizzle                  | ✅   | 參見 `docs/adr/0001-persistence-decisions.md`。                            |
| `Property` / `RoomType` / `Room` 分離 | ✅   | 已有 schema 與 seed data。                                                 |
| `RoomInventory` 每日資料              | ✅   | `(room_type_id, stay_date)` 有唯一限制。                                   |
| 訂房與訂房項目快照                    | ✅   | `reservation_items` 保存房型、方案、價格快照；訂房摘要金額已持久化。       |
| 日期、幣別、時區政策                  | ✅   | 日期使用半開區間，MVP 時區為 `Asia/Taipei`，貨幣為 TWD。                   |

### B. 搜尋與庫存

| 項目                           | 狀態 | 說明                                                                    |
| ------------------------------ | ---- | ----------------------------------------------------------------------- |
| 半開日期 `[checkIn, checkOut)` | ✅   | 已有 shared helper 與測試。                                             |
| 晚數計算                       | ✅   | checkout 不計入住宿晚數。                                               |
| 可售數量公式                   | ✅   | `total - reserved - blocked`。                                          |
| Availability API               | ✅   | `GET /api/availability`。                                               |
| 伺服器端價格 quote             | ✅   | 價格來自 room type，不接受 client 自訂價格。                            |
| 動態 provisioning 缺少的日期   | ✅   | 根據房型實體 rooms 建立 inventory rows，使用 `ON CONFLICT DO NOTHING`。 |
| 管理員調整庫存                 | ⬜   | 尚無 blocked quantity 或每日庫存管理 API。                              |
| 管理員管理房型                 | ⬜   | 尚無房型新增、修改 API。                                                |

### C. 訂房生命週期

| 項目                                | 狀態 | 說明                                                                    |
| ----------------------------------- | ---- | ----------------------------------------------------------------------- |
| 建立 `PENDING_PAYMENT` hold         | ✅   | 在 transaction 中鎖庫存、檢查數量、增加 reserved quantity。             |
| Transaction rollback                | ✅   | 建立失敗時回滾庫存與訂房資料。                                          |
| 防止 concurrent overselling         | ✅   | 已有 PostgreSQL integration test；未設定 `DATABASE_URL` 時會跳過。      |
| Idempotency-Key                     | ✅   | 相同 key 可重複取得原訂房。                                             |
| Idempotency payload mismatch        | ✅   | fingerprint 不一致會回傳穩定錯誤。                                      |
| 確認訂房                            | ✅   | `PENDING_PAYMENT → CONFIRMED`，目前是假付款確認。                       |
| 取消訂房                            | ✅   | 支援 pending 與 confirmed 取消，庫存只釋放一次。                        |
| 訂房過期                            | ✅   | 支援單筆與 maintenance 批次過期。                                       |
| 依 ID 取得訂房詳情 API              | ✅   | `GET /api/reservations/:reservationId`，包含 item snapshots。           |
| 訂房總額持久化                      | ✅   | migrations `0005`/`0006` 保存並回填 `guest_count` 與 TWD 金額摘要；hold 建立時由 server-side quote 寫入。 |
| `guest_count` / `cancellable_until` | ✅   | `guest_count` 與 `cancellable_until` 已持久化；取消期限為入住日 00:00（Asia/Taipei）。 |
| 真正付款 provider                   | ⛔   | ADR 明確排除於目前 MVP；目前保留 fake confirmation。                    |

### D. 使用者介面與 API client

| 項目                       | 狀態 | 說明                                            |
| -------------------------- | ---- | ----------------------------------------------- |
| 搜尋表單                   | ✅   | 首頁可輸入入住、退房與人數。                    |
| 房型列表與可售狀態         | ✅   | 已串接 Availability API。                       |
| 建立訂房表單               | ✅   | 已串接 hold API。                               |
| 倒數與自動過期             | ✅   | 前端會在 hold 到期時呼叫 expire API。           |
| 確認／取消操作             | ✅   | 首頁已有基本操作。                              |
| API error code → i18n      | ✅   | 已有穩定錯誤碼與中英文訊息。                    |
| 訂房詳情頁／重新載入訂單   | ⬜   | GET API 已回傳總額與晚數摘要，但尚未有獨立頁面或 route。 |
| 房型資料由 API 提供        | ⬜   | 首頁房型仍是前端常數。                          |
| Loading、empty、error 狀態 | 🟡   | 主要流程已有，仍需完整覆蓋所有頁面與 API 狀態。 |

### E. 品質與交付

| 項目                                      | 狀態 | 說明                                                                  |
| ----------------------------------------- | ---- | --------------------------------------------------------------------- |
| Service 單元測試                          | ✅   | 目前 `npm test` 有 46 passed。                                        |
| PostgreSQL concurrency tests              | 🟡   | 測試已寫，尚未在設定 `DATABASE_URL` 的環境執行。                      |
| API route 行為測試                        | ⬜   | 尚未完整覆蓋 HTTP status 與 ApiResponse。                             |
| Reservation item historical snapshot test | ✅   | integration test 會直接讀取 PostgreSQL reservation 與 item rows 驗證摘要及歷史 snapshot。 |
| Playwright search-to-reservation          | ⬜   | 尚未加入。                                                            |
| CI 執行 test/build/format                 | ⬜   | 尚未設定 CI workflow。                                                |

## 目前不列入 MVP

以下不是「漏做」，而是刻意延後：

- ⛔ 使用者註冊、登入、session 與會員訂單列表
- ⛔ 真正金流 provider 與退款流程
- ⛔ Redis、microservices、workspace 拆分
- ⛔ 多旅館、多幣別、複雜優惠碼
- ⛔ 入住、退房、未入住狀態
- ⛔ audit logs、報表與渠道同步

## 下一個實作切片

下一步只處理一個可驗證目標：

### 訂房詳情前端頁面

完成定義：

1. 新增可由 reservation ID 載入的獨立訂房詳情 route/page。
2. 顯示房客、入住日期、晚數、房型快照、數量與 TWD 金額摘要。
3. 覆蓋 loading、not-found、API error 與已過期／已取消狀態。
4. 補上頁面與 API client/store 測試。
5. 更新本文件，把這個切片從 ⬜ 改成 ✅。

完成這個切片後，再做下一個文件中的 ⬜ 項目。

## 驗證指令

```bash
npm test
npm run format:check
npm run build
```

若要執行 PostgreSQL integration tests，需先設定 `DATABASE_URL`，否則相關測試會被 Vitest skip。
