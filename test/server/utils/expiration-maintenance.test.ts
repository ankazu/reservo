import { describe, expect, it, vi } from 'vitest'

import { runExpirationMaintenance } from '../../../scripts/run-expiration-maintenance'

describe('expiration maintenance runner', () => {
  it('retries transient failures and returns the verified monitoring report', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: {
            completedAt: '2026-08-06T08:00:00.000Z',
            expiredCount: 3,
            backlogCount: 1,
          },
        }),
      )

    await expect(
      runExpirationMaintenance({
        baseUrl: 'https://reservo.example',
        secret: 'secret',
        fetchImpl,
        wait: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toEqual({
      completedAt: '2026-08-06T08:00:00.000Z',
      expiredCount: 3,
      backlogCount: 1,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('fails when every retry is exhausted', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 500 }))
    await expect(
      runExpirationMaintenance({
        baseUrl: 'https://reservo.example',
        secret: 'secret',
        fetchImpl,
        wait: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('expiration maintenance failed after 3 attempts')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})
