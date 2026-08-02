export class AppError extends Error {
  readonly cancelled: boolean

  constructor(
    readonly code: string,
    readonly details?: unknown,
    options?: { cancelled?: boolean; cause?: unknown },
  ) {
    super(code)
    this.name = 'AppError'
    this.cancelled = options?.cancelled ?? false
    this.cause = options?.cause
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof AppError && error.cancelled) ||
    (error instanceof DOMException && error.name === 'AbortError')
  )
}
