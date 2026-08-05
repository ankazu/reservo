import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getHeader, type H3Event } from 'h3'

const ACCESS_TOKEN_BYTES = 32
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function createReservationAccessToken(): string {
  return randomBytes(ACCESS_TOKEN_BYTES).toString('base64url')
}

export function hashReservationAccessToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isReservationAccessTokenValid(
  token: string,
  storedHash: string | null,
): boolean {
  if (!storedHash || !ACCESS_TOKEN_PATTERN.test(token)) return false
  const actual = Buffer.from(hashReservationAccessToken(token), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function getReservationAccessToken(event: H3Event): string | undefined {
  const authorization = getHeader(event, 'authorization')
  if (!authorization?.startsWith('Bearer ')) return undefined
  const token = authorization.slice('Bearer '.length)
  return ACCESS_TOKEN_PATTERN.test(token) ? token : undefined
}
