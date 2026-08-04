import { describe, expect, it } from 'vitest'

import en from '../../locales/en.json'
import zhTW from '../../locales/zh-TW.json'

describe('localized UI contracts', () => {
  it('keeps the label and punctuation in each locale value', () => {
    expect(zhTW.reservation.idLabel).toBe('訂房編號：')
    expect(en.reservation.idLabel).toBe('Reservation ID:')
  })

  it('provides an explicit availability retry action', () => {
    expect(zhTW.search.retry).toBe('重試搜尋')
    expect(en.search.retry).toBe('Retry search')
  })
})
