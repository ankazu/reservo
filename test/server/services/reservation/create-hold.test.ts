import { describe, expect, it } from 'vitest'

import {
  assertMatchingFingerprint,
  ReservationServiceError,
} from '../../../../server/services/reservation/create-hold'

describe('reservation idempotency fingerprint guard', () => {
  it('rejects legacy rows without a fingerprint instead of accepting them', () => {
    expect(() =>
      assertMatchingFingerprint(null, 'current-fingerprint'),
    ).toThrow(
      new ReservationServiceError('IDEMPOTENCY_FINGERPRINT_UNAVAILABLE'),
    )
  })

  it('accepts only the exact stored fingerprint', () => {
    expect(() =>
      assertMatchingFingerprint('same-fingerprint', 'same-fingerprint'),
    ).not.toThrow()
    expect(() =>
      assertMatchingFingerprint('stored-fingerprint', 'different-fingerprint'),
    ).toThrow('IDEMPOTENCY_PAYLOAD_MISMATCH')
  })
})
