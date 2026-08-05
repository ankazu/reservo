type RateLimitOptions = {
  limit: number
  windowMs: number
  maxEntries?: number
}

type WindowEntry = {
  count: number
  resetsAt: number
  deduplicationKeys: Set<string>
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, WindowEntry>()

  constructor(private readonly options: RateLimitOptions) {}

  consume(
    key: string,
    now = Date.now(),
    deduplicationKey?: string,
  ): { allowed: boolean; retryAfter: number } {
    const current = this.entries.get(key)
    if (
      deduplicationKey &&
      current &&
      current.resetsAt > now &&
      current.deduplicationKeys.has(deduplicationKey)
    ) {
      return { allowed: true, retryAfter: 0 }
    }
    if (!current || current.resetsAt <= now) {
      this.makeRoom(now)
      this.entries.set(key, {
        count: 1,
        resetsAt: now + this.options.windowMs,
        deduplicationKeys: new Set(
          deduplicationKey ? [deduplicationKey] : undefined,
        ),
      })
      return { allowed: true, retryAfter: 0 }
    }

    if (current.count >= this.options.limit) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((current.resetsAt - now) / 1_000)),
      }
    }

    current.count += 1
    if (deduplicationKey) current.deduplicationKeys.add(deduplicationKey)
    return { allowed: true, retryAfter: 0 }
  }

  private makeRoom(now: number): void {
    const maxEntries = this.options.maxEntries ?? 10_000
    if (this.entries.size < maxEntries) return

    for (const [key, entry] of this.entries) {
      if (entry.resetsAt <= now) this.entries.delete(key)
    }
    if (this.entries.size < maxEntries) return

    const oldestKey = this.entries.keys().next().value as string | undefined
    if (oldestKey) this.entries.delete(oldestKey)
  }
}
