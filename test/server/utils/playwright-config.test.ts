import { describe, expect, it } from 'vitest'

import config from '../../../playwright.config'

describe('Playwright release-gate configuration', () => {
  it('maps application data-test attributes and serializes shared-state E2E tests', () => {
    expect(config.use).toMatchObject({ testIdAttribute: 'data-test' })
    expect(config.workers).toBe(1)
  })
})
