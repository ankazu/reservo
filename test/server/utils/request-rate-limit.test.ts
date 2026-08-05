import { describe, expect, it } from 'vitest'

import { FixedWindowRateLimiter } from '../../../server/utils/request-rate-limit'

describe('request rate limiting', () => {
  it('rejects requests after the configured limit until the window expires', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1_000 })

    expect(limiter.consume('guest', 0)).toEqual({
      allowed: true,
      retryAfter: 0,
    })
    expect(limiter.consume('guest', 100)).toEqual({
      allowed: true,
      retryAfter: 0,
    })
    expect(limiter.consume('guest', 200)).toEqual({
      allowed: false,
      retryAfter: 1,
    })
    expect(limiter.consume('guest', 1_001)).toEqual({
      allowed: true,
      retryAfter: 0,
    })
  })

  it('tracks different client keys independently', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 })

    expect(limiter.consume('ip:one', 0).allowed).toBe(true)
    expect(limiter.consume('ip:one', 1).allowed).toBe(false)
    expect(limiter.consume('ip:two', 1).allowed).toBe(true)
  })

  it('does not charge repeated idempotent requests to the quota', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1_000 })

    expect(limiter.consume('guest', 0, 'hold-1').allowed).toBe(true)
    expect(limiter.consume('guest', 1, 'hold-1').allowed).toBe(true)
    expect(limiter.consume('guest', 2, 'hold-2').allowed).toBe(false)
    expect(limiter.consume('guest', 1_001, 'hold-1').allowed).toBe(true)
    expect(limiter.consume('guest', 1_002, 'hold-2').allowed).toBe(false)
  })
})
