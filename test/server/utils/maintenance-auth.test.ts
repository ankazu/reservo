import { describe, expect, it } from 'vitest'

import { isMaintenanceSecretValid } from '../../../server/utils/maintenance-auth'

describe('maintenance authentication', () => {
  it('accepts only the configured secret', () => {
    expect(isMaintenanceSecretValid('secret', 'secret')).toBe(true)
    expect(isMaintenanceSecretValid('wrong', 'secret')).toBe(false)
    expect(isMaintenanceSecretValid(undefined, 'secret')).toBe(false)
    expect(isMaintenanceSecretValid('secret', undefined)).toBe(false)
  })
})
