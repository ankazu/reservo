/**
 * The MVP cancellation policy is intentionally independent of a property's
 * configured timezone. Keep the parsing offset named so date helpers do not
 * scatter an unexplained numeric offset.
 */
export const MVP_CANCELLATION_UTC_OFFSET = '+08:00'

export const MVP_TIME_ZONE = 'Asia/Taipei'
export const MAX_STAY_NIGHTS = 30
export const BOOKING_WINDOW_DAYS = 365
export const MAX_RESERVATION_BODY_BYTES = 8 * 1024
export const MAX_IDEMPOTENCY_KEY_BYTES = 128
export const MAX_REQUEST_FINGERPRINT_BYTES = 2 * 1024
export const HOLD_DURATION_MS = 15 * 60 * 1000
