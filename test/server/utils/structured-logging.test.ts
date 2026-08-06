import { afterEach, describe, expect, it, vi } from 'vitest'

import { logStructured } from '../../../server/utils/structured-logging'

describe('structured logging', () => {
  afterEach(() => vi.restoreAllMocks())

  it('writes one machine-readable JSON event per log call', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    logStructured('info', {
      event: 'reservation_expiration_completed',
      expiredCount: 2,
      backlogCount: 0,
    })

    expect(info).toHaveBeenCalledWith(
      '{"event":"reservation_expiration_completed","expiredCount":2,"backlogCount":0}',
    )
  })
})
