/**
 * The MVP cancellation policy is intentionally independent of a property's
 * configured timezone. Keep the timezone and its UTC offset together so date
 * helpers do not scatter an unexplained numeric offset.
 */
export const MVP_CANCELLATION_TIMEZONE = 'Asia/Taipei'
export const MVP_CANCELLATION_TIMEZONE_OFFSET = '+08:00'
