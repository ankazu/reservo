/**
 * The MVP cancellation policy is intentionally independent of a property's
 * configured timezone. Keep the parsing offset named so date helpers do not
 * scatter an unexplained numeric offset.
 */
export const MVP_CANCELLATION_UTC_OFFSET = '+08:00'
