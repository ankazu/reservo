import { describe, expect, it } from 'vitest'

import en from '../../locales/en.json'
import zhTW from '../../locales/zh-TW.json'

describe('reservation ID label translations', () => {
  it('keeps the label and punctuation in each locale value', () => {
    expect(zhTW.reservation.idLabel).toBe('訂房編號：')
    expect(en.reservation.idLabel).toBe('Reservation ID:')
  })
})
