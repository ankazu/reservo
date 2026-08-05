import { describe, expect, it } from 'vitest'

import {
  createReservationAccessToken,
  hashReservationAccessToken,
  isReservationAccessTokenValid,
} from '../../../server/utils/reservation-access'

describe('reservation access credentials', () => {
  it('creates distinct 256-bit base64url tokens and stores only their hashes', () => {
    const first = createReservationAccessToken()
    const second = createReservationAccessToken()

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).not.toBe(first)
    expect(hashReservationAccessToken(first)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashReservationAccessToken(first)).not.toContain(first)
  })

  it('accepts only the token matching the stored hash', () => {
    const token = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const storedHash =
      '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a'

    expect(isReservationAccessTokenValid(token, storedHash)).toBe(true)
    expect(isReservationAccessTokenValid('B'.repeat(43), storedHash)).toBe(
      false,
    )
    expect(isReservationAccessTokenValid(token, null)).toBe(false)
  })
})
