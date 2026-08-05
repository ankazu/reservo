# Reservo 文件入口

本目錄採用「一份主計劃＋按需求載入的決策／操作文件」。不要為了取得專案背景而一次讀取所有文件。

## 唯一主文件

[booking-system-plan.md](booking-system-plan.md) 是 MVP 的唯一 source of truth，包含：

- 產品與技術範圍
- 核心領域規則
- 已完成基線與未完成需求
- 實作切片順序
- MVP Definition of Done

規劃新功能、決定下一步、檢查 MVP 缺口或更新進度時，只先讀這份文件的相關章節。

## 按需求載入

| 工作需求                                                         | 需要額外讀取的文件                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| ORM、migration、money、日期時區、guest checkout、付款或取消政策  | [ADR 0001](adr/0001-persistence-decisions.md)              |
| 修改 reservation idempotency 或 legacy migration                 | [ADR 0002](adr/0002-idempotency-fingerprint-legacy.md)     |
| 修改多房型 availability aggregation、partial results 或 retry UX | [ADR 0003](adr/0003-availability-search-failure-policy.md) |
| 部署或維護 reservation expiration scheduler                      | [Expiration maintenance](maintenance-expiration.md)        |

只讀與當前工作直接相關的文件。ADR 是已接受的決策，不是一般 backlog；若實作需要推翻 ADR，先新增或取代 ADR，再修改程式。

## 文件更新規則

- 功能範圍、進度、缺口、優先級與下一步：更新 `booking-system-plan.md`。
- 重大且難以逆轉的決策：新增 `docs/adr/NNNN-title.md`。
- 部署、排程或人工維護步驟：新增或更新對應 runbook。
- 暫時性 code review、研究筆記與一次性報告不屬於規格，不得作為實作依據；完成後應移出 canonical docs 或刪除。
- 不再建立獨立的 status、review 或 roadmap 文件，以免出現多個互相矛盾的進度來源。

## 建議閱讀順序

1. 先在主計劃找到目前切片與完成條件。
2. 依上表只載入該切片需要的 ADR 或 runbook。
3. 實作與驗證。
4. 完成後直接更新主計劃的狀態、驗證證據與下一個切片。
