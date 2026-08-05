import {
  getHeader,
  getRequestIP,
  getRequestWebStream,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from 'h3'

import type { ApiResponse } from '../../shared/types/api'
import { FixedWindowRateLimiter } from './request-rate-limit'

export const availabilityRateLimiter = new FixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
})
export const reservationLookupRateLimiter = new FixedWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
})
export const holdIpRateLimiter = new FixedWindowRateLimiter({
  limit: 5,
  windowMs: 15 * 60_000,
})
export const holdEmailRateLimiter = new FixedWindowRateLimiter({
  limit: 3,
  windowMs: 15 * 60_000,
})

export function getClientKey(event: H3Event): string {
  const trustProxy = process.env.RESERVO_TRUST_PROXY === 'true'
  return getRequestIP(event, { xForwardedFor: trustProxy }) ?? 'unknown-client'
}

export function enforceRateLimit(
  event: H3Event,
  limiter: FixedWindowRateLimiter,
  key: string,
  deduplicationKey?: string,
): ApiResponse<never> | undefined {
  const result = limiter.consume(key, Date.now(), deduplicationKey)
  if (result.allowed) return undefined

  setResponseStatus(event, 429)
  setResponseHeader(event, 'Retry-After', result.retryAfter)
  return {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'RATE_LIMITED' },
  }
}

export function enforceClientRateLimit(
  event: H3Event,
  limiter: FixedWindowRateLimiter,
  deduplicationKey?: string,
): ApiResponse<never> | undefined {
  return enforceRateLimit(event, limiter, getClientKey(event), deduplicationKey)
}

export async function readLimitedJsonBody(
  event: H3Event,
  maxBytes: number,
): Promise<
  { success: true; body: unknown } | { success: false; tooLarge: boolean }
> {
  const contentLength = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { success: false, tooLarge: true }
  }

  const stream = getRequestWebStream(event)
  if (!stream) return { success: false, tooLarge: false }
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let byteLength = 0
  let rawBody = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > maxBytes) {
      await reader.cancel('request body too large')
      return { success: false, tooLarge: true }
    }
    rawBody += decoder.decode(value, { stream: true })
  }
  rawBody += decoder.decode()

  try {
    return { success: true, body: JSON.parse(rawBody) as unknown }
  } catch {
    return { success: false, tooLarge: false }
  }
}

export function isHeaderWithinByteLimit(
  value: string,
  maxBytes: number,
): boolean {
  return new TextEncoder().encode(value).byteLength <= maxBytes
}
